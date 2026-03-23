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

  // For single digit inputs, return as plain text.
  // The questionnaire service handles numbers directly in each step's text handler:
  //   AWAIT_PROJECT:  1=anjana 2=aparna 3=varaha 4=trimbak 5=any
  //   AWAIT_VISIT:    1=Morning 2=Afternoon 3=Skip
  //   AWAIT_CALLBACK: 1=Morning 2=Afternoon 3=Skip
  // Passing as plain text lets the correct step handler resolve the meaning.
  if (/^[1-5]$/.test(lower)) {
    return { type: 'text', text: { body: lower } }
  }

  // Plain text fallback — pass straight through
  return { type: 'text', text: { body: text } }
}

module.exports = router

// ── GET /api/v1/webhook/debug — check env vars are loaded (remove in prod) ───
router.get('/debug', (req, res) => {
  res.json({
    version:         'v4-mongo-fix',
    hasTwilioSid:    !!process.env.TWILIO_ACCOUNT_SID,
    hasTwilioToken:  !!process.env.TWILIO_AUTH_TOKEN,
    hasWaToken:      !!process.env.WA_TOKEN,
    sandboxNumber:   process.env.TWILIO_SANDBOX_NUMBER || '14155238886 (default)',
    ownerPhone:      process.env.OWNER_PHONE || 'NOT SET',
    nodeEnv:         process.env.NODE_ENV || 'not set',
  })
})

// ── GET /api/v1/webhook/test-send — send a test message directly via Twilio ──
router.get('/test-send', async (req, res) => {
  try {
    const twilio = require('twilio')
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    const to     = req.query.to || process.env.OWNER_PHONE

    const messageParams = {
      to:   `whatsapp:+${to}`,
      body: '✅ Test message from Chaturbhuja bot - setup working!',
    }

    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      messageParams.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
    } else {
      messageParams.from = `whatsapp:+${process.env.TWILIO_SANDBOX_NUMBER || '14155238886'}`
    }

    const result = await client.messages.create(messageParams)
    res.json({ success: true, sid: result.sid, to, status: result.status, params: messageParams })
  } catch (err) {
    res.json({
      success:  false,
      error:    err.message,
      code:     err.code,
      moreInfo: err.moreInfo,
      status:   err.status,
    })
  }
})
