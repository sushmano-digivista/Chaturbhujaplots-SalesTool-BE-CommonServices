'use strict'
const mongoose = require('mongoose')

// Inline schema — no separate model file needed
const Settings = mongoose.models.Settings || mongoose.model('Settings',
  new mongoose.Schema(
    { key: { type: String, required: true, unique: true },
      value: { type: String, required: true } },
    { timestamps: true }
  )
)

// 5-minute in-memory cache
let _cache = {}
let _cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

async function getSetting(key, fallback = '') {
  const now = Date.now()
  if (_cache[key] !== undefined && (now - _cacheTime) < CACHE_TTL) return _cache[key]
  try {
    const doc = await Settings.findOne({ key })
    if (doc) { _cache[key] = doc.value; _cacheTime = now; return doc.value }
  } catch (e) {
    console.warn(`[settings] DB lookup failed for '${key}':`, e.message)
  }
  return fallback
}

async function getOwnerPhone()          { return getSetting('ownerPhone',           process.env.OWNER_PHONE || '') }
async function getOwnerEmail()          { return getSetting('ownerEmail',            process.env.OWNER_EMAIL || '') }
async function getAparnContactAddress() { return getSetting('aparna_contact_address', '') }

module.exports = { getSetting, getOwnerPhone, getOwnerEmail, getAparnContactAddress }
