'use strict'
/**
 * tests/webhook.routes.extra.test.js
 * Additional tests for webhook.routes.js — Twilio endpoint, debug, test-send,
 * and buildTwilioPayload to cover previously uncovered lines.
 */

const request = require('supertest')
const express = require('express')

// ── Mock dependencies ────────────────────────────────────────────────────────
jest.mock('../src/services/questionnaire.service', () => ({
  handleIncomingMessage: jest.fn().mockResolvedValue({}),
}))

jest.mock('../src/services/whatsapp-sender', () => ({
  sendText:               jest.fn().mockResolvedValue({}),
  sendInteractiveList:    jest.fn().mockResolvedValue({}),
  sendInteractiveButtons: jest.fn().mockResolvedValue({}),
  sendDocument:           jest.fn().mockResolvedValue({}),
  normalisePhone:         jest.fn(p => `91${String(p).replace(/[^0-9]/g, '').slice(-10)}`),
  isTwilio:               jest.fn().mockReturnValue(true),
}))

jest.mock('twilio', () => {
  const mockCreate = jest.fn().mockResolvedValue({ sid: 'SM123', status: 'queued' })
  return jest.fn(() => ({
    messages: { create: mockCreate },
  }))
})

process.env.WA_VERIFY_TOKEN           = 'test-verify-token'
process.env.TWILIO_ACCOUNT_SID        = 'AC_test'
process.env.TWILIO_AUTH_TOKEN          = 'test_auth_token'
process.env.TWILIO_SANDBOX_NUMBER      = '14155238886'
process.env.OWNER_PHONE               = '919999999999'

const { handleIncomingMessage } = require('../src/services/questionnaire.service')
const webhookRoutes = require('../src/routes/webhook.routes')

const app = express()
app.use(express.json())
app.use('/api/v1/webhook', webhookRoutes)

describe('POST /api/v1/webhook/twilio', () => {
  beforeEach(() => jest.clearAllMocks())

  it('processes incoming Twilio message and returns TwiML', async () => {
    const res = await request(app)
      .post('/api/v1/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+919876543210', Body: 'hi' })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/xml/)
    expect(res.text).toContain('<Response>')
    expect(handleIncomingMessage).toHaveBeenCalledWith(
      '919876543210',
      expect.objectContaining({ type: 'text' })
    )
  })

  it('returns empty TwiML when From is missing', async () => {
    const res = await request(app)
      .post('/api/v1/webhook/twilio')
      .type('form')
      .send({ Body: 'hello' })

    expect(res.status).toBe(200)
    expect(res.text).toContain('<Response></Response>')
    expect(handleIncomingMessage).not.toHaveBeenCalled()
  })

  it('returns empty TwiML when Body is missing', async () => {
    const res = await request(app)
      .post('/api/v1/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+919876543210' })

    expect(res.status).toBe(200)
    expect(res.text).toContain('<Response></Response>')
    expect(handleIncomingMessage).not.toHaveBeenCalled()
  })

  it('handles numbered input (1-5) as plain text', async () => {
    const res = await request(app)
      .post('/api/v1/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+919876543210', Body: '3' })

    expect(res.status).toBe(200)
    expect(handleIncomingMessage).toHaveBeenCalledWith(
      '919876543210',
      expect.objectContaining({ type: 'text', text: { body: '3' } })
    )
  })

  it('passes free-text input through', async () => {
    const res = await request(app)
      .post('/api/v1/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+919876543210', Body: 'anjana paradise' })

    expect(res.status).toBe(200)
    expect(handleIncomingMessage).toHaveBeenCalledWith(
      '919876543210',
      expect.objectContaining({ type: 'text', text: { body: 'anjana paradise' } })
    )
  })

  it('still responds with TwiML when handleIncomingMessage throws', async () => {
    handleIncomingMessage.mockRejectedValueOnce(new Error('DB down'))
    const res = await request(app)
      .post('/api/v1/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+919876543210', Body: 'hi' })

    expect(res.status).toBe(200)
    expect(res.text).toContain('<Response>')
  })

  it('strips whatsapp:+ prefix from phone correctly', async () => {
    await request(app)
      .post('/api/v1/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+919876543210', Body: 'test' })

    expect(handleIncomingMessage).toHaveBeenCalledWith(
      '919876543210',
      expect.any(Object)
    )
  })
})

describe('GET /api/v1/webhook/debug', () => {
  it('returns env var status object', async () => {
    const res = await request(app).get('/api/v1/webhook/debug')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('version')
    expect(res.body).toHaveProperty('hasTwilioSid')
    expect(res.body).toHaveProperty('hasTwilioToken')
    expect(res.body).toHaveProperty('hasWaToken')
    expect(res.body).toHaveProperty('sandboxNumber')
    expect(res.body).toHaveProperty('ownerPhone')
    expect(res.body.hasTwilioSid).toBe(true)
  })
})

describe('GET /api/v1/webhook/test-send', () => {
  it('sends a test message via Twilio and returns result', async () => {
    const res = await request(app).get('/api/v1/webhook/test-send')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.sid).toBe('SM123')
  })

  it('uses query param "to" when provided', async () => {
    const res = await request(app)
      .get('/api/v1/webhook/test-send')
      .query({ to: '918888888888' })
    expect(res.status).toBe(200)
    expect(res.body.to).toBe('918888888888')
  })

  it('returns error info when Twilio client throws', async () => {
    const twilio = require('twilio')
    const client = twilio()
    client.messages.create.mockRejectedValueOnce(
      Object.assign(new Error('Auth failed'), { code: 20003, moreInfo: 'url', status: 401 })
    )
    const res = await request(app).get('/api/v1/webhook/test-send')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('Auth failed')
    expect(res.body.code).toBe(20003)
  })
})

describe('GET /api/v1/webhook (Meta verification) — extra cases', () => {
  it('returns 403 when hub.mode is not subscribe', async () => {
    const res = await request(app)
      .get('/api/v1/webhook')
      .query({ 'hub.mode': 'other', 'hub.verify_token': 'test-verify-token', 'hub.challenge': 'abc' })
    expect(res.status).toBe(403)
  })

  it('returns 403 when no query params', async () => {
    const res = await request(app).get('/api/v1/webhook')
    expect(res.status).toBe(403)
  })
})
