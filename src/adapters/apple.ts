import { PKPass } from 'passkit-generator'
import type { PassData, ApplePassConfig, ApplePassTemplate, ProfileConfig } from '../types.js'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class AppleWalletAdapter {
  private config: ApplePassConfig

  constructor(config?: Partial<ApplePassConfig>) {
    this.config = {
      teamId: config?.teamId || process.env.APPLE_TEAM_ID || '',
      passTypeId: config?.passTypeId || process.env.APPLE_PASS_TYPE_ID || '',
      certPath: config?.certPath || process.env.APPLE_CERT_PATH || '',
      certPassword: config?.certPassword || process.env.APPLE_CERT_PASSWORD || '',
      wwdrPath: config?.wwdrPath || process.env.APPLE_WWDR_PATH || ''
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

      // Build pass props from populated template
      const passProps: any = {
        serialNumber: passData.id,
        description: populatedTemplate.description || 'sbcwallet Pass',
        organizationName: populatedTemplate.organizationName || 'sbcwallet',
        passTypeIdentifier: this.config.passTypeId,
        teamIdentifier: this.config.teamId
      }

      // Add colors
      if (populatedTemplate.backgroundColor) {
        passProps.backgroundColor = populatedTemplate.backgroundColor
      }
      if (populatedTemplate.foregroundColor) {
        passProps.foregroundColor = populatedTemplate.foregroundColor
      }
      if (populatedTemplate.labelColor) {
        passProps.labelColor = populatedTemplate.labelColor
      }
      if (populatedTemplate.logoText) {
        passProps.logoText = populatedTemplate.logoText
      }

      // Add barcodes
      if (populatedTemplate.barcodes && populatedTemplate.barcodes.length > 0) {
        passProps.barcodes = populatedTemplate.barcodes
      }

      // Add generic fields
      if (populatedTemplate.generic) {
        passProps.generic = populatedTemplate.generic
      }

      // Create pass
      const pass = new PKPass(
        {},
        {
          wwdr: this.config.wwdrPath,
          signerCert: this.config.certPath,
          signerKey: this.config.certPath,
          signerKeyPassphrase: this.config.certPassword
        },
        passProps
      )

      // Generate buffer
      const buffer = await pass.getAsBuffer()
      return buffer
    } catch (error) {
      throw new Error(`Failed to generate Apple Wallet pass: ${error instanceof Error ? error.message : String(error)}`)
    }
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
