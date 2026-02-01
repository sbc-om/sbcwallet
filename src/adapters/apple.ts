import { PKPass } from 'passkit-generator'
import type { PassData, ApplePassConfig, ApplePassTemplate, ProfileConfig } from '../types.js'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { deflateSync } from 'zlib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class AppleWalletAdapter {
  private config: ApplePassConfig & { signerKeyPath?: string }

  constructor(config?: Partial<ApplePassConfig> & { signerKeyPath?: string }) {
    this.config = {
      teamId: config?.teamId || process.env.APPLE_TEAM_ID || '',
      passTypeId: config?.passTypeId || process.env.APPLE_PASS_TYPE_ID || '',
      certPath: config?.certPath || process.env.APPLE_CERT_PATH || process.env.APPLE_SIGNER_CERT_PATH || '',
      certPassword: config?.certPassword || process.env.APPLE_CERT_PASSWORD || '',
      wwdrPath: config?.wwdrPath || process.env.APPLE_WWDR_PATH || '',
      signerKeyPath: config?.signerKeyPath || process.env.APPLE_SIGNER_KEY_PATH || ''
    }
  }

  async generatePkpass(
    passData: PassData,
    profile: ProfileConfig,
    passType: 'parent' | 'child'
  ): Promise<Buffer> {
    try {
      // Load template
      const templatePath = join(__dirname, '..', 'templates', 'apple', `${passType}.json`)
      const templateContent = await readFile(templatePath, 'utf-8')
      const baseTemplate: ApplePassTemplate = JSON.parse(templateContent)

      // Get profile-specific template
      const profileTemplate = profile.defaultTemplates.apple[passType]

      // Merge templates
      const template = this.mergeTemplates(baseTemplate, profileTemplate)

      // Apply pass data to template
      const populatedTemplate = this.populateTemplate(template, passData, profile, passType)

      // Optional per-pass overrides via metadata (useful for per-business theming)
      const appleWallet = (passData as any)?.metadata?.appleWallet || {}

      // Build pass props from populated template
      const passProps: any = {
        serialNumber: passData.id,
        description: appleWallet.description || populatedTemplate.description || 'sbcwallet Pass',
        organizationName: appleWallet.organizationName || populatedTemplate.organizationName || 'sbcwallet',
        passTypeIdentifier: this.config.passTypeId,
        teamIdentifier: this.config.teamId
      }

      // Add colors
      if (appleWallet.backgroundColor || populatedTemplate.backgroundColor) {
        passProps.backgroundColor = appleWallet.backgroundColor || populatedTemplate.backgroundColor
      }
      if (appleWallet.foregroundColor || populatedTemplate.foregroundColor) {
        passProps.foregroundColor = appleWallet.foregroundColor || populatedTemplate.foregroundColor
      }
      if (appleWallet.labelColor || populatedTemplate.labelColor) {
        passProps.labelColor = appleWallet.labelColor || populatedTemplate.labelColor
      }
      if (appleWallet.logoText || populatedTemplate.logoText) {
        passProps.logoText = appleWallet.logoText || populatedTemplate.logoText
      }

      // Add barcodes - prefer from metadata over template
      if (appleWallet.barcodes && appleWallet.barcodes.length > 0) {
        passProps.barcodes = appleWallet.barcodes
      } else if (populatedTemplate.barcodes && populatedTemplate.barcodes.length > 0) {
        passProps.barcodes = populatedTemplate.barcodes
      }
      // Legacy barcode field for older iOS
      if (appleWallet.barcode) {
        passProps.barcode = appleWallet.barcode
      }

      // Add generic fields (Apple Wallet "generic" pass type)
      if (populatedTemplate.generic) {
        passProps.generic = populatedTemplate.generic
      }

      // For loyalty cards, use storeCard type
      if (passData.profile === 'loyalty') {
        // Convert generic fields to storeCard fields
        passProps.storeCard = passProps.generic || populatedTemplate.generic || {
          primaryFields: [],
          secondaryFields: [],
          auxiliaryFields: [],
          backFields: []
        }
        delete passProps.generic

        // Add auxiliary fields from metadata if provided
        if (appleWallet.auxiliaryFields && Array.isArray(appleWallet.auxiliaryFields)) {
          passProps.storeCard.auxiliaryFields = appleWallet.auxiliaryFields
        }

        // Add back fields (detail section) from metadata if provided
        if (appleWallet.backFields && Array.isArray(appleWallet.backFields)) {
          passProps.storeCard.backFields = appleWallet.backFields
        }

        // Add secondary fields from metadata if provided
        if (appleWallet.secondaryFields && Array.isArray(appleWallet.secondaryFields)) {
          passProps.storeCard.secondaryFields = appleWallet.secondaryFields
        }

        // Add header fields from metadata if provided
        if (appleWallet.headerFields && Array.isArray(appleWallet.headerFields)) {
          passProps.storeCard.headerFields = appleWallet.headerFields
        }
      }

      // Advanced passthrough: allow issuers to supply any PassKit fields.
      // Example: webServiceURL, authenticationToken, appLaunchURL, userInfo, beacons, nfc, etc.
      if (appleWallet.passOverrides && typeof appleWallet.passOverrides === 'object') {
        Object.assign(passProps, appleWallet.passOverrides)
      }

      // Add formatVersion (required by Apple)
      passProps.formatVersion = 1

      // Create pass.json buffer
      const passJsonBuffer = Buffer.from(JSON.stringify(passProps), 'utf-8')

      // Determine signer key path (use separate key file if provided, otherwise use cert path)
      const signerKeyPath = this.config.signerKeyPath || this.config.certPath

      // Read certificate files as buffers
      const wwdrBuffer = await readFile(this.config.wwdrPath)
      const signerCertBuffer = await readFile(this.config.certPath)
      const signerKeyBuffer = await readFile(signerKeyPath)

      // Try to load icon files from certs directory, or create valid PNG programmatically
      const certsDir = dirname(this.config.certPath)
      let iconPng: Buffer
      let icon2xPng: Buffer
      let logoPng: Buffer
      let logo2xPng: Buffer
      let stripPng: Buffer | null = null
      let strip2xPng: Buffer | null = null
      let thumbnailPng: Buffer | null = null
      let thumbnail2xPng: Buffer | null = null

      // Try to download images from URLs if provided in metadata
      const iconUrl = appleWallet.iconUrl
      const logoUrl = appleWallet.logoUrl
      const stripUrl = appleWallet.stripUrl
      const thumbnailUrl = appleWallet.thumbnailUrl

      // Helper function to fetch image from URL
      const fetchImage = async (url: string): Promise<Buffer | null> => {
        if (!url) return null
        try {
          const response = await fetch(url)
          if (!response.ok) return null
          const arrayBuffer = await response.arrayBuffer()
          return Buffer.from(arrayBuffer)
        } catch {
          return null
        }
      }

      // Load or create icon
      if (iconUrl) {
        const downloaded = await fetchImage(iconUrl)
        if (downloaded) {
          iconPng = downloaded
          icon2xPng = downloaded
        } else {
          iconPng = this.createValidPng(29, 29, [31, 41, 55])
          icon2xPng = this.createValidPng(58, 58, [31, 41, 55])
        }
      } else {
        try {
          iconPng = await readFile(join(certsDir, 'icon.png'))
          icon2xPng = await readFile(join(certsDir, 'icon@2x.png'))
        } catch {
          iconPng = this.createValidPng(29, 29, [31, 41, 55])
          icon2xPng = this.createValidPng(58, 58, [31, 41, 55])
        }
      }

      // Load or create logo
      if (logoUrl) {
        const downloaded = await fetchImage(logoUrl)
        if (downloaded) {
          logoPng = downloaded
          logo2xPng = downloaded
        } else {
          logoPng = this.createValidPng(160, 50, [31, 41, 55])
          logo2xPng = this.createValidPng(320, 100, [31, 41, 55])
        }
      } else {
        try {
          logoPng = await readFile(join(certsDir, 'logo.png'))
          logo2xPng = await readFile(join(certsDir, 'logo@2x.png'))
        } catch {
          logoPng = this.createValidPng(160, 50, [31, 41, 55])
          logo2xPng = this.createValidPng(320, 100, [31, 41, 55])
        }
      }

      // Load strip image if URL provided
      if (stripUrl) {
        const downloaded = await fetchImage(stripUrl)
        if (downloaded) {
          stripPng = downloaded
          strip2xPng = downloaded
        }
      } else {
        try {
          stripPng = await readFile(join(certsDir, 'strip.png'))
          strip2xPng = await readFile(join(certsDir, 'strip@2x.png'))
        } catch {
          // No strip image - optional
        }
      }

      // Load thumbnail if URL provided
      if (thumbnailUrl) {
        const downloaded = await fetchImage(thumbnailUrl)
        if (downloaded) {
          thumbnailPng = downloaded
          thumbnail2xPng = downloaded
        }
      } else {
        try {
          thumbnailPng = await readFile(join(certsDir, 'thumbnail.png'))
          thumbnail2xPng = await readFile(join(certsDir, 'thumbnail@2x.png'))
        } catch {
          // No thumbnail - optional
        }
      }

      // Build pass buffers with icon and logo
      const passBuffers: Record<string, Buffer> = {
        'pass.json': passJsonBuffer,
        'icon.png': iconPng,
        'icon@2x.png': icon2xPng,
        'logo.png': logoPng,
        'logo@2x.png': logo2xPng
      }

      // Add optional images
      if (stripPng) {
        passBuffers['strip.png'] = stripPng
        if (strip2xPng) passBuffers['strip@2x.png'] = strip2xPng
      }
      if (thumbnailPng) {
        passBuffers['thumbnail.png'] = thumbnailPng
        if (thumbnail2xPng) passBuffers['thumbnail@2x.png'] = thumbnail2xPng
      }

      // Create pass with pass.json and icon in buffers
      const pass = new PKPass(
        passBuffers,
        {
          wwdr: wwdrBuffer,
          signerCert: signerCertBuffer,
          signerKey: signerKeyBuffer,
          signerKeyPassphrase: this.config.certPassword
        }
      )

      // Generate buffer
      const buffer = await pass.getAsBuffer()
      return buffer
    } catch (error) {
      throw new Error(`Failed to generate Apple Wallet pass: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Create a valid PNG image programmatically
   * Uses zlib for compression (proper PNG format)
   */
  private createValidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
    
    // PNG signature
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    
    // Helper to create PNG chunk
    const createChunk = (type: string, data: Buffer): Buffer => {
      const typeBuffer = Buffer.from(type, 'ascii')
      const length = Buffer.alloc(4)
      length.writeUInt32BE(data.length, 0)
      
      const crcData = Buffer.concat([typeBuffer, data])
      const crc = Buffer.alloc(4)
      crc.writeUInt32BE(this.crc32(crcData), 0)
      
      return Buffer.concat([length, typeBuffer, data, crc])
    }
    
    // IHDR chunk
    const ihdrData = Buffer.alloc(13)
    ihdrData.writeUInt32BE(width, 0)
    ihdrData.writeUInt32BE(height, 4)
    ihdrData.writeUInt8(8, 8)   // bit depth
    ihdrData.writeUInt8(2, 9)   // color type (RGB)
    ihdrData.writeUInt8(0, 10)  // compression
    ihdrData.writeUInt8(0, 11)  // filter
    ihdrData.writeUInt8(0, 12)  // interlace
    const ihdr = createChunk('IHDR', ihdrData)
    
    // Raw image data (filter byte + RGB pixels per row)
    const rowSize = 1 + width * 3
    const rawData = Buffer.alloc(height * rowSize)
    for (let y = 0; y < height; y++) {
      const rowOffset = y * rowSize
      rawData[rowOffset] = 0 // filter: none
      for (let x = 0; x < width; x++) {
        const pixelOffset = rowOffset + 1 + x * 3
        rawData[pixelOffset] = rgb[0]
        rawData[pixelOffset + 1] = rgb[1]
        rawData[pixelOffset + 2] = rgb[2]
      }
    }
    
    // Compress and create IDAT chunk
    const compressed = deflateSync(rawData, { level: 9 })
    const idat = createChunk('IDAT', compressed)
    
    // IEND chunk
    const iend = createChunk('IEND', Buffer.alloc(0))
    
    return Buffer.concat([signature, ihdr, idat, iend])
  }

  /**
   * CRC32 calculation for PNG chunks
   */
  private crc32(data: Buffer): number {
    let crc = 0xFFFFFFFF
    const table = this.getCrc32Table()
    
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF]
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0
  }

  private crc32Table: number[] | null = null
  
  private getCrc32Table(): number[] {
    if (this.crc32Table) return this.crc32Table
    
    this.crc32Table = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      }
      this.crc32Table[n] = c
    }
    return this.crc32Table
  }

  private mergeTemplates(base: ApplePassTemplate, profile: Partial<ApplePassTemplate>): ApplePassTemplate {
    return {
      ...base,
      ...profile,
      generic: {
        ...base.generic,
        ...profile.generic,
        primaryFields: profile.generic?.primaryFields || base.generic?.primaryFields,
        secondaryFields: profile.generic?.secondaryFields || base.generic?.secondaryFields,
        auxiliaryFields: profile.generic?.auxiliaryFields || base.generic?.auxiliaryFields,
        backFields: profile.generic?.backFields || base.generic?.backFields,
        headerFields: profile.generic?.headerFields || base.generic?.headerFields
      }
    }
  }

  private populateTemplate(
    template: ApplePassTemplate,
    passData: PassData,
    profile: ProfileConfig,
    passType: 'parent' | 'child'
  ): ApplePassTemplate {
    const populated = { ...template }

    if (populated.generic) {
      // Populate primary fields
      if (populated.generic.primaryFields) {
        populated.generic.primaryFields = populated.generic.primaryFields.map(field => {
          const value = this.getFieldValue(field.key, passData)
          return { ...field, value: value || field.value }
        })
      }

      // Populate secondary fields
      if (populated.generic.secondaryFields) {
        populated.generic.secondaryFields = populated.generic.secondaryFields.map(field => {
          const value = this.getFieldValue(field.key, passData)
          return { ...field, value: value || field.value }
        })
      }

      // Populate auxiliary fields
      if (populated.generic.auxiliaryFields) {
        populated.generic.auxiliaryFields = populated.generic.auxiliaryFields.map(field => {
          const value = this.getFieldValue(field.key, passData)
          return { ...field, value: value || field.value }
        })
      }

      // Populate back fields
      if (populated.generic.backFields) {
        populated.generic.backFields = populated.generic.backFields.map(field => {
          const value = this.getFieldValue(field.key, passData)
          return { ...field, value: value || field.value }
        })
      }
    }

    // Set barcode message
    if (populated.barcodes && populated.barcodes.length > 0) {
      const barcodeValue = (passData as any).memberId || passData.id
      populated.barcodes[0].message = barcodeValue
    }

    return populated
  }

  private getFieldValue(key: string, passData: PassData): string | number {
    // Handle nested keys like 'window.from'
    const keys = key.split('.')
    let value: any = passData

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        return ''
      }
    }

    // Map field names for common fields
    if (key === 'scheduleId' || key === 'orderId' || key === 'batchId' || key === 'visitId') {
      return passData.id
    }

    if (key === 'windowFrom' && passData.type === 'parent' && passData.window) {
      return new Date(passData.window.from).toLocaleString()
    }

    if (key === 'windowTo' && passData.type === 'parent' && passData.window) {
      return new Date(passData.window.to).toLocaleString()
    }

    return value !== undefined && value !== null ? String(value) : ''
  }
}

export default AppleWalletAdapter
