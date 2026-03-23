'use strict'
/**
 * whatsapp-sender.js
 *
 * Low-level helper that wraps the WhatsApp Cloud API (Meta Graph API v19.0).
 * All message types used by the questionnaire bot live here:
 *   • sendText           — plain text
 *   • sendInteractiveList — scrollable list of options (project picker)
 *   • sendInteractiveButtons — up to 3 quick-reply buttons
 *   • sendDocument       — send a PDF brochure
 *
 * Every function throws on API error — callers should handle with try/catch.
 */
const axios = require('axios')

function waClient() {
  const token   = process.env.WA_TOKEN
  const phoneId = process.env.WA_PHONE_ID
  if (!token || !phoneId) throw new Error('WA_TOKEN and WA_PHONE_ID must be set in .env')
  return { token, phoneId }
}

/** Normalise any phone string to E.164 digits-only (Indian numbers). */
function normalisePhone(phone) {
  const digits = String(phone).replace(/[^0-9]/g, '')
  return digits.startsWith('91') ? digits : `91${digits}`
}

/** POST to WhatsApp Graph API. */
async function waPost(phoneId, token, body) {
  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    body,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )
  return res.data
}

// ── Public send helpers ───────────────────────────────────────────────────────

/**
 * sendText(phone, text)
 * Sends a plain text message.
 */
async function sendText(phone, text) {
  const { token, phoneId } = waClient()
  return waPost(phoneId, token, {
    messaging_product: 'whatsapp',
    to:   normalisePhone(phone),
    type: 'text',
    text: { body: text, preview_url: false },
  })
}

/**
 * sendInteractiveList(phone, { header, body, footer, buttonLabel, sections })
 *
 * Renders a scrollable list of options — ideal for 5+ choices.
 * sections = [{ title, rows: [{ id, title, description? }] }]
 */
async function sendInteractiveList(phone, { header, body, footer, buttonLabel, sections }) {
  const { token, phoneId } = waClient()
  return waPost(phoneId, token, {
    messaging_product: 'whatsapp',
    to:   normalisePhone(phone),
    type: 'interactive',
    interactive: {
      type: 'list',
      header: header ? { type: 'text', text: header } : undefined,
      body:   { text: body },
      footer: footer ? { text: footer }  : undefined,
      action: {
        button:   buttonLabel || 'Choose',
        sections,
      },
    },
  })
}

/**
 * sendInteractiveButtons(phone, { body, footer, buttons })
 *
 * Renders up to 3 quick-reply buttons.
 * buttons = [{ id, title }]
 */
async function sendInteractiveButtons(phone, { body, footer, buttons }) {
  const { token, phoneId } = waClient()
  return waPost(phoneId, token, {
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

/**
 * sendDocument(phone, { url, filename, caption })
 * Sends a PDF brochure by URL.
 */
async function sendDocument(phone, { url, filename, caption }) {
  const { token, phoneId } = waClient()
  return waPost(phoneId, token, {
    messaging_product: 'whatsapp',
    to:   normalisePhone(phone),
    type: 'document',
    document: { link: url, filename, caption },
  })
}

module.exports = { sendText, sendInteractiveList, sendInteractiveButtons, sendDocument, normalisePhone }
