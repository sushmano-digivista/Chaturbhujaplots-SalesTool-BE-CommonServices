'use strict'
/**
 * questionnaire.service.js
 *
 * State-machine engine for the WhatsApp auto-questionnaire.
 * Works with BOTH Meta Cloud API and Twilio sandbox providers.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  FLOW                                                    │
 * │                                                          │
 * │  [New user / "hi"] → WELCOME                             │
 * │       ↓  (sends project list)                           │
 * │  AWAIT_PROJECT  ← user picks project or "Any"            │
 * │       ↓  (sends visit time options)                     │
 * │  AWAIT_VISIT   ← user picks time slot or "Skip"          │
 * │       ↓  (sends callback time options)                  │
 * │  AWAIT_CALLBACK← user picks callback slot or "Skip"      │
 * │       ↓  (sends brochure PDF(s) + thank-you)            │
 * │  BROCHURE_SENT  → DONE                                   │
 * └──────────────────────────────────────────────────────────┘
 */
const WhatsappSession = require('../models/whatsapp-session.model')
const {
  sendText,
  sendInteractiveList,
  sendInteractiveButtons,
  sendDocument,
  normalisePhone,
} = require('./whatsapp-sender')
const { sanitizeText } = require('../utils/sanitize')

// ── Project catalogue ─────────────────────────────────────────────────────────
const PROJECTS = [
  { id: 'anjana',  title: 'Anjana Paradise',    description: 'Paritala · Near Amaravati · 242 plots'       },
  { id: 'aparna',  title: 'Aparna Legacy',      description: 'Chevitikallu · 273 plots'                    },
  { id: 'varaha',  title: 'Varaha Virtue',      description: 'Pamarru · Near NH-16 · 132 plots'            },
  { id: 'trimbak', title: 'Trimbak Oaks',       description: 'Penamaluru · Near Vijayawada · Coming soon'  },
  { id: 'any',     title: 'Any / All Projects', description: 'Send me all brochures'                       },
]

// ── Brochure PDFs ─────────────────────────────────────────────────────────────
const BROCHURES = {
  anjana:  { url: 'https://chaturbhuja.in/brochures/Anjana_Paradise_Brochure.pdf',  filename: 'Anjana_Paradise_Brochure.pdf',  caption: '📄 Anjana Paradise — Paritala, Near Amaravati' },
  aparna:  { url: 'https://chaturbhuja.in/brochures/Aparna_Legacy_Brochure.pdf',   filename: 'Aparna_Legacy_Brochure.pdf',    caption: '📄 Aparna Legacy — Chevitikallu'                },
  varaha:  { url: 'https://chaturbhuja.in/brochures/Varaha_Virtue_Brochure.pdf',   filename: 'Varaha_Virtue_Brochure.pdf',    caption: '📄 Varaha Virtue — Pamarru, Near NH-16'        },
  trimbak: { url: 'https://chaturbhuja.in/brochures/Trimbak_Oaks_Brochure.pdf',   filename: 'Trimbak_Oaks_Brochure.pdf',    caption: '📄 Trimbak Oaks — Penamaluru (Coming Soon)'    },
}

const VISIT_TIMES = [
  { id: 'visit_morning',   title: 'Morning (9am–12pm)'   },
  { id: 'visit_afternoon', title: 'Afternoon (12pm–4pm)' },
]
const CALLBACK_TIMES = [
  { id: 'cb_morning',   title: 'Morning (9am–12pm)'   },
  { id: 'cb_afternoon', title: 'Afternoon (12pm–4pm)' },
]

const OWNER_PHONE = process.env.OWNER_PHONE || '918977262683'

// ── Extract message from Meta OR Twilio payload ───────────────────────────────
function extractMessage(payload) {
  const type = payload?.type

  if (type === 'text') {
    return { kind: 'text', text: payload.text?.body?.trim() || '' }
  }

  if (type === 'interactive') {
    // Meta: button_reply or list_reply
    const reply = payload.interactive?.button_reply || payload.interactive?.list_reply
    if (reply) return { kind: 'reply', id: reply.id || '', text: reply.title || '' }
  }

  // Twilio numbered reply: webhook pre-built _visit / _callback alternatives
  if (payload._visit || payload._callback) {
    const main = payload.interactive?.list_reply
    return {
      kind: 'reply',
      id:   main?.id   || '',
      text: main?.title || '',
      _visit:    payload._visit,
      _callback: payload._callback,
    }
  }

  return { kind: 'other', text: '' }
}

