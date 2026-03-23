/**
 * sanitize.js — Input sanitisation helpers.
 *
 * Security fixes:
 *  - CWE-80 / Sonar S5131: user-supplied values (name, email, phone, project,
 *    date) are interpolated directly into HTML email bodies.  Without escaping,
 *    a malicious customer could inject arbitrary HTML/JS into the email sent to
 *    the property owner (Stored XSS via email).
 *
 *  escapeHtml()  — use this before inserting any user value into an HTML string.
 *  sanitizePhone() — strips non-digit chars, validates Indian mobile format.
 *  sanitizeText()  — trims whitespace and removes control characters.
 */
'use strict'

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
}

/**
 * Escapes HTML special characters in a string value.
 * Returns '' for null / undefined / non-string inputs.
 *
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"'/]/g, (ch) => HTML_ESCAPE_MAP[ch])
}

/**
 * Strips non-digit characters and validates an Indian mobile number.
 * Returns the cleaned digits-only string, or throws on invalid input.
 *
 * @param {string} phone
 * @returns {string}  — digits only (10 or 12 with country code)
 */
function sanitizePhone(phone) {
  if (!phone) throw new Error('Phone number is required')
  const digits = String(phone).replace(/[^\d]/g, '')
  // Accept 10-digit or 91-prefixed 12-digit numbers
  if (!/^(?:91)?[6-9]\d{9}$/.test(digits)) {
    throw new Error('Invalid Indian mobile number')
  }
  return digits
}

/**
 * Trims leading/trailing whitespace and removes ASCII control characters.
 * Safe to use for name, project, date fields.
 *
 * @param {*} value
 * @returns {string}
 */
function sanitizeText(value) {
  if (value === null || value === undefined) return ''
  // eslint-disable-next-line no-control-regex
  return String(value).trim().replace(/[\x00-\x1F\x7F]/g, '')
}

module.exports = { escapeHtml, sanitizePhone, sanitizeText }
