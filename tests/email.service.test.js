'use strict'
/**
 * tests/email.service.test.js
 * Tests for email.service.js — sendBrochureEmail
 */

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: '<test-msg-id>' }),
  }),
}))

const nodemailer = require('nodemailer')
const { sendBrochureEmail } = require('../src/services/email.service')

describe('sendBrochureEmail', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends email with correct fields for known project', async () => {
    const result = await sendBrochureEmail({
      to: 'user@example.com',
      name: 'Ravi',
      projectId: 'anjana',
      projectName: 'Anjana Paradise',
    })
    expect(result).toEqual({ success: true, messageId: '<test-msg-id>' })
    const transport = nodemailer.createTransport()
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Anjana Paradise'),
        html: expect.stringContaining('Ravi'),
      })
    )
  })

  it('falls back to general brochure for unknown projectId', async () => {
    const result = await sendBrochureEmail({
      to: 'user@example.com',
      name: 'Test',
      projectId: 'unknown_project',
      projectName: 'Unknown',
    })
    expect(result.success).toBe(true)
    const transport = nodemailer.createTransport()
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Chaturbhuja_Overview_Brochure.pdf'),
      })
    )
  })

  it('uses default name when name is empty', async () => {
    await sendBrochureEmail({
      to: 'user@example.com',
      name: '',
      projectId: 'anjana',
      projectName: '',
    })
    const transport = nodemailer.createTransport()
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Valued Customer'),
      })
    )
  })

  it('escapes HTML in user-supplied name', async () => {
    await sendBrochureEmail({
      to: 'user@example.com',
      name: '<script>alert("xss")</script>',
      projectId: 'anjana',
      projectName: 'Anjana Paradise',
    })
    const transport = nodemailer.createTransport()
    const call = transport.sendMail.mock.calls[0][0]
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&lt;script&gt;')
  })

  it('propagates errors from sendMail', async () => {
    const transport = nodemailer.createTransport()
    transport.sendMail.mockRejectedValueOnce(new Error('SMTP failed'))
    await expect(sendBrochureEmail({
      to: 'user@example.com',
      name: 'Test',
      projectId: 'anjana',
      projectName: 'Anjana Paradise',
    })).rejects.toThrow('SMTP failed')
  })
})
