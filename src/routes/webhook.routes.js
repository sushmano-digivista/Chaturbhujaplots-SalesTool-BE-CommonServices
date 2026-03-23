'use strict'
/**
 * webhook.routes.js
 *
 * Handles the Meta WhatsApp Cloud API webhook:
 *
 *  GET  /api/v1/webhook  — Verification challenge (required by Meta during app setup)
 *  POST /api/v1/webhook  — Incoming message events → drives questionnaire flow
 *
 * Setup in Meta Developer Console:
 *   Webhook URL:     https://<your-domain>/api/v1/webhook
 *   Verify Token:    set WA_VERIFY_TOKEN in .env (any secret string you choose)
 *   Subscribed fields: messages
 */
const router               = require('express').Router()
const { handleIncomingMessage } = require('../services/questionnaire.service')

// ── GET /api/v1/webhook — Meta verification handshake ────────────────────────
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode']
  const token     = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    console.log('✓ WhatsApp webhook verified')
    return res.status(200).send(challenge)
  }
  console.warn('[webhook] Verification failed — token mismatch or wrong mode')
  return res.sendStatus(403)
})

// ── POST /api/v1/webhook — Incoming message events ───────────────────────────
router.post('/', async (req, res) => {
  // Always acknowledge immediately — Meta retries if we don't respond within 20 s
  res.sendStatus(200)

  try {
    const body = req.body

    if (body.object !== 'whatsapp_business_account') return

    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    const value  = change?.value

    if (!value?.messages?.length) return  // status updates, read receipts, etc.

    for (const message of value.messages) {
      const phone = message.from  // sender's E.164 number (without +)

      // Skip non-actionable message types (image, audio, video, location, etc.)
      const supportedTypes = ['text', 'interactive']
      if (!supportedTypes.includes(message.type)) {
        console.log(`[webhook] Skipping unsupported message type: ${message.type} from ${phone}`)
        continue
      }

      console.log(`[webhook] Incoming ${message.type} from ${phone}`)

      // Drive the questionnaire state machine (fire-and-forget per message)
      handleIncomingMessage(phone, message).catch((err) => {
        console.error(`[webhook] Error handling message from ${phone}:`, err.message)
      })
    }
  } catch (err) {
    console.error('[webhook] Unexpected error processing payload:', err.message)
  }
})

module.exports = router
