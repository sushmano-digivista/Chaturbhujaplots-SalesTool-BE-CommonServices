const router    = require('express').Router()
const multer    = require('multer')
const path      = require('path')
const fs        = require('fs')
const { v4: uuid } = require('uuid')
const MediaAsset  = require('../models/media.model')

// ── Storage ───────────────────────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads'

// Safely create upload directory — works on Vercel (/tmp is writable)
try {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
} catch (err) {
  console.warn('Could not create upload dir:', err.message)
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename:    (_, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase()
    cb(null, uuid() + ext)
  },
})

const fileFilter = (_, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true)
  else cb(new Error('Only image and video files allowed'), false)
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
})

function buildUrl(filename) {
  const base = process.env.BASE_URL || 'http://localhost:8081'
  return `${base}/api/v1/media/files/${filename}`
}

// ── UPLOAD single ─────────────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' })

    const asset = await MediaAsset.create({
      originalFilename: req.file.originalname,
      storedFilename:   req.file.filename,
      fileUrl:          buildUrl(req.file.filename),
      fileType:         req.file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      mimeType:         req.file.mimetype,
      fileSizeBytes:    req.file.size,
      category:         (req.body.category || 'GALLERY').toUpperCase(),
      altText:          req.body.altText || req.file.originalname,
      tags:             req.body.tags    || '',
      active:           true,
    })
    res.status(201).json(asset)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── UPLOAD bulk ───────────────────────────────────────────────────────────────
router.post('/upload/bulk', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded' })
    const category = (req.body.category || 'GALLERY').toUpperCase()
    const assets = await MediaAsset.insertMany(req.files.map(f => ({
      originalFilename: f.originalname,
      storedFilename:   f.filename,
      fileUrl:          buildUrl(f.filename),
      fileType:         f.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      mimeType:         f.mimetype,
      fileSizeBytes:    f.size,
      category, altText: f.originalname, tags: '', active: true,
    })))
    res.status(201).json(assets)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── SERVE file ────────────────────────────────────────────────────────────────
// CWE-22 Path Traversal fix: resolve the full path then verify it stays inside
// uploadDir before serving. This prevents  ../../etc/passwd -style requests.
router.get('/files/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename)  // strip any directory components
  const filePath = path.resolve(path.join(uploadDir, safeName))
  const baseDir  = path.resolve(uploadDir)

  // Ensure resolved path is still inside the upload directory
  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
    return res.status(400).json({ message: 'Invalid filename' })
  }

  if (!fs.existsSync(filePath))
    return res.status(404).json({ message: 'File not found' })

  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.sendFile(filePath)
})

// ── LIST ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    res.json(await MediaAsset.find({ active: true }).sort({ uploadedAt: -1 }).lean())
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/category/:category', async (req, res) => {
  try {
    const cat = req.params.category.toUpperCase()
    res.json(await MediaAsset.find({ category: cat, active: true }).lean())
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const asset = await MediaAsset.findById(req.params.id).lean()
    if (!asset) return res.status(404).json({ message: 'Asset not found' })
    res.json(asset)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── UPDATE metadata ───────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const update = {}
    if (req.body.altText)  update.altText  = req.body.altText
    if (req.body.tags)     update.tags     = req.body.tags
    if (req.body.category) update.category = req.body.category.toUpperCase()
    const asset = await MediaAsset.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
    if (!asset) return res.status(404).json({ message: 'Asset not found' })
    res.json(asset)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── SOFT DELETE ───────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await MediaAsset.findByIdAndUpdate(req.params.id, { active: false })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router