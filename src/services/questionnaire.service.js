'use strict'
/**
 * questionnaire.service.js
 *
 * State-machine engine for the WhatsApp auto-questionnaire.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  FLOW                                                    │
 * │                                                          │
 * │  [New user / "hi"] → WELCOME                             │
 * │       ↓  (sends project list)                           │
 * │  AWAIT_PROJECT  ← user picks project or "Any"            │
 * │       ↓  (sends visit time buttons)                     │
 * │  AWAIT_VISIT   ← user picks time slot or "Skip"          │
 * │       ↓  (sends callback time buttons)                  │
 * │  AWAIT_CALLBACK← user picks callback slot or "Skip"      │
 * │       ↓  (sends brochure PDF(s) + thank-you)            │
 * │  BROCHURE_SENT  → DONE                                   │
 * └──────────────────────────────────────────────────────────┘
 *
 * Entry point:  handleIncomingMessage(phone, messagePayload)
 */
const WhatsappSession  = require('../models/whatsapp-session.model')
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
  { id: 'anjana',  title: 'Anjana Paradise',  description: 'Paritala · Near Amaravati · 242 plots' },
  { id: 'aparna',  title: 'Aparna Legacy',    description: 'Chevitikallu · 273 plots'              },
  { id: 'varaha',  title: 'Varaha Virtue',    description: 'Pamarru · Near NH-16 · 132 plots'      },
  { id: 'trimbak', title: 'Trimbak Oaks',     description: 'Penamaluru · Near Vijayawada · Coming soon' },
  { id: 'any',     title: 'Any / All Projects', description: 'Send me all brochures'              },
]

// ── Brochure PDFs (hosted on chaturbhuja.in) ──────────────────────────────────
const BROCHURES = {
  anjana:  { url: 'https://chaturbhuja.in/brochures/Anjana_Paradise_Brochure.pdf',  filename: 'Anjana_Paradise_Brochure.pdf',  caption: '📄 Anjana Paradise — Paritala, Near Amaravati' },
  aparna:  { url: 'https://chaturbhuja.in/brochures/Aparna_Legacy_Brochure.pdf',   filename: 'Aparna_Legacy_Brochure.pdf',    caption: '📄 Aparna Legacy — Chevitikallu'                },
  varaha:  { url: 'https://chaturbhuja.in/brochures/Varaha_Virtue_Brochure.pdf',   filename: 'Varaha_Virtue_Brochure.pdf',    caption: '📄 Varaha Virtue — Pamarru, Near NH-16'        },
  trimbak: { url: 'https://chaturbhuja.in/brochures/Trimbak_Oaks_Brochure.pdf',   filename: 'Trimbak_Oaks_Brochure.pdf',    caption: '📄 Trimbak Oaks — Penamaluru (Coming Soon)'    },
}

const VISIT_TIMES = [
  { id: 'visit_morning',   title: 'Morning (9am–12pm)'   },
  { id: 'visit_afternoon', title: 'Afternoon (12pm–4pm)' },
  { id: 'visit_evening',   title: 'Evening (4pm–7pm)'    },
]

const CALLBACK_TIMES = [
  { id: 'cb_morning',   title: 'Morning (9am–12pm)'   },
  { id: 'cb_afternoon', title: 'Afternoon (12pm–4pm)' },
  { id: 'cb_evening',   title: 'Evening (4pm–7pm)'    },
]

const OWNER_PHONE = process.env.OWNER_PHONE || '918977262683'

// ── Helper: extract text from webhook payload ─────────────────────────────────
function extractMessage(payload) {
  const type = payload?.type
  if (type === 'text')        return { kind: 'text',    text: payload.text?.body?.trim() || '' }
  if (type === 'interactive') {
    const reply   = payload.interactive?.button_reply || payload.interactive?.list_reply
    return { kind: 'reply', id: reply?.id || '', text: reply?.title || '' }
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
    body:        'Which project are you interested in? Select one from the list below or choose *Any* to get all brochures.',
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
    body:    '📅 *Step 2 of 4 — Site Visit*\n\nWould you like to schedule a free site visit? If yes, choose your preferred time:',
    footer:  'Our team will confirm 1 day before',
    buttons: [
      ...VISIT_TIMES.slice(0, 2),
      { id: 'visit_skip', title: 'Skip for now' },
    ],
  })
  // Send second batch for afternoon/evening since WhatsApp limits to 3 buttons
  // We already include Morning + Afternoon + Skip → user can reply Afternoon later
}

async function sendCallbackQuestion(phone) {
  await sendInteractiveButtons(phone, {
    body:    '📞 *Step 3 of 4 — Callback Request*\n\nWhen is the best time for our property advisor to call you?',
    footer:  'We typically call within 30 minutes',
    buttons: [
      ...CALLBACK_TIMES.slice(0, 2),
      { id: 'cb_skip', title: 'Skip for now' },
    ],
  })
}

async function sendBrochures(phone, session) {
  const projectId = session.projectId
  const sendAll   = !projectId || projectId === 'any'
  const toSend    = sendAll ? Object.keys(BROCHURES) : [projectId]

  await sendText(phone,
    `✅ *Thank you${session.name ? `, ${session.name}` : ''}!*\n\nHere are your brochure(s) for *${sendAll ? 'all projects' : session.projectName}* 📄\nOur team will contact you shortly.\n\nFor immediate help:\n📞 +91 89772 62683\n🌐 www.chaturbhuja.in`
  )

  for (const id of toSend) {
    const brochure = BROCHURES[id]
    if (brochure) {
      // Small delay between documents to avoid rate limiting
      await new Promise(r => setTimeout(r, 500))
      await sendDocument(phone, brochure)
    }
  }
}

