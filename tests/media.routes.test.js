'use strict'
/**
 * tests/media.routes.test.js
 * Integration tests for /api/v1/media routes
 */

const request = require('supertest')
const express = require('express')
const path    = require('path')
const fs      = require('fs')
const os      = require('os')

// ── Mock MediaAsset model ────────────────────────────────────────────────────
const mockAsset = {
  _id: '507f1f77bcf86cd799439011',
  originalFilename: 'photo.jpg',
  storedFilename: 'abc-123.jpg',
  fileUrl: 'http://localhost:8081/api/v1/media/files/abc-123.jpg',
  fileType: 'IMAGE',
  mimeType: 'image/jpeg',
  fileSizeBytes: 1024,
  category: 'GALLERY',
  altText: 'photo.jpg',
  tags: '',
  active: true,
}

jest.mock('../src/models/media.model', () => {
  const mock = {
    create: jest.fn().mockResolvedValue(mockAsset),
    insertMany: jest.fn().mockResolvedValue([mockAsset]),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockAsset]),
      }),
      lean: jest.fn().mockResolvedValue([mockAsset]),
    }),
    findById: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockAsset),
    }),
    findByIdAndUpdate: jest.fn().mockResolvedValue({ ...mockAsset, altText: 'updated' }),
  }
  return mock
})

const MediaAsset = require('../src/models/media.model')

// Set a temp upload dir for tests
const testUploadDir = path.join(os.tmpdir(), 'media-test-uploads')
process.env.UPLOAD_DIR = testUploadDir

const mediaRoutes = require('../src/routes/media.routes')

const app = express()
app.use(express.json())
app.use('/api/v1/media', mediaRoutes)

// Create a small test file
function createTestFile() {
  if (!fs.existsSync(testUploadDir)) fs.mkdirSync(testUploadDir, { recursive: true })
  const filePath = path.join(testUploadDir, 'test-file.jpg')
  fs.writeFileSync(filePath, Buffer.from('fake-jpeg-content'))
  return filePath
}

afterAll(() => {
  // Clean up
  try { fs.rmSync(testUploadDir, { recursive: true, force: true }) } catch {}
})

describe('POST /api/v1/media/upload', () => {
  it('uploads a single file successfully', async () => {
    const res = await request(app)
      .post('/api/v1/media/upload')
      .attach('file', Buffer.from('fake-image'), { filename: 'test.jpg', contentType: 'image/jpeg' })
      .field('category', 'GALLERY')
    expect(res.status).toBe(201)
  })

  it('returns 400 when no file is provided', async () => {
    const res = await request(app)
      .post('/api/v1/media/upload')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/No file uploaded/)
  })

  it('returns 500 when MediaAsset.create throws', async () => {
    MediaAsset.create.mockRejectedValueOnce(new Error('DB error'))
    const res = await request(app)
      .post('/api/v1/media/upload')
      .attach('file', Buffer.from('fake-image'), { filename: 'test.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe('DB error')
  })

  it('sets fileType to VIDEO for video uploads', async () => {
    const res = await request(app)
      .post('/api/v1/media/upload')
      .attach('file', Buffer.from('fake-video'), { filename: 'test.mp4', contentType: 'video/mp4' })
    expect(res.status).toBe(201)
    expect(MediaAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: 'VIDEO' })
    )
  })

  it('uses default category GALLERY when not specified', async () => {
    const res = await request(app)
      .post('/api/v1/media/upload')
      .attach('file', Buffer.from('fake-image'), { filename: 'test.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(201)
    expect(MediaAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'GALLERY' })
    )
  })
})

