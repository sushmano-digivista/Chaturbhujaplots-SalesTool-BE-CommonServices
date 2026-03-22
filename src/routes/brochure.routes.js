/**
 * brochure.routes.js
 * POST /api/v1/brochure/email    — send brochure via email
 * POST /api/v1/brochure/whatsapp — send brochure via WhatsApp
 */
const router = require('express').Router()
const { sendBrochureEmail }    = require('../services/email.service')
const { sendBrochureWhatsApp } = require('../services/whatsapp.service')

// ── POST /api/v1/brochure/email ───────────────────────────────────────────────
// Body: { email, name, projectId, projectName }
router.post('/email', async (req, res) => {
  const { email, name, projectId, projectName } = req.body

  if (!email) return res.status(400).json({ message: 'email is required' })

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email))
    return res.status(400).json({ message: 'Invalid email address' })

  try {
    const result = await sendBrochureEmail({ to: email, name, projectId, projectName })
    res.json({ success: true, message: 'Brochure sent to your email!', ...result })
  } catch (err) {
    console.error('Email send error:', err.message)
    res.status(500).json({ message: 'Failed to send email. Please try again.', error: err.message })
  }
})

// ── POST /api/v1/brochure/whatsapp ────────────────────────────────────────────
// Body: { phone, name, projectId, projectName }
router.post('/whatsapp', async (req, res) => {
  const { phone, name, projectId, projectName } = req.body

  if (!phone) return res.status(400).json({ message: 'phone is required' })

  try {
    const result = await sendBrochureWhatsApp({ phone, name, projectId, projectName })
    res.json({ success: true, message: 'Brochure sent via WhatsApp!', ...result })
  } catch (err) {
    console.error('WhatsApp send error:', err.message)
    res.status(500).json({ message: 'Failed to send WhatsApp. Please try again.', error: err.message })
  }
})

module.exports = router
