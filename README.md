# Common Service — Node.js

Media upload and serving for Customer Lead platform.


## Tech Stack
- Node.js 18+ · Express · Mongoose · Multer

## Port
`8081`

## Setup
```bash
npm install
cp .env.example .env   # fill in your MongoDB URI
npm run dev            # development with nodemon
npm start              # production
```

## API Endpoints
```
POST /api/v1/media/upload           Upload single image/video
POST /api/v1/media/upload/bulk      Upload multiple files
GET  /api/v1/media/files/:filename  Serve file
GET  /api/v1/media                  List all active assets
GET  /api/v1/media/category/:cat    Filter by category
PATCH /api/v1/media/:id             Update metadata
DELETE /api/v1/media/:id            Soft delete
GET  /health                        Health check
```
## Deploy on Vercel
1. Push to GitHub
2. Import on vercel.com
3. Add environment variables:
   - `MONGODB_URI`
   - `CORS_ORIGINS`
   - `BASE_URL` (your Vercel URL)
