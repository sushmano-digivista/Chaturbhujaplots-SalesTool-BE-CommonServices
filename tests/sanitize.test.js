/**
 * tests/sanitize.test.js
 * Unit tests for src/utils/sanitize.js
 *
 * Verifies that all user-supplied values are correctly escaped before
 * being embedded in HTML email bodies (CWE-80 / Sonar S5131 fix).
 */
'use strict'

const { escapeHtml, sanitizePhone, sanitizeText } = require('../src/utils/sanitize')

describe('escapeHtml (CWE-80 fix)', () => {
  it('escapes < and > to prevent tag injection', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;')
  })

  it('escapes & to &amp;', () => {
    expect(escapeHtml('Chaturbhuja Properties & Infra')).toBe('Chaturbhuja Properties &amp; Infra')
  })

  it('escapes double-quotes to prevent attribute injection', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;')
  })

  it('escapes single-quotes', () => {
    expect(escapeHtml("it's fine")).toBe('it&#x27;s fine')
  })

  it('escapes forward slashes', () => {
    expect(escapeHtml('path/to/resource')).toBe('path&#x2F;to&#x2F;resource')
  })

  it('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('')
  })

  it('leaves safe plain text unchanged', () => {
    expect(escapeHtml('Ravi Kumar')).toBe('Ravi Kumar')
  })

  it('converts non-string values to string then escapes', () => {
    expect(escapeHtml(42)).toBe('42')
  })

  it('blocks stored XSS via name field in email template', () => {
    const maliciousName = '<img src=x onerror=alert(document.cookie)>'
    const result = escapeHtml(maliciousName)
    // The < and > must be escaped so the browser never parses an <img> tag
    expect(result).not.toContain('<img')
    expect(result).not.toContain('>')
    expect(result).toContain('&lt;img')
    expect(result).toContain('&gt;')
  })
})

describe('sanitizePhone', () => {
  it('accepts a valid 10-digit Indian number', () => {
    expect(sanitizePhone('9876543210')).toBe('9876543210')
  })

  it('accepts with country code prefix 91', () => {
    expect(sanitizePhone('919876543210')).toBe('919876543210')
  })

  it('strips hyphens and spaces before validating', () => {
    expect(sanitizePhone('98-765-43210')).toBe('9876543210')
  })

  it('throws for a number starting with invalid digit', () => {
    expect(() => sanitizePhone('1234567890')).toThrow('Invalid Indian mobile number')
  })

  it('throws for empty input', () => {
    expect(() => sanitizePhone('')).toThrow('Phone number is required')
  })

  it('throws for null', () => {
    expect(() => sanitizePhone(null)).toThrow('Phone number is required')
  })

  it('throws for too-short number', () => {
    expect(() => sanitizePhone('98765')).toThrow('Invalid Indian mobile number')
  })
})

describe('sanitizeText', () => {
  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello')
  })

  it('strips ASCII control characters', () => {
    expect(sanitizeText('hello\x00world')).toBe('helloworld')
    expect(sanitizeText('line\x1Fbreak')).toBe('linebreak')
  })

  it('returns empty string for null', () => {
    expect(sanitizeText(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(sanitizeText(undefined)).toBe('')
  })

  it('preserves normal Unicode text', () => {
    expect(sanitizeText('Anjana Paradise 🏡')).toBe('Anjana Paradise 🏡')
  })
})
