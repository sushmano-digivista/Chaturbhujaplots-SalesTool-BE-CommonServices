'use strict'
/**
 * tests/questionnaire.test.js
 * Tests the full WhatsApp questionnaire state machine and webhook route.
 */

const request = require('supertest')
const express = require('express')

// ── Mock external dependencies ────────────────────────────────────────────────
jest.mock('../src/services/whatsapp-sender', () => ({
  sendText:               jest.fn().mockResolvedValue({}),
  sendInteractiveList:    jest.fn().mockResolvedValue({}),
  sendInteractiveButtons: jest.fn().mockResolvedValue({}),
  sendDocument:           jest.fn().mockResolvedValue({}),
  normalisePhone:         jest.fn(p => `91${String(p).replace(/[^0-9]/g, '').slice(-10)}`),
}))

const sender = require('../src/services/whatsapp-sender')

// ── In-memory session store (replaces MongoDB) ────────────────────────────────
const sessionStore = {}

jest.mock('../src/models/whatsapp-session.model', () => {
  function SessionDoc(data) {
    Object.assign(this, {
      step: 'WELCOME', projectId: '', projectName: '',
      visitTime: '', callbackTime: '', messageCount: 0,
      lastActivity: new Date(), completed: false,
    }, data)
    this.save = jest.fn().mockImplementation(() => {
      sessionStore[this.phone] = { ...this }
      return Promise.resolve(this)
    })
  }
  const Model = {
    findOne: jest.fn(({ phone }) => Promise.resolve(
      sessionStore[phone] ? Object.assign(new SessionDoc({}), sessionStore[phone], {
        save: jest.fn().mockImplementation(function() {
          sessionStore[this.phone] = { ...this }
          return Promise.resolve(this)
        }),
      }) : null
    )),
    create: jest.fn((data) => {
      const doc = new SessionDoc(data)
      sessionStore[doc.phone] = { ...doc }
      return Promise.resolve(doc)
    }),
  }
  return Model
})

process.env.WA_TOKEN       = 'test-token'
process.env.WA_PHONE_ID    = 'test-phone-id'
process.env.WA_VERIFY_TOKEN = 'test-verify-token'
process.env.OWNER_PHONE    = '919999999999'

const { handleIncomingMessage } = require('../src/services/questionnaire.service')
const webhookRoutes = require('../src/routes/webhook.routes')

const app = express()
app.use(express.json())
app.use('/api/v1/webhook', webhookRoutes)

// ── Test helpers ──────────────────────────────────────────────────────────────

function textMsg(text) { return { type: 'text', text: { body: text } } }
function replyMsg(id, title) {
  return { type: 'interactive', interactive: { list_reply: { id, title } } }
}
function btnMsg(id, title) {
  return { type: 'interactive', interactive: { button_reply: { id, title } } }
}
function makeWebhookBody(phone, message) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{ from: phone, ...message }] } }] }],
  }
}

// ── Questionnaire flow tests ──────────────────────────────────────────────────

