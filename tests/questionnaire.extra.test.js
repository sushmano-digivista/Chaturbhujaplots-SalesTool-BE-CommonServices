'use strict'
/**
 * tests/questionnaire.extra.test.js
 * Additional tests for questionnaire.service.js to cover uncovered branches:
 * - Text-based project selection (by name, by number)
 * - Visit time text inputs (morning, afternoon, evening, numbered)
 * - Callback time text inputs (morning, afternoon, evening, numbered)
 * - Invalid callback re-prompt
 * - Owner notification failure handling
 */

jest.mock('../src/services/whatsapp-sender', () => ({
  sendText:               jest.fn().mockResolvedValue({}),
  sendInteractiveList:    jest.fn().mockResolvedValue({}),
  sendInteractiveButtons: jest.fn().mockResolvedValue({}),
  sendDocument:           jest.fn().mockResolvedValue({}),
  normalisePhone:         jest.fn(p => `91${String(p).replace(/[^0-9]/g, '').slice(-10)}`),
}))

const sender = require('../src/services/whatsapp-sender')

// ── In-memory session store ──────────────────────────────────────────────────
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
  return {
    findOne: jest.fn(({ phone }) => Promise.resolve(
      sessionStore[phone] ? Object.assign(new SessionDoc({}), sessionStore[phone], {
        save: jest.fn().mockImplementation(function () {
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
})

process.env.OWNER_PHONE = '919999999999'

const { handleIncomingMessage } = require('../src/services/questionnaire.service')

function textMsg(text) { return { type: 'text', text: { body: text } } }
function btnMsg(id, title) {
  return { type: 'interactive', interactive: { button_reply: { id, title } } }
}
function replyMsg(id, title) {
  return { type: 'interactive', interactive: { list_reply: { id, title } } }
}

describe('Questionnaire — extra branch coverage', () => {
  const PHONE = '919876500099'

  beforeEach(() => {
    delete sessionStore[PHONE]
    jest.clearAllMocks()
    sender.normalisePhone.mockImplementation(p => `91${String(p).replace(/[^0-9]/g, '').slice(-10)}`)
  })

  // ── Text-based project selection ────────────────────────────────────────
  describe('AWAIT_PROJECT text inputs', () => {
    beforeEach(async () => {
      await handleIncomingMessage(PHONE, textMsg('hi'))
      jest.clearAllMocks()
    })

    it('selects project by number "1" (anjana)', async () => {
      await handleIncomingMessage(PHONE, textMsg('1'))
      expect(sessionStore[PHONE].projectId).toBe('anjana')
      expect(sessionStore[PHONE].step).toBe('AWAIT_VISIT')
    })

    it('selects project by number "2" (aparna)', async () => {
      await handleIncomingMessage(PHONE, textMsg('2'))
      expect(sessionStore[PHONE].projectId).toBe('aparna')
    })

    it('selects project by number "3" (varaha)', async () => {
      await handleIncomingMessage(PHONE, textMsg('3'))
      expect(sessionStore[PHONE].projectId).toBe('varaha')
    })

    it('selects project by number "4" (trimbak)', async () => {
      await handleIncomingMessage(PHONE, textMsg('4'))
      expect(sessionStore[PHONE].projectId).toBe('trimbak')
    })

    it('selects project by number "5" (any)', async () => {
      await handleIncomingMessage(PHONE, textMsg('5'))
      expect(sessionStore[PHONE].projectId).toBe('any')
    })

    it('selects project by partial name "anjana"', async () => {
      await handleIncomingMessage(PHONE, textMsg('anjana'))
      expect(sessionStore[PHONE].projectId).toBe('anjana')
    })

    it('selects project by title match "aparna legacy"', async () => {
      await handleIncomingMessage(PHONE, textMsg('aparna legacy'))
      expect(sessionStore[PHONE].projectId).toBe('aparna')
    })
  })

  // ── Visit time text inputs ──────────────────────────────────────────────
  describe('AWAIT_VISIT text inputs', () => {
    beforeEach(async () => {
      await handleIncomingMessage(PHONE, textMsg('hi'))
      await handleIncomingMessage(PHONE, textMsg('1'))
      jest.clearAllMocks()
    })

    it('text "1" selects Morning', async () => {
      await handleIncomingMessage(PHONE, textMsg('1'))
      expect(sessionStore[PHONE].visitTime).toBe('Morning (9am–12pm)')
    })

    it('text "2" selects Afternoon', async () => {
      await handleIncomingMessage(PHONE, textMsg('2'))
      expect(sessionStore[PHONE].visitTime).toBe('Afternoon (12pm–4pm)')
    })

    it('text "3" selects Skipped', async () => {
      await handleIncomingMessage(PHONE, textMsg('3'))
      expect(sessionStore[PHONE].visitTime).toBe('Skipped')
    })

    it('text "no" selects Skipped', async () => {
      await handleIncomingMessage(PHONE, textMsg('no'))
      expect(sessionStore[PHONE].visitTime).toBe('Skipped')
    })

    it('text "not now" selects Skipped', async () => {
      await handleIncomingMessage(PHONE, textMsg('not now'))
      expect(sessionStore[PHONE].visitTime).toBe('Skipped')
    })

    it('text "later" selects Skipped', async () => {
      await handleIncomingMessage(PHONE, textMsg('later'))
      expect(sessionStore[PHONE].visitTime).toBe('Skipped')
    })

    it('text "morning" selects Morning', async () => {
      await handleIncomingMessage(PHONE, textMsg('morning'))
      expect(sessionStore[PHONE].visitTime).toBe('Morning (9am–12pm)')
    })

    it('text "afternoon" selects Afternoon', async () => {
      await handleIncomingMessage(PHONE, textMsg('afternoon'))
      expect(sessionStore[PHONE].visitTime).toBe('Afternoon (12pm–4pm)')
    })

    it('text "evening" selects Evening', async () => {
      await handleIncomingMessage(PHONE, textMsg('evening'))
      expect(sessionStore[PHONE].visitTime).toBe('Evening (4pm–7pm)')
    })

    it('reply with visit_afternoon id works', async () => {
      await handleIncomingMessage(PHONE, btnMsg('visit_afternoon', 'Afternoon (12pm–4pm)'))
      expect(sessionStore[PHONE].visitTime).toBe('Afternoon (12pm–4pm)')
    })
  })

  // ── Callback time text inputs ───────────────────────────────────────────
  describe('AWAIT_CALLBACK text inputs', () => {
    beforeEach(async () => {
      await handleIncomingMessage(PHONE, textMsg('hi'))
      await handleIncomingMessage(PHONE, textMsg('1'))
      await handleIncomingMessage(PHONE, textMsg('3')) // skip visit
      jest.clearAllMocks()
    })

    it('text "1" selects Morning', async () => {
      await handleIncomingMessage(PHONE, textMsg('1'))
      expect(sessionStore[PHONE].callbackTime).toBe('Morning (9am–12pm)')
    })

    it('text "2" selects Afternoon', async () => {
      await handleIncomingMessage(PHONE, textMsg('2'))
      expect(sessionStore[PHONE].callbackTime).toBe('Afternoon (12pm–4pm)')
    })

    it('text "3" selects Skipped', async () => {
      await handleIncomingMessage(PHONE, textMsg('3'))
      expect(sessionStore[PHONE].callbackTime).toBe('Skipped')
    })

    it('text "no" selects Skipped', async () => {
      await handleIncomingMessage(PHONE, textMsg('no'))
      expect(sessionStore[PHONE].callbackTime).toBe('Skipped')
    })

    it('text "not now" selects Skipped', async () => {
      await handleIncomingMessage(PHONE, textMsg('not now'))
      expect(sessionStore[PHONE].callbackTime).toBe('Skipped')
    })

    it('text "later" selects Skipped', async () => {
      await handleIncomingMessage(PHONE, textMsg('later'))
      expect(sessionStore[PHONE].callbackTime).toBe('Skipped')
    })

    it('text "morning" selects Morning', async () => {
      await handleIncomingMessage(PHONE, textMsg('morning'))
      expect(sessionStore[PHONE].callbackTime).toBe('Morning (9am–12pm)')
    })

    it('text "afternoon" selects Afternoon', async () => {
      await handleIncomingMessage(PHONE, textMsg('afternoon'))
      expect(sessionStore[PHONE].callbackTime).toBe('Afternoon (12pm–4pm)')
    })

    it('text "evening" selects Evening', async () => {
      await handleIncomingMessage(PHONE, textMsg('evening'))
      expect(sessionStore[PHONE].callbackTime).toBe('Evening (4pm–7pm)')
    })

    it('invalid callback text re-sends buttons', async () => {
      await handleIncomingMessage(PHONE, textMsg('xyz garbage'))
      expect(sender.sendInteractiveButtons).toHaveBeenCalled()
      expect(sessionStore[PHONE].step).toBe('AWAIT_CALLBACK')
    })

    it('reply with cb_morning id works', async () => {
      await handleIncomingMessage(PHONE, btnMsg('cb_morning', 'Morning (9am–12pm)'))
      expect(sessionStore[PHONE].callbackTime).toBe('Morning (9am–12pm)')
    })
  })

  // ── extractMessage edge cases ──────────────────────────────────────────
  describe('extractMessage edge cases', () => {
    it('handles unsupported message type gracefully', async () => {
      await handleIncomingMessage(PHONE, textMsg('hi'))
      jest.clearAllMocks()
      // Send a payload with unsupported type — should be treated as "other"
      await handleIncomingMessage(PHONE, { type: 'location', location: {} })
      // Should re-prompt for project since "other" kind has no text
      expect(sender.sendInteractiveList).toHaveBeenCalled()
    })
  })

  // ── Additional reset keywords ──────────────────────────────────────────
  describe('Reset keywords', () => {
    it('"start" triggers reset', async () => {
      await handleIncomingMessage(PHONE, textMsg('start'))
      expect(sender.sendText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Welcome'))
    })

    it('"restart" triggers reset', async () => {
      await handleIncomingMessage(PHONE, textMsg('restart'))
      expect(sender.sendText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Welcome'))
    })

    it('"hey" triggers reset', async () => {
      await handleIncomingMessage(PHONE, textMsg('hey'))
      expect(sender.sendText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Welcome'))
    })

    it('"namaste" triggers reset', async () => {
      await handleIncomingMessage(PHONE, textMsg('namaste'))
      expect(sender.sendText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Welcome'))
    })

    it('"hii" triggers reset', async () => {
      await handleIncomingMessage(PHONE, textMsg('hii'))
      expect(sender.sendText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Welcome'))
    })

    it('"helo" triggers reset', async () => {
      await handleIncomingMessage(PHONE, textMsg('helo'))
      expect(sender.sendText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Welcome'))
    })
  })

  // ── Owner notification failure (placed last to avoid mock leaks) ───────
  describe('Owner notification failure', () => {
    it('completes flow even when owner notification fails', async () => {
      // Use a fresh phone to avoid session pollution
      const PHONE2 = '919876500098'
      delete sessionStore[PHONE2]
      jest.clearAllMocks()
      sender.normalisePhone.mockImplementation(p => `91${String(p).replace(/[^0-9]/g, '').slice(-10)}`)

      await handleIncomingMessage(PHONE2, textMsg('hi'))
      await handleIncomingMessage(PHONE2, textMsg('1'))
      await handleIncomingMessage(PHONE2, textMsg('3')) // skip visit
      jest.clearAllMocks()
      sender.normalisePhone.mockImplementation(p => `91${String(p).replace(/[^0-9]/g, '').slice(-10)}`)

      // Make sendText fail only for the owner notification (the second sendText call in callback step)
      let callCount = 0
      sender.sendText.mockImplementation(() => {
        callCount++
        // First call = thank-you text, second call = owner notify
        if (callCount >= 2) return Promise.reject(new Error('Owner notify failed'))
        return Promise.resolve({})
      })
      await handleIncomingMessage(PHONE2, textMsg('3')) // skip callback
      expect(sessionStore[PHONE2].step).toBe('DONE')
      expect(sessionStore[PHONE2].completed).toBe(true)
    })
  })
})
