/**
 * tests/siteVisit.routes.test.js
 * Integration tests for POST /api/v1/site-visit
 *
 * Verifies input validation, concurrent notification dispatch,
 * and that partial notification failures don't break the response.
 */
'use strict'

const request = require('supertest')
const express = require('express')

jest.mock('../src/services/siteVisit.service', () => ({
  sendCustomerEmail:    jest.fn().mockResolvedValue({ status: 'sent' }),
  sendOwnerEmail:       jest.fn().mockResolvedValue({ status: 'sent' }),
  sendCustomerWhatsApp: jest.fn().mockResolvedValue({ method: 'cloud_api' }),
  sendOwnerWhatsApp:    jest.fn().mockResolvedValue({ method: 'cloud_api' }),
}))

const siteVisitRoutes = require('../src/routes/siteVisit.routes')
const svc = require('../src/services/siteVisit.service')

const app = express()
app.use(express.json())
app.use('/api/v1/site-visit', siteVisitRoutes)

describe('POST /api/v1/site-visit', () => {
  const VALID_BODY = {
    name:    'Ravi Kumar',
    phone:   '9876543210',
    email:   'ravi@example.com',
    project: 'Anjana Paradise',
    date:    '2025-04-15',
  }

  beforeEach(() => jest.clearAllMocks())

  it('returns 200 and fires all 4 notifications', async () => {
    const res = await request(app).post('/api/v1/site-visit').send(VALID_BODY)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(svc.sendCustomerEmail).toHaveBeenCalledTimes(1)
    expect(svc.sendOwnerEmail).toHaveBeenCalledTimes(1)
    expect(svc.sendCustomerWhatsApp).toHaveBeenCalledTimes(1)
    expect(svc.sendOwnerWhatsApp).toHaveBeenCalledTimes(1)
  })

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/v1/site-visit')
      .send({ ...VALID_BODY, name: '' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/name is required/i)
  })

  it('returns 400 when phone is missing', async () => {
    const res = await request(app).post('/api/v1/site-visit')
      .send({ ...VALID_BODY, phone: '' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/phone is required/i)
  })

  it('returns 400 when date is missing', async () => {
    const res = await request(app).post('/api/v1/site-visit')
      .send({ ...VALID_BODY, date: '' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/date is required/i)
  })

  it('still returns 200 when one notification channel fails (Promise.allSettled)', async () => {
    svc.sendCustomerEmail.mockRejectedValueOnce(new Error('SMTP down'))
    const res = await request(app).post('/api/v1/site-visit').send(VALID_BODY)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.notifications.customerEmail.status).toBe('rejected')
  })

  it('trims whitespace from name and phone fields', async () => {
    await request(app).post('/api/v1/site-visit').send({
      ...VALID_BODY, name: '  Ravi  ', phone: '  9876543210  ',
    })
    expect(svc.sendOwnerEmail).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ravi', phone: '9876543210' })
    )
  })
})
