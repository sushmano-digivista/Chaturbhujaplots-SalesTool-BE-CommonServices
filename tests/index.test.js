'use strict'
/**
 * tests/index.test.js
 * Tests for index.js — Express app setup, CORS, health endpoints,
 * MongoDB middleware, 404 handler, error handler.
 */

const request = require('supertest')

// ── Mock mongoose ────────────────────────────────────────────────────────────
jest.mock('mongoose', () => {
  const SchemaMock = jest.fn().mockImplementation(function () {
    this.index = jest.fn()
    return this
  })
  SchemaMock.Types = { Mixed: {} }
  return {
    connection: { readyState: 1 },
    connect:    jest.fn().mockResolvedValue({}),
    model:      jest.fn().mockReturnValue({}),
    models:     {},
    Schema:     SchemaMock,
  }
})

// ── Mock all route modules ───────────────────────────────────────────────────
jest.mock('../src/routes/media.routes', () => {
  const r = require('express').Router()
  r.get('/test', (_, res) => res.json({ route: 'media' }))
  return r
})
jest.mock('../src/routes/brochure.routes', () => {
  const r = require('express').Router()
  r.get('/test', (_, res) => res.json({ route: 'brochure' }))
  return r
})
jest.mock('../src/routes/siteVisit.routes', () => {
  const r = require('express').Router()
  r.get('/test', (_, res) => res.json({ route: 'siteVisit' }))
  return r
})
jest.mock('../src/routes/webhook.routes', () => {
  const r = require('express').Router()
  r.get('/test', (_, res) => res.json({ route: 'webhook' }))
  return r
})
jest.mock('../src/routes/settings.routes', () => {
  const r = require('express').Router()
  r.get('/test', (_, res) => res.json({ route: 'settings' }))
  return r
})

const mongoose = require('mongoose')

// Require app after mocks
const app = require('../src/index')

describe('Health endpoints', () => {
  it('GET /actuator/health returns UP', async () => {
    const res = await request(app).get('/actuator/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('UP')
  })

  it('GET /health returns UP with service name and version', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('UP')
    expect(res.body.service).toBe('common-service')
    expect(res.body.version).toBeDefined()
  })
})

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/unknown/path')
    expect(res.status).toBe(404)
    expect(res.body.message).toContain('Not found')
  })
})

describe('Route mounting', () => {
  it('mounts media routes at /api/v1/media', async () => {
    const res = await request(app).get('/api/v1/media/test')
    expect(res.status).toBe(200)
    expect(res.body.route).toBe('media')
  })

  it('mounts brochure routes at /api/v1/brochure', async () => {
    const res = await request(app).get('/api/v1/brochure/test')
    expect(res.status).toBe(200)
    expect(res.body.route).toBe('brochure')
  })

  it('mounts site-visit routes at /api/v1/site-visit', async () => {
    const res = await request(app).get('/api/v1/site-visit/test')
    expect(res.status).toBe(200)
    expect(res.body.route).toBe('siteVisit')
  })

  it('mounts webhook routes at /api/v1/webhook', async () => {
    const res = await request(app).get('/api/v1/webhook/test')
    expect(res.status).toBe(200)
    expect(res.body.route).toBe('webhook')
  })
})

describe('CORS', () => {
  it('allows requests with no origin (curl, Postman)', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
  })

  it('allows *.vercel.app origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://myapp.vercel.app')
    expect(res.status).toBe(200)
  })

  it('allows origins containing "chaturbhuja"', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://chaturbhuja.in')
    expect(res.status).toBe(200)
  })

  it('blocks disallowed origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://evil-site.com')
    expect(res.status).toBe(500)
  })
})

describe('MongoDB middleware', () => {
  it('passes through when MongoDB is already connected (readyState 1)', async () => {
    mongoose.connection.readyState = 1
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
  })

  it('returns 503 when MongoDB connection fails', async () => {
    mongoose.connection.readyState = 0
    mongoose.connect.mockRejectedValueOnce(new Error('Connection refused'))
    const res = await request(app).get('/health')
    expect(res.status).toBe(503)
    expect(res.body.message).toContain('Database unavailable')
    // Reset for other tests
    mongoose.connection.readyState = 1
  })
})
