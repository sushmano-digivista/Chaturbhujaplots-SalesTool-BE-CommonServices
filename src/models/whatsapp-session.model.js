'use strict'
/**
 * whatsapp-session.model.js
 *
 * Stores the per-user conversation state for the WhatsApp questionnaire bot.
 * Each document represents one active or completed session keyed by phone (E.164).
 *
 * Flow steps:
 *  WELCOME       → Send greeting + project list
 *  AWAIT_PROJECT → Waiting for user to pick a project
 *  AWAIT_VISIT   → Waiting for preferred visit time
 *  AWAIT_CALLBACK→ Waiting for callback time preference
 *  BROCHURE_SENT → Brochure(s) dispatched — session complete
 */
const mongoose = require('mongoose')

const STEPS = ['WELCOME', 'AWAIT_PROJECT', 'AWAIT_VISIT', 'AWAIT_CALLBACK', 'BROCHURE_SENT', 'DONE']

const whatsappSessionSchema = new mongoose.Schema({
  phone:       { type: String, required: true, unique: true, index: true }, // E.164 without +
  name:        { type: String, default: '' },
  step:        { type: String, enum: STEPS, default: 'WELCOME' },
  // Collected answers
  projectId:   { type: String, default: '' },   // 'anjana' | 'aparna' | 'varaha' | 'trimbak' | 'any'
  projectName: { type: String, default: '' },
  visitTime:   { type: String, default: '' },
  callbackTime:{ type: String, default: '' },
  // Meta
  messageCount:{ type: Number, default: 0 },
  lastActivity:{ type: Date,   default: Date.now },
  completed:   { type: Boolean, default: false },
}, { timestamps: true })

// Auto-expire sessions after 24 h of inactivity
whatsappSessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 86400 })

module.exports = mongoose.model('WhatsappSession', whatsappSessionSchema, 'whatsapp_sessions')
