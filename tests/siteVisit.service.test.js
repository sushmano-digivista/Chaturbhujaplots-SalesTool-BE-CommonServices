'use strict'
/**
 * tests/siteVisit.service.test.js
 * Tests for siteVisit.service.js
 */

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: '<test-id>' }),
  }),
}))

jest.mock('../src/services/whatsapp-sender', () => ({
  sendText: jest.fn().mockResolvedValue({}),
}))

const nodemailer = require('nodemailer')
const { sendText } = require('../src/services/whatsapp-sender')
const {
  sendCustomerEmail,
  sendOwnerEmail,
  sendCustomerWhatsApp,
  sendOwnerWhatsApp,
} = require('../src/services/siteVisit.service')

describe('siteVisit.service', () => {
  beforeEach(() => jest.clearAllMocks())

  const payload = {
    name: 'Ravi Kumar',
    phone: '9876543210',
    email: 'ravi@example.com',
    project: 'Anjana Paradise',
    date: '2025-04-15',
  }

  // ── sendCustomerEmail ───────────────────────────────────────────────────
  describe('sendCustomerEmail', () => {
    it('sends email when email is provided', async () => {
      const result = await sendCustomerEmail(payload)
      const transport = nodemailer.createTransport()
      expect(transport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ravi@example.com',
          subject: expect.stringContaining('Anjana Paradise'),
          html: expect.stringContaining('Ravi Kumar'),
        })
      )
      expect(result).toBeTruthy()
    })

    it('returns null when no email provided', async () => {
      const result = await sendCustomerEmail({ ...payload, email: undefined })
      expect(result).toBeNull()
    })

    it('handles missing phone in HTML gracefully', async () => {
      await sendCustomerEmail({ ...payload, phone: '' })
      const transport = nodemailer.createTransport()
      expect(transport.sendMail).toHaveBeenCalled()
    })

    it('escapes HTML in user-supplied values', async () => {
      await sendCustomerEmail({ ...payload, name: '<b>XSS</b>' })
      const transport = nodemailer.createTransport()
      const call = transport.sendMail.mock.calls[0][0]
      expect(call.html).not.toContain('<b>XSS</b>')
      expect(call.html).toContain('&lt;b&gt;')
    })
  })

  // ── sendOwnerEmail ──────────────────────────────────────────────────────
  describe('sendOwnerEmail', () => {
    it('sends email to owner with customer details', async () => {
      await sendOwnerEmail(payload)
      const transport = nodemailer.createTransport()
      expect(transport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Ravi Kumar'),
          html: expect.stringContaining('9876543210'),
        })
      )
    })

    it('handles missing email field gracefully', async () => {
      await sendOwnerEmail({ ...payload, email: '' })
      const transport = nodemailer.createTransport()
      expect(transport.sendMail).toHaveBeenCalled()
    })

    it('shows "Not specified" for missing project', async () => {
      await sendOwnerEmail({ ...payload, project: '' })
      const transport = nodemailer.createTransport()
      const call = transport.sendMail.mock.calls[0][0]
      expect(call.html).toContain('Not specified')
    })
  })

  // ── sendCustomerWhatsApp ────────────────────────────────────────────────
  describe('sendCustomerWhatsApp', () => {
    it('sends WhatsApp message to customer', async () => {
      const result = await sendCustomerWhatsApp(payload)
      expect(sendText).toHaveBeenCalledWith(
        expect.stringMatching(/^91/),
        expect.stringContaining('Ravi Kumar')
      )
      expect(result).toEqual({ method: 'sent' })
    })

    it('returns null when phone is missing', async () => {
      const result = await sendCustomerWhatsApp({ ...payload, phone: '' })
      expect(result).toBeNull()
    })

    it('uses default project name when not provided', async () => {
      await sendCustomerWhatsApp({ ...payload, project: '' })
      expect(sendText).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Chaturbhuja Properties')
      )
    })

    it('falls back to deeplink when sendText fails', async () => {
      sendText.mockRejectedValueOnce(new Error('API error'))
      const result = await sendCustomerWhatsApp(payload)
      expect(result).toHaveProperty('method', 'deeplink')
      expect(result).toHaveProperty('deepLink')
    })
  })

  // ── sendOwnerWhatsApp ───────────────────────────────────────────────────
  describe('sendOwnerWhatsApp', () => {
    it('sends WhatsApp message to owner', async () => {
      const result = await sendOwnerWhatsApp(payload)
      expect(sendText).toHaveBeenCalled()
      expect(result).toEqual({ method: 'sent' })
    })

    it('includes email when provided', async () => {
      await sendOwnerWhatsApp(payload)
      expect(sendText).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('ravi@example.com')
      )
    })

    it('omits email line when email is empty', async () => {
      await sendOwnerWhatsApp({ ...payload, email: '' })
      expect(sendText).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.stringContaining('Email')
      )
    })

    it('falls back to deeplink when sendText fails', async () => {
      sendText.mockRejectedValueOnce(new Error('fail'))
      const result = await sendOwnerWhatsApp(payload)
      expect(result).toHaveProperty('method', 'deeplink')
    })
  })
})
