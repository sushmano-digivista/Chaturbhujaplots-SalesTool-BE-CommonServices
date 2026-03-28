'use strict'
/**
 * tests/whatsapp-sender.test.js
 * Tests for whatsapp-sender.js — dual-provider WhatsApp sender
 */

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { messages: [{ id: 'meta-msg-1' }] } }),
}))

jest.mock('twilio', () => {
  const mockCreate = jest.fn().mockResolvedValue({ sid: 'twilio-sid-1' })
  return jest.fn(() => ({
    messages: { create: mockCreate },
  }))
})

const axios  = require('axios')
const twilio = require('twilio')

describe('whatsapp-sender', () => {
  let sender

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset module cache so env changes take effect
    jest.resetModules()
    jest.mock('axios', () => ({
      post: jest.fn().mockResolvedValue({ data: { messages: [{ id: 'meta-msg-1' }] } }),
    }))
    jest.mock('twilio', () => {
      const mockCreate = jest.fn().mockResolvedValue({ sid: 'twilio-sid-1' })
      return jest.fn(() => ({
        messages: { create: mockCreate },
      }))
    })
  })

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_SANDBOX_NUMBER
    delete process.env.TWILIO_MESSAGING_SERVICE_SID
    delete process.env.WA_TOKEN
    delete process.env.WA_PHONE_ID
  })

  describe('normalisePhone', () => {
    it('strips non-digit characters and prepends 91', () => {
      sender = require('../src/services/whatsapp-sender')
      expect(sender.normalisePhone('+91-9876543210')).toBe('919876543210')
    })

    it('does not double-prefix 91', () => {
      sender = require('../src/services/whatsapp-sender')
      expect(sender.normalisePhone('919876543210')).toBe('919876543210')
    })
  })

  describe('isTwilio', () => {
    it('returns true when Twilio env vars are set', () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123'
      process.env.TWILIO_AUTH_TOKEN  = 'token123'
      sender = require('../src/services/whatsapp-sender')
      expect(sender.isTwilio()).toBe(true)
    })

    it('returns false when Twilio env vars are missing', () => {
      delete process.env.TWILIO_ACCOUNT_SID
      delete process.env.TWILIO_AUTH_TOKEN
      sender = require('../src/services/whatsapp-sender')
      expect(sender.isTwilio()).toBe(false)
    })
  })

  describe('Meta Cloud API path', () => {
    beforeEach(() => {
      delete process.env.TWILIO_ACCOUNT_SID
      delete process.env.TWILIO_AUTH_TOKEN
      process.env.WA_TOKEN    = 'test-wa-token'
      process.env.WA_PHONE_ID = 'test-phone-id'
      sender = require('../src/services/whatsapp-sender')
    })

    it('sendText sends via Meta API', async () => {
      const axios = require('axios')
      await sender.sendText('9876543210', 'Hello')
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('graph.facebook.com'),
        expect.objectContaining({
          messaging_product: 'whatsapp',
          type: 'text',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-wa-token' }),
        })
      )
    })

    it('sendInteractiveList sends list via Meta API', async () => {
      const axios = require('axios')
      await sender.sendInteractiveList('9876543210', {
        header: 'Header',
        body: 'Body text',
        footer: 'Footer',
        buttonLabel: 'Choose',
        sections: [{ title: 'Sec', rows: [{ id: 'r1', title: 'Row 1' }] }],
      })
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: 'interactive' }),
        expect.any(Object)
      )
    })

    it('sendInteractiveButtons sends buttons via Meta API', async () => {
      const axios = require('axios')
      await sender.sendInteractiveButtons('9876543210', {
        body: 'Pick one',
        footer: 'Footer',
        buttons: [{ id: 'b1', title: 'Button 1' }],
      })
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: 'interactive' }),
        expect.any(Object)
      )
    })

    it('sendDocument sends document via Meta API', async () => {
      const axios = require('axios')
      await sender.sendDocument('9876543210', {
        url: 'https://example.com/file.pdf',
        filename: 'file.pdf',
        caption: 'Here is a file',
      })
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: 'document' }),
        expect.any(Object)
      )
    })

    it('sendInteractiveList works without header/footer', async () => {
      const axios = require('axios')
      await sender.sendInteractiveList('9876543210', {
        body: 'Body text',
        sections: [{ title: 'Sec', rows: [{ id: 'r1', title: 'Row 1' }] }],
      })
      expect(axios.post).toHaveBeenCalled()
    })

    it('sendInteractiveButtons works without footer', async () => {
      const axios = require('axios')
      await sender.sendInteractiveButtons('9876543210', {
        body: 'Pick one',
        buttons: [{ id: 'b1', title: 'Button 1' }],
      })
      expect(axios.post).toHaveBeenCalled()
    })

    it('throws when WA_TOKEN or WA_PHONE_ID is missing', () => {
      delete process.env.WA_TOKEN
      delete process.env.WA_PHONE_ID
      jest.resetModules()
      jest.mock('axios', () => ({
        post: jest.fn().mockResolvedValue({ data: {} }),
      }))
      jest.mock('twilio', () => jest.fn(() => ({ messages: { create: jest.fn() } })))
      const s = require('../src/services/whatsapp-sender')
      expect(s.sendText('9876543210', 'Hi')).rejects.toThrow('WA_TOKEN and WA_PHONE_ID must be set')
    })
  })

  describe('Twilio path', () => {
    beforeEach(() => {
      process.env.TWILIO_ACCOUNT_SID   = 'AC123'
      process.env.TWILIO_AUTH_TOKEN     = 'token123'
      process.env.TWILIO_SANDBOX_NUMBER = '14155238886'
      delete process.env.WA_TOKEN
      delete process.env.WA_PHONE_ID
      sender = require('../src/services/whatsapp-sender')
    })

    it('sendText sends via Twilio', async () => {
      const tw = require('twilio')
      await sender.sendText('9876543210', 'Hello from Twilio')
      const client = tw()
      expect(client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'whatsapp:+14155238886',
          to: 'whatsapp:+919876543210',
          body: 'Hello from Twilio',
        })
      )
    })

    it('sendInteractiveList renders as numbered text menu', async () => {
      const tw = require('twilio')
      await sender.sendInteractiveList('9876543210', {
        header: 'Choose Project',
        body: 'Select one:',
        sections: [{
          rows: [
            { id: 'p1', title: 'Project A', description: 'Desc A' },
            { id: 'p2', title: 'Project B' },
          ],
        }],
      })
      const client = tw()
      const call = client.messages.create.mock.calls[0][0]
      expect(call.body).toContain('1.')
      expect(call.body).toContain('Project A')
      expect(call.body).toContain('2.')
      expect(call.body).toContain('Reply with the number')
    })

    it('sendInteractiveButtons renders as numbered text menu', async () => {
      const tw = require('twilio')
      await sender.sendInteractiveButtons('9876543210', {
        body: 'Choose time:',
        buttons: [
          { id: 'b1', title: 'Morning' },
          { id: 'b2', title: 'Afternoon' },
        ],
      })
      const client = tw()
      const call = client.messages.create.mock.calls[0][0]
      expect(call.body).toContain('1.')
      expect(call.body).toContain('Morning')
    })

    it('sendDocument sends as text link', async () => {
      const tw = require('twilio')
      await sender.sendDocument('9876543210', {
        url: 'https://example.com/brochure.pdf',
        filename: 'brochure.pdf',
        caption: 'Your brochure',
      })
      const client = tw()
      const call = client.messages.create.mock.calls[0][0]
      expect(call.body).toContain('https://example.com/brochure.pdf')
      expect(call.body).toContain('Your brochure')
    })

    it('uses messagingServiceSid when configured', async () => {
      process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG123'
      jest.resetModules()
      jest.mock('twilio', () => {
        const mockCreate = jest.fn().mockResolvedValue({ sid: 'twilio-sid-2' })
        return jest.fn(() => ({ messages: { create: mockCreate } }))
      })
      jest.mock('axios', () => ({ post: jest.fn() }))
      const s = require('../src/services/whatsapp-sender')
      const tw = require('twilio')
      await s.sendText('9876543210', 'Test')
      const client = tw()
      const call = client.messages.create.mock.calls[0][0]
      expect(call.messagingServiceSid).toBe('MG123')
      expect(call.from).toBeUndefined()
    })
  })
})
