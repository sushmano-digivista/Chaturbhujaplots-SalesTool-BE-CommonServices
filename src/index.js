require('dotenv').config()
const express   = require('express')
const cors      = require('cors')
const mongoose  = require('mongoose')
const mediaRoutes = require('./routes/media.routes')

const app  = express()
const PORT = process.env.PORT || 8081

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

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/actuator/health', (_, res) => res.json({ status: 'UP' }))
app.get('/health',          (_, res) => res.json({ status: 'UP', service: 'common-service' }))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/v1/media', mediaRoutes)

// ── Handlers ──────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: `Not found: ${req.method} ${req.path}` }))
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: err.message || 'Internal server error' })
})

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✓ MongoDB connected')
    app.listen(PORT, () => console.log(`✓ common-service running on port ${PORT}`))
  } catch (err) {
    console.error('✗ Failed to start:', err)
    process.exit(1)
  }
}

start()
