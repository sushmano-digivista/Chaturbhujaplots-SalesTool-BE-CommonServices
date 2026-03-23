'use strict'
/**
 * whatsapp-sender.js
 *
 * Dual-provider WhatsApp sender — automatically picks the right provider:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  TWILIO (sandbox / testing)                                 │
 *   │  Set: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN                │
 *   │  Sandbox number: whatsapp:+14155238886                      │
 *   │  Note: Twilio sandbox only supports plain text messages     │
 *   │        (no interactive lists/buttons — bot sends numbered   │
 *   │         menu text instead)                                  │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  META CLOUD API (production)                                │
 *   │  Set: WA_TOKEN + WA_PHONE_ID                                │
 *   │  Supports: text, interactive lists, buttons, documents      │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * The questionnaire service calls the same functions regardless of provider.
 * When Twilio is active, interactive messages degrade gracefully to
 * numbered-menu text so the flow still works in the sandbox.
 */
const axios  = require('axios')
const twilio = require('twilio')

// ── Provider detection ────────────────────────────────────────────────────────

function isTwilio() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
}

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

/** Normalise any phone string to E.164 with + prefix. */
function normalisePhone(phone) {
  const digits = String(phone).replace(/[^0-9]/g, '')
  const e164   = digits.startsWith('91') ? digits : `91${digits}`
  return e164   // without + for Meta; Twilio gets whatsapp:+<e164> below
}

function twilioFrom() {
  return `whatsapp:+${process.env.TWILIO_SANDBOX_NUMBER || '14155238886'}`
}

function twilioTo(phone) {
  return `whatsapp:+${normalisePhone(phone)}`
}

// ── Twilio sender ─────────────────────────────────────────────────────────────

async function twilioSendText(phone, text) {
  const client = getTwilioClient()

  // For sandbox, Twilio requires sending via the shared sandbox number.
  // The account SID must match the one that activated the sandbox.
  const messageParams = {
    from: twilioFrom(),
    to:   twilioTo(phone),
    body: text,
  }

  // If a Messaging Service SID is configured, use that instead
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    delete messageParams.from
    messageParams.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  }

  console.log('[twilio] Sending message:', {
    from: messageParams.from || `service:${messageParams.messagingServiceSid}`,
    to:   messageParams.to,
  })

  return client.messages.create(messageParams)
}

// ── Meta Cloud API sender ─────────────────────────────────────────────────────

function metaClient() {
  const token   = process.env.WA_TOKEN
  const phoneId = process.env.WA_PHONE_ID
  if (!token || !phoneId) throw new Error('WA_TOKEN and WA_PHONE_ID must be set in .env')
  return { token, phoneId }
}

async function metaPost(phoneId, token, body) {
  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    body,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )
  return res.data
}

async function metaSendText(phone, text) {
  const { token, phoneId } = metaClient()
  return metaPost(phoneId, token, {
    messaging_product: 'whatsapp',
    to:   normalisePhone(phone),
    type: 'text',
    text: { body: text, preview_url: false },
  })
}

async function metaSendInteractiveList(phone, { header, body, footer, buttonLabel, sections }) {
  const { token, phoneId } = metaClient()
  return metaPost(phoneId, token, {
    messaging_product: 'whatsapp',
    to:   normalisePhone(phone),
    type: 'interactive',
    interactive: {
      type: 'list',
      header: header ? { type: 'text', text: header } : undefined,
      body:   { text: body },
      footer: footer ? { text: footer } : undefined,
      action: { button: buttonLabel || 'Choose', sections },
    },
  })
}

async function metaSendInteractiveButtons(phone, { body, footer, buttons }) {
  const { token, phoneId } = metaClient()
  return metaPost(phoneId, token, {
    messaging_product: 'whatsapp',
    to:   normalisePhone(phone),
    type: 'interactive',
    interactive: {
      type: 'button',
      body:   { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
      },
    },
  })
}

async function metaSendDocument(phone, { url, filename, caption }) {
  const { token, phoneId } = metaClient()
  return metaPost(phoneId, token, {
    messaging_product: 'whatsapp',
    to:   normalisePhone(phone),
    type: 'document',
    document: { link: url, filename, caption },
  })
}

// ── Twilio fallback renderers (text-only degraded versions) ───────────────────

/**
 * Renders an interactive list as a numbered text menu for Twilio sandbox.
 * e.g.  "1. Anjana Paradise\n2. Aparna Legacy\n..."
 * User replies "1", "2", etc.
 */
async function twilioSendInteractiveList(phone, { header, body, sections }) {
  let text = header ? `*${header}*\n\n` : ''
  text += `${body}\n\n`
  let n = 1
  for (const section of sections) {
    for (const row of section.rows) {
      text += `*${n}.* ${row.title}`
      if (row.description) text += ` — _${row.description}_`
      text += '\n'
      n++
    }
  }
  text += '\n_Reply with the number of your choice_'
  return twilioSendText(phone, text)
}

/**
 * Renders interactive buttons as a numbered text menu for Twilio sandbox.
 */
async function twilioSendInteractiveButtons(phone, { body, buttons }) {
  let text = `${body}\n\n`
  buttons.forEach((b, i) => { text += `*${i + 1}.* ${b.title}\n` })
  text += '\n_Reply with the number of your choice_'
  return twilioSendText(phone, text)
}

/**
 * Sends brochure as a link in a text message (Twilio sandbox can't send PDFs).
 */
async function twilioSendDocument(phone, { url, filename, caption }) {
  const text = `${caption}\n\n📎 Download: ${url}\n\n_Tap the link to view/download your brochure_`
  return twilioSendText(phone, text)
}

// ── Public API (provider-agnostic) ────────────────────────────────────────────

async function sendText(phone, text) {
  return isTwilio()
    ? twilioSendText(phone, text)
    : metaSendText(phone, text)
}

async function sendInteractiveList(phone, opts) {
  return isTwilio()
    ? twilioSendInteractiveList(phone, opts)
    : metaSendInteractiveList(phone, opts)
}

async function sendInteractiveButtons(phone, opts) {
  return isTwilio()
    ? twilioSendInteractiveButtons(phone, opts)
    : metaSendInteractiveButtons(phone, opts)
}

async function sendDocument(phone, opts) {
  return isTwilio()
    ? twilioSendDocument(phone, opts)
    : metaSendDocument(phone, opts)
}

module.exports = {
  sendText,
  sendInteractiveList,
  sendInteractiveButtons,
  sendDocument,
  normalisePhone,
  isTwilio,
}
