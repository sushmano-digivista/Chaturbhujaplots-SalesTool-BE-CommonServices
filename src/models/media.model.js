const mongoose = require('mongoose')

const mediaAssetSchema = new mongoose.Schema({
  originalFilename: { type: String, required: true },
  storedFilename:   { type: String, required: true },
  fileUrl:          { type: String, required: true },
  fileType:         { type: String, enum: ['IMAGE','VIDEO'], required: true },
  mimeType:         { type: String, required: true },
  fileSizeBytes:    { type: Number },
  category:         { type: String, enum: ['GALLERY','HERO_BACKGROUND','AMENITY','VIDEO_TOUR','DOCUMENT','OTHER'], default: 'GALLERY' },
  altText:          { type: String, default: '' },
  tags:             { type: String, default: '' },
  active:           { type: Boolean, default: true },
}, { timestamps: { createdAt: 'uploadedAt', updatedAt: 'updatedAt' } })

module.exports = mongoose.model('MediaAsset', mediaAssetSchema, 'media_assets')