describe('Questionnaire flow', () => {
  const PHONE = '919876500001'

  beforeEach(() => {
    delete sessionStore[PHONE]
    jest.clearAllMocks()
    sender.normalisePhone.mockImplementation(p => `91${String(p).replace(/[^0-9]/g, '').slice(-10)}`)
  })

  it('Step 1: hi triggers welcome + project list', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    expect(sender.sendText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Welcome'))
    expect(sender.sendInteractiveList).toHaveBeenCalledTimes(1)
  })

  it('Step 1: hello also triggers welcome', async () => {
    await handleIncomingMessage(PHONE, textMsg('hello'))
    expect(sender.sendText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Welcome'))
  })

  it('Step 2: selecting Anjana advances to visit question', async () => {
    // Set up session at AWAIT_PROJECT
    await handleIncomingMessage(PHONE, textMsg('hi'))
    jest.clearAllMocks()

    await handleIncomingMessage(PHONE, replyMsg('proj_anjana', 'Anjana Paradise'))
    expect(sender.sendInteractiveButtons).toHaveBeenCalledTimes(1)
    expect(sessionStore[PHONE].projectId).toBe('anjana')
    expect(sessionStore[PHONE].step).toBe('AWAIT_VISIT')
  })

  it('Step 2: selecting any project sends all brochures at the end', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_any', 'Any / All Projects'))
    expect(sessionStore[PHONE].projectId).toBe('any')
  })

  it('Step 2: invalid reply prompts re-send of project list', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    jest.clearAllMocks()
    await handleIncomingMessage(PHONE, textMsg('random text'))
    expect(sender.sendInteractiveList).toHaveBeenCalledTimes(1)
  })

  it('Step 3: visit time button advances to callback question', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_anjana', 'Anjana Paradise'))
    jest.clearAllMocks()

    await handleIncomingMessage(PHONE, btnMsg('visit_morning', 'Morning (9am–12pm)'))
    expect(sender.sendInteractiveButtons).toHaveBeenCalledTimes(1)
    expect(sessionStore[PHONE].visitTime).toBe('Morning (9am–12pm)')
    expect(sessionStore[PHONE].step).toBe('AWAIT_CALLBACK')
  })

  it('Step 3: skip visit time also advances', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_varaha', 'Varaha Virtue'))
    jest.clearAllMocks()

    await handleIncomingMessage(PHONE, btnMsg('visit_skip', 'Skip for now'))
    expect(sessionStore[PHONE].visitTime).toBe('Skipped')
    expect(sessionStore[PHONE].step).toBe('AWAIT_CALLBACK')
  })

  it('Step 3: text "skip" also advances visit step', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_anjana', 'Anjana Paradise'))
    await handleIncomingMessage(PHONE, textMsg('skip'))
    expect(sessionStore[PHONE].step).toBe('AWAIT_CALLBACK')
  })

  it('Step 3: invalid visit reply re-sends visit buttons', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_anjana', 'Anjana Paradise'))
    jest.clearAllMocks()
    await handleIncomingMessage(PHONE, textMsg('nonsense'))
    expect(sender.sendInteractiveButtons).toHaveBeenCalled()
    expect(sessionStore[PHONE].step).toBe('AWAIT_VISIT')
  })

  it('Step 4: callback button sends brochures + notifies owner', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_anjana', 'Anjana Paradise'))
    await handleIncomingMessage(PHONE, btnMsg('visit_morning', 'Morning (9am–12pm)'))
    jest.clearAllMocks()

    await handleIncomingMessage(PHONE, btnMsg('cb_afternoon', 'Afternoon (12pm–4pm)'))

    expect(sender.sendText).toHaveBeenCalled()        // thank-you + owner notify
    expect(sender.sendDocument).toHaveBeenCalledTimes(1)  // single project brochure
    expect(sessionStore[PHONE].completed).toBe(true)
    expect(sessionStore[PHONE].callbackTime).toBe('Afternoon (12pm–4pm)')
  })

  it('Step 4: selecting "any" sends all 4 brochures', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_any', 'Any / All Projects'))
    await handleIncomingMessage(PHONE, btnMsg('visit_skip', 'Skip for now'))
    jest.clearAllMocks()

    await handleIncomingMessage(PHONE, btnMsg('cb_skip', 'Skip for now'))

    expect(sender.sendDocument).toHaveBeenCalledTimes(4)  // all 4 brochures
  })

  it('Step 4: skip callback also completes the flow', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_anjana', 'Anjana Paradise'))
    await handleIncomingMessage(PHONE, btnMsg('visit_skip', 'Skip for now'))
    await handleIncomingMessage(PHONE, btnMsg('cb_skip', 'Skip for now'))
    expect(sessionStore[PHONE].step).toBe('DONE')
  })

  it('DONE step: sends "already captured" message on further input', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_anjana', 'Anjana Paradise'))
    await handleIncomingMessage(PHONE, btnMsg('visit_skip', 'Skip for now'))
    await handleIncomingMessage(PHONE, btnMsg('cb_skip', 'Skip for now'))
    jest.clearAllMocks()

    await handleIncomingMessage(PHONE, textMsg('hello again'))
    expect(sender.sendText).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('already captured')
    )
  })

  it('Restart: typing "hi" after DONE resets the session', async () => {
    await handleIncomingMessage(PHONE, textMsg('hi'))
    await handleIncomingMessage(PHONE, replyMsg('proj_anjana', 'Anjana Paradise'))
    await handleIncomingMessage(PHONE, btnMsg('visit_skip', 'Skip for now'))
    await handleIncomingMessage(PHONE, btnMsg('cb_skip', 'Skip for now'))
    jest.clearAllMocks()

    await handleIncomingMessage(PHONE, textMsg('hi'))
    expect(sender.sendText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Welcome'))
    expect(sessionStore[PHONE].completed).toBe(false)
  })
})

// ── Webhook route tests ───────────────────────────────────────────────────────

describe('GET /api/v1/webhook (Meta verification)', () => {
  it('returns challenge when verify token matches', async () => {
    const res = await request(app)
      .get('/api/v1/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': 'abc123' })
    expect(res.status).toBe(200)
    expect(res.text).toBe('abc123')
  })

  it('returns 403 when token does not match', async () => {
    const res = await request(app)
      .get('/api/v1/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'abc123' })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/v1/webhook (incoming messages)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 immediately for valid payload', async () => {
    const body = makeWebhookBody('919876500002', textMsg('hi'))
    const res  = await request(app).post('/api/v1/webhook').send(body)
    expect(res.status).toBe(200)
  })

  it('ignores non-whatsapp_business_account objects', async () => {
    const res = await request(app).post('/api/v1/webhook')
      .send({ object: 'page', entry: [] })
    expect(res.status).toBe(200)
    expect(sender.sendText).not.toHaveBeenCalled()
  })

  it('ignores payloads with no messages array', async () => {
    const res = await request(app).post('/api/v1/webhook').send({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: {} }] }],
    })
    expect(res.status).toBe(200)
  })

  it('ignores unsupported message types (image, audio)', async () => {
    const body = makeWebhookBody('919876500003', { type: 'image', image: {} })
    const res  = await request(app).post('/api/v1/webhook').send(body)
    expect(res.status).toBe(200)
    expect(sender.sendText).not.toHaveBeenCalled()
  })
})
