'use strict'
/**
 * webhook.routes.js
 *
 * Handles incoming WhatsApp messages from both providers:
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  META Cloud API                                              │
 *  │  GET  /api/v1/webhook  — verification challenge              │
 *  │  POST /api/v1/webhook  — incoming message events             │
 *  ├──────────────────────────────────────────────────────────────┤
 *  │  TWILIO Sandbox                                              │
 *  │  POST /api/v1/webhook/twilio — incoming message events       │
 *  │  (Twilio sends form-urlencoded, not JSON)                    │
 *  └──────────────────────────────────────────────────────────────┘
 *
 * Twilio Setup:
 *   Console → Messaging → Try it out → WhatsApp Sandbox
 *   "When a message comes in" URL: https://<domain>/api/v1/webhook/twilio
 *   Method: HTTP POST
 */
const express = require('express')
const router  = express.Router()
const { handleIncomingMessage } = require('../services/questionnaire.service')
const { isTwilio } = require('../services/whatsapp-sender')

// ── GET /api/v1/webhook — Meta verification handshake ────────────────────────
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode']
  const token     = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    console.log('✓ WhatsApp (Meta) webhook verified')
    return res.status(200).send(challenge)
  }
  console.warn('[webhook] Meta verification failed — token mismatch')
  return res.sendStatus(403)
})

// ── POST /api/v1/webhook — Meta incoming messages ────────────────────────────
router.post('/', async (req, res) => {
  res.sendStatus(200)  // acknowledge immediately
  try {
    const body = req.body
    if (body.object !== 'whatsapp_business_account') return

    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages
    if (!messages?.length) return

    for (const message of messages) {
      if (!['text', 'interactive'].includes(message.type)) continue
      console.log(`[webhook/meta] ${message.type} from ${message.from}`)
      handleIncomingMessage(message.from, message).catch(err =>
        console.error('[webhook/meta] Error:', err.message)
      )
    }
  } catch (err) {
    console.error('[webhook/meta] Unexpected error:', err.message)
  }
})

// ── POST /api/v1/webhook/twilio — Twilio incoming messages ───────────────────
router.post('/twilio', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const from = req.body.From  // e.g. "whatsapp:+919876543210"
    const body = req.body.Body  // plain text of the message

    if (!from || !body) {
      res.set('Content-Type', 'text/xml')
      return res.send('<Response></Response>')
    }

    // Strip "whatsapp:+" prefix to get raw digits
    const phone = from.replace(/^whatsapp:\+?/, '')
    console.log(`[webhook/twilio] message from ${phone}: "${body}"`)

    // Build normalised payload — process BEFORE responding
    // (Vercel serverless kills the function immediately after res.send())
    const messagePayload = buildTwilioPayload(body.trim())
    await handleIncomingMessage(phone, messagePayload)

  } catch (err) {
    console.error('[webhook/twilio] Error:', err.message)
  }

  // Respond AFTER processing — Twilio requires TwiML response
  res.set('Content-Type', 'text/xml')
  res.send('<Response></Response>')
})

/**
 * Maps Twilio plain-text replies to the same payload shape questionnaire.service
 * expects from Meta interactive replies.
 *
 * Numbered menus sent by twilioSendInteractiveList/Buttons:
 *   Project list:   1=anjana 2=aparna 3=varaha 4=trimbak 5=any
 *   Visit time:     1=morning 2=afternoon 3=skip
 *   Callback time:  1=morning 2=afternoon 3=skip
 *
 * Free-text (hi/skip/morning etc.) falls through to the text handler
 * in questionnaire.service which already handles those words.
 */
function buildTwilioPayload(text) {
  const lower = text.toLowerCase().trim()

  // Map numbered replies → button/list reply IDs
  const PROJECT_MAP = {
    '1': { id: 'proj_anjana',  title: 'Anjana Paradise'     },
    '2': { id: 'proj_aparna',  title: 'Aparna Legacy'       },
    '3': { id: 'proj_varaha',  title: 'Varaha Virtue'       },
    '4': { id: 'proj_trimbak', title: 'Trimbak Oaks'        },
    '5': { id: 'proj_any',     title: 'Any / All Projects'  },
  }
  const VISIT_MAP = {
    '1': { id: 'visit_morning',   title: 'Morning (9am–12pm)'   },
    '2': { id: 'visit_afternoon', title: 'Afternoon (12pm–4pm)' },
    '3': { id: 'visit_skip',      title: 'Skip for now'         },
  }
  const CALLBACK_MAP = {
    '1': { id: 'cb_morning',   title: 'Morning (9am–12pm)'   },
    '2': { id: 'cb_afternoon', title: 'Afternoon (12pm–4pm)' },
    '3': { id: 'cb_skip',      title: 'Skip for now'         },
  }

  // Check if it's a single digit
  if (/^[1-5]$/.test(lower)) {
    // Could be project, visit, or callback — questionnaire.service will
    // only act on the reply if the id matches the expected step pattern.
    // We return all possibilities; the state machine picks the right one.
    const n = lower
    const proj = PROJECT_MAP[n]
    const visit = VISIT_MAP[n]
    const cb = CALLBACK_MAP[n]

    // Return as an interactive reply that covers all three maps
    // The questionnaire checks msg.id.startsWith('proj_') / 'visit_' / 'cb_'
    // so we send the project reply first — it won't match visit/cb steps
    if (proj) {
      return {
        type: 'interactive',
        interactive: { list_reply: proj },
        // Also attach visit/cb replies so service can match whichever step is active
        _visit:    visit,
        _callback: cb,
      }
    }
  }

  // Plain text fallback — pass straight through
  return { type: 'text', text: { body: text } }
}

module.exports = router

// ── GET /api/v1/webhook/debug — check env vars are loaded (remove in prod) ───
router.get('/debug', (req, res) => {
  res.json({
    hasTwilioSid:    !!process.env.TWILIO_ACCOUNT_SID,
    hasTwilioToken:  !!process.env.TWILIO_AUTH_TOKEN,
    hasWaToken:      !!process.env.WA_TOKEN,
    sandboxNumber:   process.env.TWILIO_SANDBOX_NUMBER || '14155238886 (default)',
    ownerPhone:      process.env.OWNER_PHONE || 'NOT SET',
    nodeEnv:         process.env.NODE_ENV || 'not set',
  })
})
