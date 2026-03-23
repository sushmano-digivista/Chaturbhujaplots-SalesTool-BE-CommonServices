/**
 * brochure.routes.js
 * POST /api/v1/brochure/email    — send brochure via email
 * POST /api/v1/brochure/whatsapp — send brochure via WhatsApp
 */
const router = require('express').Router()
const { sendBrochureEmail }    = require('../services/email.service')
const { sendBrochureWhatsApp } = require('../services/whatsapp.service')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^(?:91)?[6-9]\d{9}$/

// ── POST /api/v1/brochure/email ───────────────────────────────────────────────
// Body: { email, name, projectId, projectName }
router.post('/email', async (req, res) => {
  const { email, name, projectId, projectName } = req.body

  if (!email)                    return res.status(400).json({ message: 'email is required' })
  if (!EMAIL_REGEX.test(email))  return res.status(400).json({ message: 'Invalid email address' })

  try {
    const result = await sendBrochureEmail({ to: email, name, projectId, projectName })
    res.json({ success: true, message: 'Brochure sent to your email!', ...result })
  } catch (err) {
    console.error('Email send error:', err.message)
    res.status(500).json({ message: 'Failed to send email. Please try again.' })
  }
})

// ── POST /api/v1/brochure/whatsapp ────────────────────────────────────────────
// Body: { phone, name, projectId, projectName }
router.post('/whatsapp', async (req, res) => {
  const { phone, name, projectId, projectName } = req.body

  if (!phone) return res.status(400).json({ message: 'phone is required' })

  // Validate phone number format (Sonar S4823 — add missing input validation)
  const cleanPhone = String(phone).replace(/[^\d]/g, '')
  if (!PHONE_REGEX.test(cleanPhone))
    return res.status(400).json({ message: 'Invalid phone number — must be a valid Indian mobile number' })

  try {
    const result = await sendBrochureWhatsApp({ phone: cleanPhone, name, projectId, projectName })
    res.json({ success: true, message: 'Brochure sent via WhatsApp!', ...result })
  } catch (err) {
    console.error('WhatsApp send error:', err.message)
    res.status(500).json({ message: 'Failed to send WhatsApp. Please try again.' })
  }
})

module.exports = router
