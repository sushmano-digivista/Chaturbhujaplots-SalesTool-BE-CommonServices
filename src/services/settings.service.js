'use strict'
const Settings = require('../models/settings.model')

let cache = {}
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

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
