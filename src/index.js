require('dotenv').config()
const DEPLOY_VERSION = 'v5-questionnaire-bot-2026-03-26'  // identifies this deployment
const express   = require('express')
const cors      = require('cors')
const mongoose  = require('mongoose')
const mediaRoutes     = require('./routes/media.routes')
const brochureRoutes  = require('./routes/brochure.routes')
const siteVisitRoutes = require('./routes/siteVisit.routes')
const webhookRoutes   = require('./routes/webhook.routes')

const app  = express()
const PORT = process.env.PORT || 8081

// ── MongoDB connection (Vercel-safe) ──────────────────────────────────────────
// On Vercel serverless, mongoose.connect() in start() runs async and may not
// finish before the first request arrives. We cache the connection promise so
// every request waits for it before proceeding.
let mongoConnectPromise = null

function ensureMongoConnected() {
  if (mongoose.connection.readyState === 1) return Promise.resolve()  // already connected
  if (!mongoConnectPromise) {
    mongoConnectPromise = mongoose.connect(process.env.MONGODB_URI)
      .then(() => { console.log('✓ MongoDB connected') })
      .catch(err => {
        console.error('✗ MongoDB connection failed:', err.message)
        mongoConnectPromise = null  // allow retry on next request
        throw err
      })
  }
  return mongoConnectPromise
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim())
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) cb(null, true)
    else cb(new Error(`CORS: ${origin} not allowed`))
  },
  credentials: false,
}))
app.use(express.json())

// ── Ensure MongoDB is connected before any route handler runs ─────────────────
app.use(async (req, res, next) => {
  try {
    await ensureMongoConnected()
    next()
  } catch (err) {
    console.error('[db] Failed to connect to MongoDB:', err.message)
    res.status(503).json({ message: 'Database unavailable. Please try again.' })
  }
})

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/actuator/health', (_, res) => res.json({ status: 'UP' }))
app.get('/health',          (_, res) => res.json({ status: 'UP', service: 'common-service', version: DEPLOY_VERSION }))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/v1/media',      mediaRoutes)
app.use('/api/v1/brochure',   brochureRoutes)
app.use('/api/v1/site-visit', siteVisitRoutes)
app.use('/api/v1/webhook',    webhookRoutes)   // WhatsApp questionnaire bot

// ── Handlers ──────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: `Not found: ${req.method} ${req.path}` }))
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: err.message || 'Internal server error' })
})

// ── Start (local dev only — Vercel uses the exported app directly) ────────────
if (process.env.NODE_ENV !== 'production') {
  ensureMongoConnected()
    .then(() => app.listen(PORT, () => console.log(`✓ common-service running on port ${PORT}`)))
    .catch(err => { console.error('✗ Failed to start:', err); process.exit(1) })
}

module.exports = app
