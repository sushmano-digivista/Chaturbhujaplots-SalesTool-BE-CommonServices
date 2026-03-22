/**
 * siteVisit.routes.js
 * POST /api/v1/site-visit — book a site visit
 *   Sends confirmation to customer (email + WhatsApp if details provided)
 *   AND notification to owner (email + WhatsApp always)
 *
 * Body: { name, phone, email?, project?, date }
 */
const router = require('express').Router()
const {
  sendCustomerEmail,
  sendOwnerEmail,
  sendCustomerWhatsApp,
  sendOwnerWhatsApp,
} = require('../services/siteVisit.service')

router.post('/', async (req, res) => {
  const { name, phone, email, project, date } = req.body

  // Validation
  if (!name?.trim())  return res.status(400).json({ message: 'name is required' })
  if (!phone?.trim()) return res.status(400).json({ message: 'phone is required' })
  if (!date?.trim())  return res.status(400).json({ message: 'date is required' })

  const payload = { name: name.trim(), phone: phone.trim(), email: email?.trim(), project: project?.trim(), date: date.trim() }

  // Fire all 4 notifications concurrently — don't fail if one channel errors
  const results = await Promise.allSettled([
    sendCustomerEmail(payload),
    sendOwnerEmail(payload),
    sendCustomerWhatsApp(payload),
    sendOwnerWhatsApp(payload),
  ])

  const [custEmail, ownerEmail, custWA, ownerWA] = results.map(r => ({
    status: r.status,
    ...(r.status === 'fulfilled' ? r.value || {} : { error: r.reason?.message }),
  }))

  res.json({
    success: true,
    message: 'Site visit booked! Confirmation sent.',
    notifications: {
      customerEmail:    custEmail,
      ownerEmail:       ownerEmail,
      customerWhatsApp: custWA,
      ownerWhatsApp:    ownerWA,
    },
  })
})

module.exports = router
