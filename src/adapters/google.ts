import type { PassData, GooglePassConfig, GooglePassObject, ProfileConfig } from '../types.js'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { GoogleAuth } from 'google-auth-library'
import { generateLogisticsHeroImage, generateHealthcareHeroImage } from '../utils/progress-image.js'
import type { LogisticsStatus, HealthcareStatus } from '../utils/progress-image.js'
import { logDebug, logWarn, logError } from '../utils/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class GoogleWalletAdapter {
  private config: GooglePassConfig
  private auth: GoogleAuth | null = null

  constructor(config?: Partial<GooglePassConfig>) {
    this.config = {
      issuerId: config?.issuerId || process.env.GOOGLE_ISSUER_ID || 'test-issuer',
      serviceAccountPath: config?.serviceAccountPath || process.env.GOOGLE_SA_JSON
    }

    // Initialize Google Auth if credentials are available
    if (this.config.serviceAccountPath) {
      this.auth = new GoogleAuth({
        keyFile: this.config.serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
      })
    }
  }

  async generatePassObject(
    passData: PassData,
    profile: ProfileConfig,
    passType: 'parent' | 'child'
  ): Promise<{ object: GooglePassObject; saveUrl: string }> {
    try {
      const isLoyalty = profile.name === 'loyalty'

      // Loyalty uses a different Google Wallet schema (loyaltyClass/loyaltyObject)
      if (isLoyalty && passType === 'parent' && passData.type === 'parent') {
        const classPayload = await this.generateLoyaltyClass(passData, profile)

        if (this.auth) {
          try {
            await this.upsertInAPI('loyaltyClass', classPayload)
          } catch (error) {
            logWarn('Google Wallet API loyaltyClass create/update failed')
            logWarn(error)
          }
        } else {
          logWarn('No Google Auth - class not created in API (will not work on device)')
        }

        logDebug('Google Wallet Class:', JSON.stringify(classPayload, null, 2))

        // Save URL is not applicable for classes.
        return { object: classPayload as any, saveUrl: '' }
      }

      // Load template
      const templateFilename = isLoyalty
        ? 'loyalty_object.json'
        : `${passType}_object.json`
      const templatePath = join(__dirname, '..', 'templates', 'google', templateFilename)
      const templateContent = await readFile(templatePath, 'utf-8')
      const baseTemplate: GooglePassObject = JSON.parse(templateContent)

      // Get profile-specific template
      const profileTemplate = passType === 'parent'
        ? profile.defaultTemplates.google.parentObject
        : profile.defaultTemplates.google.childObject

      // Merge templates
      const template = { ...baseTemplate, ...profileTemplate }

      // Populate template with pass data
      const populatedObject = this.populateObject(template, passData, profile, passType)

      // Generate class ID and object ID
      const classId = isLoyalty && passData.type === 'child'
        ? `${this.config.issuerId}.${(passData as any).parentId}`
        : `${this.config.issuerId}.${profile.name}_${passType}`
      const objectId = `${this.config.issuerId}.${passData.id}`

      populatedObject.classId = classId
      populatedObject.id = objectId

      // Set barcode
      if (populatedObject.barcode) {
        const barcodeValue = (passData as any).memberId || passData.id
        populatedObject.barcode.value = barcodeValue
      }

      if (isLoyalty) {
        ;(populatedObject as any).accountId = (passData as any).memberId || passData.id
        ;(populatedObject as any).accountName = (passData as any).customerName || ''
        this.applyLoyaltyExtras(populatedObject, passData)
      }

      // Generate and add hero image with progress bar
      await this.addHeroImage(populatedObject, passData, profile)

      // Create the object in Google Wallet API if auth is available
      if (this.auth) {
        try {
          await this.upsertInAPI(isLoyalty ? 'loyaltyObject' : 'genericObject', populatedObject)
        } catch (error) {
          // Keep going so we can still generate a signed Save URL for debugging/testing.
          logWarn('Google Wallet API object create/update failed; continuing to Save URL generation')
          logWarn(error)
        }
      } else {
        logWarn('No Google Auth - object not created in API (will not work on device)')
      }

      // Generate save URL with signed JWT
      // Prefer embedding the full object in the JWT payload so the Save URL can work
      // even if the object was not pre-created in the API.
      const saveUrl = await this.generateSaveUrl(populatedObject, isLoyalty ? 'loyaltyObjects' : 'genericObjects')

      // Log the object
      logDebug('Google Wallet Object:', JSON.stringify(populatedObject, null, 2))
      logDebug('Save URL:', saveUrl)

      return {
        object: populatedObject,
        saveUrl
      }
    } catch (error) {
      throw new Error(`Failed to generate Google Wallet object: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async generateLoyaltyClass(passData: PassData, profile: ProfileConfig): Promise<any> {
    const templatePath = join(__dirname, '..', 'templates', 'google', 'loyalty_class.json')
    const templateContent = await readFile(templatePath, 'utf-8')
    const baseTemplate: any = JSON.parse(templateContent)

    const profileTemplate = profile.defaultTemplates.google.parentClass || {}
    const classId = `${this.config.issuerId}.${passData.id}`

    const metadata = (passData as any).metadata || {}
    const googleWallet = metadata.googleWallet || {}

    const payload: any = {
      ...baseTemplate,
      ...profileTemplate,
      id: classId,
      // Prefer business/program-provided metadata over template defaults.
      issuerName: googleWallet.issuerName || (profileTemplate as any).issuerName || baseTemplate.issuerName || 'sbcwallet',
      programName: (passData as any).programName || googleWallet.programName || 'Loyalty',
      hexBackgroundColor: googleWallet.backgroundColor || baseTemplate.hexBackgroundColor || '#111827'
    }

    // Geo locations (latitude/longitude pairs) for location-based surfacing.
    const locations = googleWallet.locations || metadata.locations
    if (Array.isArray(locations) && locations.length > 0) {
      payload.locations = locations
    }

    if (googleWallet.countryCode) payload.countryCode = googleWallet.countryCode
    if (googleWallet.homepageUrl) {
      payload.homepageUri = {
        uri: googleWallet.homepageUrl,
        description: googleWallet.homepageLabel || 'Website'
      }
    }

    // Images: require public URLs. Only include if provided.
    if (googleWallet.logoUrl) {
      payload.programLogo = { sourceUri: { uri: googleWallet.logoUrl } }
    }
    if (googleWallet.heroImageUrl) {
      payload.heroImage = { sourceUri: { uri: googleWallet.heroImageUrl } }
    }
    if (googleWallet.wordMarkUrl) {
      payload.wordMark = { sourceUri: { uri: googleWallet.wordMarkUrl } }
    }

    // Callback settings
    if (googleWallet.updateRequestUrl) {
      payload.callbackOptions = { updateRequestUrl: googleWallet.updateRequestUrl }
    }

    // Advanced/optional: allow raw overrides to be merged in.
    if (googleWallet.classOverrides && typeof googleWallet.classOverrides === 'object') {
      Object.assign(payload, googleWallet.classOverrides)
    }

    return payload
  }

  private populateObject(
    template: GooglePassObject,
    passData: PassData,
    profile: ProfileConfig,
    passType: 'parent' | 'child'
  ): GooglePassObject {
    const populated = { ...template }

    // Set card title based on pass type (Google Wallet format)
    if (passType === 'parent' && passData.type === 'parent') {
      const headerText = profile.name === 'logistics'
        ? 'Program Entry Schedule'
        : profile.name === 'healthcare'
          ? 'Appointment Batch'
          : 'Loyalty Program'
      const bodyText = passData.programName

      // Backward-compatible shape used by existing tests/consumers
      populated.cardTitle = { header: headerText, body: bodyText } as any
      populated.header = { header: 'Schedule', body: passData.id } as any

      // Newer Google Wallet localized value shape
      ;(populated.cardTitle as any).defaultValue = { language: 'en-US', value: headerText }
      ;(populated.header as any).defaultValue = { language: 'en-US', value: bodyText }
    } else if (passData.type === 'child') {
      const headerText = profile.name === 'logistics'
        ? 'Transport Order'
        : profile.name === 'healthcare'
          ? 'Patient Visit'
          : 'Loyalty Card'
      const bodyText = (passData as any).customerName || (passData as any).memberId || passData.plate || passData.patientName || passData.id

      // Backward-compatible shape used by existing tests/consumers
      populated.cardTitle = { header: headerText, body: bodyText } as any
      populated.header = { header: 'Order', body: passData.id } as any

      // Newer Google Wallet localized value shape
      ;(populated.cardTitle as any).defaultValue = { language: 'en-US', value: headerText }
      ;(populated.header as any).defaultValue = { language: 'en-US', value: bodyText }
    }

    // Populate text modules
    if (populated.textModulesData) {
      populated.textModulesData = populated.textModulesData.map(module => {
        const value = this.getFieldValue(module.id, passData)
        return {
          ...module,
          body: value || module.body
        }
      })

      // Add additional fields based on pass data
      if (passData.type === 'parent' && passData.window) {
        const windowModule = populated.textModulesData.find(m => m.id === 'window')
        if (windowModule) {
          windowModule.body = `${new Date(passData.window.from).toLocaleString()} - ${new Date(passData.window.to).toLocaleString()}`
        }
      }

      // Add status field
      const statusModule = populated.textModulesData.find(m => m.id === 'status')
      if (statusModule) {
        statusModule.body = passData.status
      }
    }

    return populated
  }

  private applyLoyaltyExtras(passObject: GooglePassObject, passData: PassData): void {
    const metadata = (passData as any).metadata || {}
    const googleWallet = metadata.googleWallet || {}

    // Geo locations
    const locations = googleWallet.locations || metadata.locations
    if (Array.isArray(locations) && locations.length > 0) {
      passObject.locations = locations
    }

    // Links
    if (Array.isArray(googleWallet.links) && googleWallet.links.length > 0) {
      passObject.linksModuleData = {
        uris: googleWallet.links.map((l: any, idx: number) => ({
          id: l.id || String(idx + 1),
          description: l.label || l.description,
          uri: l.url || l.uri
        })).filter((u: any) => u.uri)
      }
    }

    // Images
    if (Array.isArray(googleWallet.imageModules) && googleWallet.imageModules.length > 0) {
      passObject.imageModulesData = googleWallet.imageModules
        .map((img: any) => img?.imageUrl || img?.uri)
        .filter(Boolean)
        .map((uri: string) => ({
          mainImage: { sourceUri: { uri } }
        }))
    }

    // Messages
    if (Array.isArray(googleWallet.messages) && googleWallet.messages.length > 0) {
      passObject.messages = googleWallet.messages
        .map((m: any, idx: number) => ({
          id: m.id || String(idx + 1),
          header: m.header,
          body: m.body,
          messageType: m.messageType
        }))
        .filter((m: any) => m.header && m.body)
    }

    // Allow raw overrides
    if (googleWallet.objectOverrides && typeof googleWallet.objectOverrides === 'object') {
      Object.assign(passObject as any, googleWallet.objectOverrides)
    }
  }

  private getFieldValue(key: string, passData: PassData): string {
    // Handle nested keys
    const keys = key.split('.')
    let value: any = passData

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        return ''
      }
    }

    // Map common fields
    if (key === 'site' && passData.type === 'parent') {
      return passData.site || ''
    }

    if (key === 'carrier' && passData.type === 'child') {
      return passData.carrier || ''
    }

    if (key === 'client' && passData.type === 'child') {
      return passData.client || ''
    }

    if (key === 'status') {
      return passData.status
    }

    return value !== undefined && value !== null ? String(value) : ''
  }

  private async generateSaveUrl(
    passObject: GooglePassObject,
    payloadKey: 'genericObjects' | 'loyaltyObjects'
  ): Promise<string> {
    // Generate signed JWT for Google Wallet save URL
    const baseUrl = 'https://pay.google.com/gp/v/save'

    const objectId = passObject.id

    if (!this.config.serviceAccountPath) {
      logWarn('No service account - returning unsigned URL (will not work)')
      return `${baseUrl}/${encodeURIComponent(objectId)}`
    }

    try {
      // Read service account
      const serviceAccount = JSON.parse(await readFile(this.config.serviceAccountPath, 'utf-8'))

      // Create JWT claims
      const claims = {
        iss: serviceAccount.client_email,
        aud: 'google',
        origins: [],
        typ: 'savetowallet',
        payload: {
          // Embedding the full object enables a true end-to-end Save URL flow.
          // (Class must still exist and your account must be allowed if issuer/class is in test mode.)
          [payloadKey]: [passObject]
        }
      }

      // Sign the JWT
      const { default: jwt } = await import('jsonwebtoken')
      const token = jwt.sign(claims, serviceAccount.private_key, {
        algorithm: 'RS256'
      })

      return `${baseUrl}/${token}`
    } catch (error) {
      logError('Error generating signed JWT:', error)
      return `${baseUrl}/${encodeURIComponent(objectId)}`
    }
  }

  private async upsertInAPI(
    kind: 'genericObject' | 'loyaltyObject' | 'loyaltyClass',
    payload: any
  ): Promise<void> {
    if (!this.auth) {
      throw new Error('Google Auth not initialized')
    }

    try {
      const client = await this.auth.getClient()
      const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1'

      const resource = kind
      const url = `${baseUrl}/${resource}`

      await client.request({
        url,
        method: 'POST',
        data: payload
      })

      logDebug(`✅ ${kind} created in Google Wallet API`)
    } catch (error: any) {
      if (error.response?.status === 409) {
        // Object already exists, try to update it
        logDebug('ℹ️  Resource exists, updating...')
        try {
          const client = await this.auth.getClient()
          const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1'

          const resource = kind
          const resourceId = payload.id

          await client.request({
            url: `${baseUrl}/${resource}/${resourceId}`,
            method: 'PUT',
            data: payload
          })

          logDebug(`✅ ${kind} updated in Google Wallet API`)
        } catch (updateError) {
          logError(`❌ Error updating ${kind}:`, updateError)
          throw updateError
        }
      } else {
        logError(`❌ Error creating ${kind}:`, error.response?.data || error.message)
        throw error
      }
    }
  }

  async addMessageToLoyaltyObject(
    loyaltyObjectId: string,
    message: { header: string; body: string; messageType?: string }
  ): Promise<void> {
    if (!this.auth) {
      throw new Error('Google Auth not initialized')
    }

    const client = await this.auth.getClient()
    const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1'

    await client.request({
      url: `${baseUrl}/loyaltyObject/${encodeURIComponent(loyaltyObjectId)}/addMessage`,
      method: 'POST',
      data: {
        message: {
          header: message.header,
          body: message.body,
          messageType: message.messageType || 'TEXT_AND_NOTIFY'
        }
      }
    })
  }

  /**
   * Generate and add hero image with progress bar to the pass object
   *
   * Note: Google Wallet API requires publicly accessible URLs for images.
   * This method generates the hero image and saves it locally.
   * For production, upload images to a CDN/cloud storage and use those URLs.
   */
  private async addHeroImage(
    passObject: GooglePassObject,
    passData: PassData,
    profile: ProfileConfig
  ): Promise<void> {
    try {
      if (profile.name !== 'logistics' && profile.name !== 'healthcare') {
        // Loyalty (and any future profiles) skip hero images by default.
        passObject.hexBackgroundColor = '#111827'
        return
      }

      // Generate hero image based on profile and status
      let imageBuffer: Buffer

      if (profile.name === 'logistics') {
        imageBuffer = await generateLogisticsHeroImage(passData.status as LogisticsStatus)
      } else {
        imageBuffer = await generateHealthcareHeroImage(passData.status as HealthcareStatus)
      }

      // Save image to local file system
      const { writeFile } = await import('fs/promises')
      const imagePath = join(__dirname, '..', '..', 'hero-images', `${passData.id}.png`)

      // Ensure directory exists
      try {
        await writeFile(imagePath, imageBuffer)
        logDebug(`✨ Hero image saved: ${imagePath}`)
      } catch (err) {
        // Directory might not exist, that's OK - just skip for now
        logDebug('ℹ️  Hero image generated (not uploaded - requires public URL)')
      }

      // TODO: Upload to cloud storage and get public URL
      // For now, we'll skip adding the hero image to the pass object
      // since Google Wallet requires a publicly accessible URL

      // If you have a public image hosting URL, uncomment and use:
      // const publicUrl = `https://your-cdn.com/hero-images/${passData.id}.png`
      // passObject.heroImage = {
      //   sourceUri: {
      //     uri: publicUrl
      //   }
      // }

      // Add background color based on status
      const statusColors: Record<string, string> = {
        ISSUED: '#4A90E2',
        PRESENCE: '#F5A623',
        SCALE: '#7B68EE',
        OPS: '#50E3C2',
        EXITED: '#7ED321',
        SCHEDULED: '#4A90E2',
        CHECKIN: '#F5A623',
        PROCEDURE: '#E94B3C',
        DISCHARGED: '#7ED321'
      }

      passObject.hexBackgroundColor = statusColors[passData.status] || '#4A90E2'

      logDebug(`✨ Dynamic color applied for status: ${passData.status} (${passObject.hexBackgroundColor})`)
    } catch (error) {
      logError('⚠️  Failed to generate hero image:', error)
      // Continue without hero image if generation fails
    }
  }

  async createClass(profile: ProfileConfig, passType: 'parent' | 'child'): Promise<void> {
    // Stub for creating a Google Wallet class
    // In a real implementation, this would call the Google Wallet API
    const classId = `${this.config.issuerId}.${profile.name}_${passType}`

    logDebug(`Creating Google Wallet Class: ${classId}`)
    logDebug('Profile:', profile.name)
    logDebug('Type:', passType)

    // This would normally make an API call to:
    // POST https://walletobjects.googleapis.com/walletobjects/v1/genericClass
  }
}

export default GoogleWalletAdapter
