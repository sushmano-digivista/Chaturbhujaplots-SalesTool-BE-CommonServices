'use strict'
/**
 * settings.service.js
 *
 * Fetches owner contact details (phone, email) from MongoDB Settings collection.
 * Falls back to environment variables if DB value is not found.
 * Uses an in-memory cache (5 min TTL) to avoid hitting DB on every message.
 */
const Settings = require('../models/settings.model')

let cache = {}
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getSetting(key, fallback = '') {
  const now = Date.now()
  if (cache[key] !== undefined && (now - cacheTime) < CACHE_TTL) {
    return cache[key]
  }
  try {
    const doc = await Settings.findOne({ key })
    if (doc) {
      cache[key] = doc.value
      cacheTime = now
      console.log(`[settings] Loaded '${key}' from DB`)
      return doc.value
    }
  } catch (e) {
    console.warn(`[settings] DB lookup failed for '${key}':`, e.message)
  }
  console.warn(`[settings] '${key}' not found in DB, using fallback`)
  return fallback
}

async function getOwnerPhone() {
  return getSetting('ownerPhone', process.env.OWNER_PHONE || '919739762698')
}

async function getOwnerEmail() {
  return getSetting('ownerEmail', process.env.OWNER_EMAIL || '')
}

module.exports = { getSetting, getOwnerPhone, getOwnerEmail }