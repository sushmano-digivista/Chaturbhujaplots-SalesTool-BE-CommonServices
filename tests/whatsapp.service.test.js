'use strict'
/**
 * tests/whatsapp.service.test.js
 * Tests for whatsapp.service.js — sendBrochureWhatsApp
 */

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    data: { messages: [{ id: 'wa-msg-123' }] },
  }),
}))

const axios = require('axios')

describe('sendBrochureWhatsApp', () => {
  afterEach(() => {
    delete process.env.WA_TOKEN
    delete process.env.WA_PHONE_ID
    jest.clearAllMocks()
  })

  it('sends via Cloud API when WA_TOKEN and WA_PHONE_ID are set', async () => {
    process.env.WA_TOKEN    = 'test-token'
    process.env.WA_PHONE_ID = 'phone-id-123'
    const { sendBrochureWhatsApp } = require('../src/services/whatsapp.service')

    const result = await sendBrochureWhatsApp({
      phone: '9876543210',
      name: 'Ravi',
      projectId: 'anjana',
      projectName: 'Anjana Paradise',
    })

    expect(result.success).toBe(true)
    expect(result.method).toBe('cloud_api')
    expect(result.messageId).toBe('wa-msg-123')
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('graph.facebook.com'),
      expect.objectContaining({
        messaging_product: 'whatsapp',
        type: 'text',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    )
  })

  it('returns deep-link when Cloud API env vars are not set', async () => {
    delete process.env.WA_TOKEN
    delete process.env.WA_PHONE_ID
    jest.resetModules()
    jest.mock('axios', () => ({ post: jest.fn() }))
    const { sendBrochureWhatsApp } = require('../src/services/whatsapp.service')

    const result = await sendBrochureWhatsApp({
      phone: '9876543210',
      name: 'Ravi',
      projectId: 'anjana',
      projectName: 'Anjana Paradise',
    })

    expect(result.success).toBe(true)
    expect(result.method).toBe('deeplink')
    expect(result.deepLink).toContain('wa.me')
  })

  it('falls back to general brochure for unknown projectId', async () => {
    process.env.WA_TOKEN    = 'test-token'
    process.env.WA_PHONE_ID = 'phone-id-123'
    jest.resetModules()
    jest.mock('axios', () => ({
      post: jest.fn().mockResolvedValue({
        data: { messages: [{ id: 'wa-msg-456' }] },
      }),
    }))
    const { sendBrochureWhatsApp } = require('../src/services/whatsapp.service')
    const ax = require('axios')

    await sendBrochureWhatsApp({
      phone: '9876543210',
      name: 'Test',
      projectId: 'unknown',
      projectName: '',
    })

    expect(ax.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.objectContaining({
          body: expect.stringContaining('Chaturbhuja_Overview_Brochure.pdf'),
        }),
      }),
      expect.any(Object)
    )
  })

  it('uses default name when name is empty', async () => {
    process.env.WA_TOKEN    = 'test-token'
    process.env.WA_PHONE_ID = 'phone-id-123'
    jest.resetModules()
    jest.mock('axios', () => ({
      post: jest.fn().mockResolvedValue({
        data: { messages: [{ id: 'wa-msg-789' }] },
      }),
    }))
    const { sendBrochureWhatsApp } = require('../src/services/whatsapp.service')
    const ax = require('axios')

    await sendBrochureWhatsApp({
      phone: '9876543210',
      name: '',
      projectId: 'aparna',
      projectName: 'Aparna Legacy',
    })

    expect(ax.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.objectContaining({
          body: expect.stringContaining('there'),
        }),
      }),
      expect.any(Object)
    )
  })

  it('normalises phone number (strips non-digits, prepends 91)', async () => {
    delete process.env.WA_TOKEN
    delete process.env.WA_PHONE_ID
    jest.resetModules()
    jest.mock('axios', () => ({ post: jest.fn() }))
    const { sendBrochureWhatsApp } = require('../src/services/whatsapp.service')

    const result = await sendBrochureWhatsApp({
      phone: '+91-9876-543-210',
      name: 'Test',
      projectId: 'anjana',
      projectName: '',
    })

    expect(result.deepLink).toContain('919876543210')
  })
})
