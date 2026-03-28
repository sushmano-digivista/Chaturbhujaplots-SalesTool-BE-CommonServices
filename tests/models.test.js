'use strict'
/**
 * tests/models.test.js
 * Tests for Mongoose model definitions to ensure schema configuration is correct.
 */

// We test the schema definitions by requiring the model files with a mocked mongoose.
// This covers the schema creation and model export lines.

describe('MediaAsset model', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('defines the MediaAsset model with correct collection name', () => {
    jest.mock('mongoose', () => {
      const actualMongoose = jest.requireActual('mongoose')
      return {
        ...actualMongoose,
        Schema: actualMongoose.Schema,
        model: jest.fn().mockReturnValue({ modelName: 'MediaAsset' }),
      }
    })
    const mongoose = require('mongoose')
    const model = require('../src/models/media.model')
    expect(mongoose.model).toHaveBeenCalledWith('MediaAsset', expect.any(Object), 'media_assets')
  })

  it('schema has required fields', () => {
    jest.mock('mongoose', () => {
      const actualMongoose = jest.requireActual('mongoose')
      let capturedSchema = null
      return {
        ...actualMongoose,
        Schema: class extends actualMongoose.Schema {
          constructor(def, opts) {
            super(def, opts)
            capturedSchema = def
          }
        },
        model: jest.fn().mockReturnValue({}),
        _getCapturedSchema: () => capturedSchema,
      }
    })
    require('../src/models/media.model')
    const mongoose = require('mongoose')
    const schema = mongoose._getCapturedSchema()
    expect(schema.originalFilename.required).toBe(true)
    expect(schema.storedFilename.required).toBe(true)
    expect(schema.fileUrl.required).toBe(true)
    expect(schema.fileType.required).toBe(true)
    expect(schema.mimeType.required).toBe(true)
  })
})

describe('WhatsappSession model', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('defines the WhatsappSession model with correct collection name', () => {
    jest.mock('mongoose', () => {
      const actualMongoose = jest.requireActual('mongoose')
      const OriginalSchema = actualMongoose.Schema
      return {
        ...actualMongoose,
        Schema: class extends OriginalSchema {
          constructor(def, opts) {
            super(def, opts)
          }
          // Mock index to avoid errors
          index(...args) { return this }
        },
        model: jest.fn().mockReturnValue({ modelName: 'WhatsappSession' }),
      }
    })
    const mongoose = require('mongoose')
    const model = require('../src/models/whatsapp-session.model')
    expect(mongoose.model).toHaveBeenCalledWith('WhatsappSession', expect.any(Object), 'whatsapp_sessions')
  })

  it('schema has required phone field', () => {
    jest.mock('mongoose', () => {
      const actualMongoose = jest.requireActual('mongoose')
      const OriginalSchema = actualMongoose.Schema
      let capturedSchema = null
      return {
        ...actualMongoose,
        Schema: class extends OriginalSchema {
          constructor(def, opts) {
            super(def, opts)
            capturedSchema = def
          }
          index(...args) { return this }
        },
        model: jest.fn().mockReturnValue({}),
        _getCapturedSchema: () => capturedSchema,
      }
    })
    require('../src/models/whatsapp-session.model')
    const mongoose = require('mongoose')
    const schema = mongoose._getCapturedSchema()
    expect(schema.phone.required).toBe(true)
    expect(schema.phone.unique).toBe(true)
  })
})