describe('POST /api/v1/media/upload/bulk', () => {
  it('uploads multiple files', async () => {
    const res = await request(app)
      .post('/api/v1/media/upload/bulk')
      .attach('files', Buffer.from('img1'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('files', Buffer.from('img2'), { filename: 'b.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(201)
    expect(MediaAsset.insertMany).toHaveBeenCalled()
  })

  it('returns 400 when no files provided', async () => {
    const res = await request(app)
      .post('/api/v1/media/upload/bulk')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/No files uploaded/)
  })

  it('returns 500 when insertMany throws', async () => {
    MediaAsset.insertMany.mockRejectedValueOnce(new Error('Bulk error'))
    const res = await request(app)
      .post('/api/v1/media/upload/bulk')
      .attach('files', Buffer.from('img1'), { filename: 'a.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe('Bulk error')
  })
})

describe('GET /api/v1/media/files/:filename', () => {
  it('serves an existing file', async () => {
    createTestFile()
    const res = await request(app).get('/api/v1/media/files/test-file.jpg')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toMatch(/public/)
  })

  it('returns 404 for non-existent file', async () => {
    const res = await request(app).get('/api/v1/media/files/nonexistent.jpg')
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/File not found/)
  })

  it('strips path traversal attempts', async () => {
    const res = await request(app).get('/api/v1/media/files/..%2F..%2Fetc%2Fpasswd')
    // Should be 404 (file not found in upload dir) not a security bypass
    expect([400, 404]).toContain(res.status)
  })
})

describe('GET /api/v1/media', () => {
  it('lists all active media assets', async () => {
    const res = await request(app).get('/api/v1/media')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 500 when find throws', async () => {
    MediaAsset.find.mockReturnValueOnce({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('DB error')),
      }),
    })
    const res = await request(app).get('/api/v1/media')
    expect(res.status).toBe(500)
  })
})

describe('GET /api/v1/media/category/:category', () => {
  it('returns assets for a given category', async () => {
    const res = await request(app).get('/api/v1/media/category/GALLERY')
    expect(res.status).toBe(200)
  })

  it('returns 500 when find throws', async () => {
    MediaAsset.find.mockReturnValueOnce({
      lean: jest.fn().mockRejectedValue(new Error('DB error')),
    })
    const res = await request(app).get('/api/v1/media/category/GALLERY')
    expect(res.status).toBe(500)
  })
})

describe('GET /api/v1/media/:id', () => {
  it('returns a single asset by id', async () => {
    const res = await request(app).get('/api/v1/media/507f1f77bcf86cd799439011')
    expect(res.status).toBe(200)
  })

  it('returns 404 when asset not found', async () => {
    MediaAsset.findById.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue(null),
    })
    const res = await request(app).get('/api/v1/media/507f1f77bcf86cd799439012')
    expect(res.status).toBe(404)
  })

  it('returns 500 when findById throws', async () => {
    MediaAsset.findById.mockReturnValueOnce({
      lean: jest.fn().mockRejectedValue(new Error('DB error')),
    })
    const res = await request(app).get('/api/v1/media/badid')
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/v1/media/:id', () => {
  it('updates metadata fields', async () => {
    const res = await request(app)
      .patch('/api/v1/media/507f1f77bcf86cd799439011')
      .send({ altText: 'New alt', tags: 'tag1', category: 'hero_background' })
    expect(res.status).toBe(200)
  })

  it('returns 404 when asset not found', async () => {
    MediaAsset.findByIdAndUpdate.mockResolvedValueOnce(null)
    const res = await request(app)
      .patch('/api/v1/media/507f1f77bcf86cd799439012')
      .send({ altText: 'test' })
    expect(res.status).toBe(404)
  })

  it('returns 500 when update throws', async () => {
    MediaAsset.findByIdAndUpdate.mockRejectedValueOnce(new Error('DB error'))
    const res = await request(app)
      .patch('/api/v1/media/badid')
      .send({ altText: 'test' })
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/v1/media/:id', () => {
  it('soft deletes an asset', async () => {
    MediaAsset.findByIdAndUpdate.mockResolvedValueOnce({ ...mockAsset, active: false })
    const res = await request(app).delete('/api/v1/media/507f1f77bcf86cd799439011')
    expect(res.status).toBe(204)
  })

  it('returns 500 when delete throws', async () => {
    MediaAsset.findByIdAndUpdate.mockRejectedValueOnce(new Error('DB error'))
    const res = await request(app).delete('/api/v1/media/badid')
    expect(res.status).toBe(500)
  })
})

// Restore mock asset for the mock factory reference
const mockAssetRef = mockAsset