// ── Step senders ──────────────────────────────────────────────────────────────

async function sendWelcome(phone) {
  await sendText(phone,
    `🏡 *Welcome to Chaturbhuja Properties & Infra!*\n\nThank you for reaching out. I'm here to help you find your perfect plot in Andhra Pradesh.\n\nLet me ask you a few quick questions to get started 👇`
  )
}

async function sendProjectQuestion(phone) {
  await sendInteractiveList(phone, {
    header:      '🏡 Step 1 of 4 — Project Interest',
    body:        'Which project are you interested in?\nSelect one from the list below or choose *Any* to get all brochures.',
    footer:      'Chaturbhuja Properties & Infra',
    buttonLabel: 'View Projects',
    sections: [{
      title: 'Available Projects',
      rows:  PROJECTS.map(p => ({ id: `proj_${p.id}`, title: p.title, description: p.description })),
    }],
  })
}

async function sendVisitTimeQuestion(phone) {
  await sendInteractiveButtons(phone, {
    body:    '📅 *Step 2 of 4 — Site Visit*\n\nWould you like to schedule a free site visit?\nChoose your preferred time:',
    footer:  'Our team will confirm 1 day before',
    buttons: [
      ...VISIT_TIMES,
      { id: 'visit_skip', title: 'Skip for now' },
    ],
  })
}

async function sendCallbackQuestion(phone) {
  await sendInteractiveButtons(phone, {
    body:    '📞 *Step 3 of 4 — Callback Request*\n\nWhen is the best time for our property advisor to call you?',
    footer:  'We typically call within 30 minutes',
    buttons: [
      ...CALLBACK_TIMES,
      { id: 'cb_skip', title: 'Skip for now' },
    ],
  })
}

async function sendBrochures(phone, session) {
  const projectId = session.projectId
  const sendAll   = !projectId || projectId === 'any'
  const toSend    = sendAll ? Object.keys(BROCHURES) : [projectId]

  await sendText(phone,
    `✅ *Thank you${session.name ? `, ${session.name}` : ''}!*\n\n` +
    `Here ${sendAll ? 'are all our brochures' : `is your brochure for *${session.projectName}*`} 📄\n\n` +
    `Our team will contact you shortly.\n\n` +
    `For immediate help:\n📞 +91 89772 62683\n🌐 www.chaturbhuja.in`
  )

  for (const id of toSend) {
    const brochure = BROCHURES[id]
    if (brochure) {
      await new Promise(r => setTimeout(r, 500))  // avoid rate limiting
      await sendDocument(phone, brochure)
    }
  }
}

async function notifyOwner(session) {
  const projectLabel = session.projectId === 'any'
    ? 'All Projects'
    : session.projectName || session.projectId || 'Not specified'

  const summary =
    `🤖 *WhatsApp Bot Lead*\n\n` +
    `👤 *Phone:* +${session.phone}\n` +
    `🏡 *Project:* ${projectLabel}\n` +
    `📅 *Visit Time:* ${session.visitTime    || 'Not specified'}\n` +
    `📞 *Callback:*   ${session.callbackTime || 'Not specified'}\n\n` +
    `_Captured via WhatsApp questionnaire bot_`

  await sendText(OWNER_PHONE, summary)
}

