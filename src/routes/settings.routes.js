'use strict'
/**
 * settings.routes.js
 * Public endpoint to expose owner contact settings from MongoDB.
 * GET /api/v1/settings/contact → { ownerPhone, ownerEmail }
 */
const express = require('express')
const router  = express.Router()
const { getOwnerPhone, getOwnerEmail } = require('../services/settings.service')

router.get('/contact', async (req, res) => {
  try {
    const [ownerPhone, ownerEmail] = await Promise.all([
      getOwnerPhone(),
      getOwnerEmail(),
    ])
    res.json({ ownerPhone, ownerEmail })
  } catch (err) {
    console.error('[settings.routes] Failed to fetch contact settings:', err.message)
    res.status(500).json({ error: 'Failed to load contact settings' })
  }
})

module.exports = router
