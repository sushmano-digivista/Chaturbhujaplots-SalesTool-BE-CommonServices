'use strict'
const express  = require('express')
const { getOwnerPhone, getOwnerEmail, getAparnContactAddress } = require('../services/settings.service')

const router = express.Router()

// GET /api/v1/settings/contact
// Returns all contact-related settings from MongoDB
router.get('/contact', async (req, res) => {
  try {
    const [ownerPhone, ownerEmail, aparna_contact_address] = await Promise.all([
      getOwnerPhone(),
      getOwnerEmail(),
      getAparnContactAddress(),
    ])
    res.json({ ownerPhone, ownerEmail, aparna_contact_address })
  } catch (err) {
    console.error('[settings] Failed to fetch contact settings:', err.message)
    res.status(500).json({ message: 'Failed to fetch settings' })
  }
})

module.exports = router