// ── Resolve step-aware reply for Twilio numbered inputs ───────────────────────
function resolveReply(msg, step) {
  if (msg.kind === 'reply') {
    // For Twilio payloads with _visit / _callback alternatives, return the right one
    if (step === 'AWAIT_VISIT'    && msg._visit    && !msg.id.startsWith('visit_')) {
      return { kind: 'reply', id: msg._visit.id,    text: msg._visit.title    }
    }
    if (step === 'AWAIT_CALLBACK' && msg._callback && !msg.id.startsWith('cb_')) {
      return { kind: 'reply', id: msg._callback.id, text: msg._callback.title }
    }
  }
  return msg
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function handleIncomingMessage(rawPhone, messagePayload) {
  const phone = normalisePhone(rawPhone)
  const msg   = extractMessage(messagePayload)

  // Get or create session
  let session = await WhatsappSession.findOne({ phone })
  if (!session) {
    session = await WhatsappSession.create({ phone, step: 'WELCOME' })
  }

  session.messageCount += 1
  session.lastActivity  = new Date()

  // ── Reset / start trigger ────────────────────────────────────────────────
  const resetKeywords = ['hi', 'hello', 'hey', 'start', 'restart', 'hii', 'helo', 'namaste']
  const isReset = msg.kind === 'text' && resetKeywords.includes(msg.text.toLowerCase())

  if (session.step === 'WELCOME' || isReset) {
    session.step         = 'AWAIT_PROJECT'
    session.projectId    = ''
    session.projectName  = ''
    session.visitTime    = ''
    session.callbackTime = ''
    session.completed    = false
    await session.save()
    await sendWelcome(phone)
    await sendProjectQuestion(phone)
    return
  }

  // ── AWAIT_PROJECT ────────────────────────────────────────────────────────
  if (session.step === 'AWAIT_PROJECT') {
    let projectId   = ''
    let projectName = ''

    if (msg.kind === 'reply' && msg.id.startsWith('proj_')) {
      projectId = msg.id.replace('proj_', '')
    } else if (msg.kind === 'text') {
      const lc    = msg.text.toLowerCase()
      const match = PROJECTS.find(p =>
        p.title.toLowerCase().includes(lc) || p.id === lc
      )
      if (match) projectId = match.id
    }

    if (!projectId) {
      await sendText(phone, '⚠️ Please select a project from the list above.')
      await sendProjectQuestion(phone)
      await session.save()
      return
    }

    const proj  = PROJECTS.find(p => p.id === projectId)
    projectName = proj?.title || projectId

    session.projectId   = projectId
    session.projectName = sanitizeText(projectName)
    session.step        = 'AWAIT_VISIT'
    await session.save()
    await sendVisitTimeQuestion(phone)
    return
  }

  // ── AWAIT_VISIT ──────────────────────────────────────────────────────────
  if (session.step === 'AWAIT_VISIT') {
    const r = resolveReply(msg, 'AWAIT_VISIT')
    let visitTime = ''

    if (r.kind === 'reply') {
      if (r.id === 'visit_skip')                  visitTime = 'Skipped'
      else if (r.id.startsWith('visit_'))         visitTime = r.text
    } else if (r.kind === 'text') {
      const lc = r.text.toLowerCase()
      if (['skip','no','not now','later'].includes(lc)) visitTime = 'Skipped'
      else if (lc.includes('morning'))   visitTime = 'Morning (9am–12pm)'
      else if (lc.includes('afternoon')) visitTime = 'Afternoon (12pm–4pm)'
      else if (lc.includes('evening'))   visitTime = 'Evening (4pm–7pm)'
    }

    if (!visitTime) {
      await sendText(phone, '⚠️ Please choose a visit time from the options above.')
      await sendVisitTimeQuestion(phone)
      await session.save()
      return
    }

    session.visitTime = sanitizeText(visitTime)
    session.step      = 'AWAIT_CALLBACK'
    await session.save()
    await sendCallbackQuestion(phone)
    return
  }

  // ── AWAIT_CALLBACK ───────────────────────────────────────────────────────
  if (session.step === 'AWAIT_CALLBACK') {
    const r = resolveReply(msg, 'AWAIT_CALLBACK')
    let callbackTime = ''

    if (r.kind === 'reply') {
      if (r.id === 'cb_skip')              callbackTime = 'Skipped'
      else if (r.id.startsWith('cb_'))     callbackTime = r.text
    } else if (r.kind === 'text') {
      const lc = r.text.toLowerCase()
      if (['skip','no','not now','later'].includes(lc)) callbackTime = 'Skipped'
      else if (lc.includes('morning'))   callbackTime = 'Morning (9am–12pm)'
      else if (lc.includes('afternoon')) callbackTime = 'Afternoon (12pm–4pm)'
      else if (lc.includes('evening'))   callbackTime = 'Evening (4pm–7pm)'
    }

    if (!callbackTime) {
      await sendText(phone, '⚠️ Please choose a callback time from the options above.')
      await sendCallbackQuestion(phone)
      await session.save()
      return
    }

    session.callbackTime = sanitizeText(callbackTime)
    session.step         = 'BROCHURE_SENT'
    session.completed    = true
    await session.save()

    await sendBrochures(phone, session)
    try { await notifyOwner(session) } catch (e) {
      console.warn('[questionnaire] Owner notification failed:', e.message)
    }

    session.step = 'DONE'
    await session.save()
    return
  }

  // ── DONE ─────────────────────────────────────────────────────────────────
  await sendText(phone,
    `👋 Your details are already captured! Our team will reach out shortly.\n\nType *hi* to start a new enquiry or call 📞 +91 89772 62683.`
  )
}

module.exports = { handleIncomingMessage }
