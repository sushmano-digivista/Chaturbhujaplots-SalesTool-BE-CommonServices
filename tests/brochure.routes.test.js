/**
 * tests/brochure.routes.test.js
 * Integration tests for POST /api/v1/brochure/email and
 * POST /api/v1/brochure/whatsapp
 *
 * Verifies input validation (S4823), phone sanitisation,
 * and that internal service errors don't leak stack traces.
 */
'use strict'

const request = require('supertest')
const express = require('express')

// Mock services — no real SMTP/WhatsApp calls in tests
jest.mock('../src/services/email.service', () => ({
  sendBrochureEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-msg-id' }),
}))

jest.mock('../src/services/whatsapp.service', () => ({
  sendBrochureWhatsApp: jest.fn().mockResolvedValue({ success: true, method: 'deeplink', deepLink: 'https://wa.me/test' }),
}))

const brochureRoutes = require('../src/routes/brochure.routes')
const { sendBrochureEmail }    = require('../src/services/email.service')
const { sendBrochureWhatsApp } = require('../src/services/whatsapp.service')

const app = express()
app.use(express.json())
app.use('/api/v1/brochure', brochureRoutes)

// ── POST /api/v1/brochure/email ───────────────────────────────────────────────

describe('POST /api/v1/brochure/email', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 for valid email and name', async () => {
    const res = await request(app)
      .post('/api/v1/brochure/email')
      .send({ email: 'test@example.com', name: 'Ravi Kumar', projectId: 'anjana' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/brochure/email')
      .send({ name: 'Ravi Kumar' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/email is required/i)
  })

  it('returns 400 for malformed email (S4823)', async () => {
    const res = await request(app)
      .post('/api/v1/brochure/email')
      .send({ email: 'not-an-email', name: 'Test' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid email/i)
  })

  it('does not leak internal error details on service failure', async () => {
    sendBrochureEmail.mockRejectedValueOnce(new Error('SMTP connection refused'))
    const res = await request(app)
      .post('/api/v1/brochure/email')
      .send({ email: 'test@example.com', name: 'Test' })
    expect(res.status).toBe(500)
    // Error message should NOT expose internal detail (Sonar S5145)
    expect(res.body.error).toBeUndefined()
    expect(res.body.message).toMatch(/failed to send email/i)
  })
})

// ── POST /api/v1/brochure/whatsapp ────────────────────────────────────────────

describe('POST /api/v1/brochure/whatsapp', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 for valid Indian mobile number', async () => {
    const res = await request(app)
      .post('/api/v1/brochure/whatsapp')
      .send({ phone: '9876543210', name: 'Ravi Kumar', projectId: 'anjana' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 400 when phone is missing', async () => {
    const res = await request(app)
      .post('/api/v1/brochure/whatsapp')
      .send({ name: 'Ravi Kumar' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/phone is required/i)
  })

  it('returns 400 for invalid phone number (S4823)', async () => {
    const res = await request(app)
      .post('/api/v1/brochure/whatsapp')
      .send({ phone: '12345', name: 'Test' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid phone/i)
  })

  it('accepts phone with country code prefix 91', async () => {
    const res = await request(app)
      .post('/api/v1/brochure/whatsapp')
      .send({ phone: '919876543210', name: 'Test' })
    expect(res.status).toBe(200)
  })

  it('does not leak internal error details on service failure', async () => {
    sendBrochureWhatsApp.mockRejectedValueOnce(new Error('WA API error'))
    const res = await request(app)
      .post('/api/v1/brochure/whatsapp')
      .send({ phone: '9876543210', name: 'Test' })
    expect(res.status).toBe(500)
    expect(res.body.error).toBeUndefined()
    expect(res.body.message).toMatch(/failed to send whatsapp/i)
  })
})