async function notifyOwner(session) {
  const projectLabel = session.projectId === 'any'
    ? 'All Projects'
    : session.projectName || session.projectId || 'Not specified'

  const summary = `🤖 *WhatsApp Bot Lead*\n\n` +
    `👤 *Phone:* +${session.phone}\n` +
    `🏡 *Project Interest:* ${projectLabel}\n` +
    `📅 *Visit Time:* ${session.visitTime    || 'Not specified'}\n` +
    `📞 *Callback Time:* ${session.callbackTime || 'Not specified'}\n\n` +
    `_Captured via WhatsApp questionnaire bot_`

  await sendText(OWNER_PHONE, summary)
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * handleIncomingMessage(phone, messagePayload)
 *
 * Called from the webhook route with the raw message payload from Meta.
 * Reads/writes session in MongoDB and advances the conversation.
 */
async function handleIncomingMessage(rawPhone, messagePayload) {
  const phone = normalisePhone(rawPhone)
  const msg   = extractMessage(messagePayload)

  // Get or create session
  let session = await WhatsappSession.findOne({ phone })
  if (!session) {
    session = await WhatsappSession.create({ phone, step: 'WELCOME' })
  }

  // Update activity timestamp and message count
  session.messageCount += 1
  session.lastActivity  = new Date()

  // ── STEP: WELCOME / restart trigger ─────────────────────────────────────
  const resetKeywords = ['hi', 'hello', 'hey', 'start', 'restart', 'hii', 'helo', 'namaste']
  const isReset = msg.kind === 'text' && resetKeywords.includes(msg.text.toLowerCase())

  if (session.step === 'WELCOME' || isReset) {
    if (isReset && session.completed) {
      // Allow restart of completed sessions
      session.step         = 'AWAIT_PROJECT'
      session.projectId    = ''
      session.projectName  = ''
      session.visitTime    = ''
      session.callbackTime = ''
      session.completed    = false
    }
    await session.save()
    await sendWelcome(phone)
    await sendProjectQuestion(phone)
    session.step = 'AWAIT_PROJECT'
    await session.save()
    return
  }

  // ── STEP: AWAIT_PROJECT ──────────────────────────────────────────────────
  if (session.step === 'AWAIT_PROJECT') {
    let projectId   = ''
    let projectName = ''

    if (msg.kind === 'reply' && msg.id.startsWith('proj_')) {
      projectId = msg.id.replace('proj_', '')
    } else if (msg.kind === 'text') {
      // Allow plain-text fallback: try to match project name
      const lc = msg.text.toLowerCase()
      const match = PROJECTS.find(p =>
        p.title.toLowerCase().includes(lc) || p.id === lc
      )
      if (match) projectId = match.id
    }

    if (!projectId) {
      await sendText(phone, '⚠️ Please select a project from the list above, or tap *View Projects* to see the options again.')
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

  // ── STEP: AWAIT_VISIT ────────────────────────────────────────────────────
  if (session.step === 'AWAIT_VISIT') {
    let visitTime = ''

    if (msg.kind === 'reply') {
      if (msg.id === 'visit_skip') {
        visitTime = 'Skipped'
      } else if (msg.id.startsWith('visit_')) {
        visitTime = msg.text
      }
    } else if (msg.kind === 'text') {
      const lc = msg.text.toLowerCase()
      if (['skip', 'no', 'not now', 'later'].includes(lc))  visitTime = 'Skipped'
      else if (lc.includes('morning'))   visitTime = 'Morning (9am–12pm)'
      else if (lc.includes('afternoon')) visitTime = 'Afternoon (12pm–4pm)'
      else if (lc.includes('evening'))   visitTime = 'Evening (4pm–7pm)'
    }

    if (!visitTime) {
      await sendText(phone, '⚠️ Please tap one of the buttons above to choose your preferred visit time, or tap *Skip for now*.')
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

  // ── STEP: AWAIT_CALLBACK ─────────────────────────────────────────────────
  if (session.step === 'AWAIT_CALLBACK') {
    let callbackTime = ''

    if (msg.kind === 'reply') {
      if (msg.id === 'cb_skip') {
        callbackTime = 'Skipped'
      } else if (msg.id.startsWith('cb_')) {
        callbackTime = msg.text
      }
    } else if (msg.kind === 'text') {
      const lc = msg.text.toLowerCase()
      if (['skip', 'no', 'not now', 'later'].includes(lc)) callbackTime = 'Skipped'
      else if (lc.includes('morning'))   callbackTime = 'Morning (9am–12pm)'
      else if (lc.includes('afternoon')) callbackTime = 'Afternoon (12pm–4pm)'
      else if (lc.includes('evening'))   callbackTime = 'Evening (4pm–7pm)'
    }

    if (!callbackTime) {
      await sendText(phone, '⚠️ Please tap one of the buttons above to choose a callback time, or tap *Skip for now*.')
      await sendCallbackQuestion(phone)
      await session.save()
      return
    }

    session.callbackTime = sanitizeText(callbackTime)
    session.step         = 'BROCHURE_SENT'
    session.completed    = true
    await session.save()

    // Send brochure(s) + notify owner
    await sendBrochures(phone, session)
    try { await notifyOwner(session) } catch (e) {
      console.warn('[questionnaire] Owner notification failed:', e.message)
    }

    session.step = 'DONE'
    await session.save()
    return
  }

  // ── STEP: DONE — already completed ──────────────────────────────────────
  if (session.step === 'DONE' || session.completed) {
    await sendText(phone,
      `👋 Your details are already captured! Our team will reach out shortly.\n\nType *hi* to start a new enquiry or call us at 📞 +91 89772 62683.`
    )
    return
  }
}

module.exports = { handleIncomingMessage }
