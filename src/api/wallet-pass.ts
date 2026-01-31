/**
 * Wallet Pass API - Unified API for all pass types
 * 
 * Supports:
 * - Apple Wallet: Boarding Pass, Event Ticket, Store Card, Coupon, Generic
 * - Google Wallet: Flight, Event Ticket, Loyalty, Gift Card, Offer, Transit, Generic
 */

import type {
  WalletPassInput,
  WalletPassData,
  PassGenerationOptions,
  BoardingPassInput,
  EventTicketInput,
  StoreCardInput,
  CouponInput,
  GiftCardInput,
  TransitPassInput,
  GenericPassInput,
  PassStatus,
  ApplePassType,
  GooglePassType
} from '../types.js'
import {
  WalletPassInputSchema,
  BoardingPassInputSchema,
  EventTicketInputSchema,
  StoreCardInputSchema,
  CouponInputSchema,
  GiftCardInputSchema,
  TransitPassInputSchema,
  GenericPassInputSchema
} from '../types.js'
import { AppleWalletMultiAdapter } from '../adapters/apple-wallet.js'
import { GoogleWalletMultiAdapter } from '../adapters/google-wallet.js'
import { logDebug, logWarn, logError } from '../utils/logger.js'

// In-memory storage (replace with database in production)
const walletPassStore = new Map<string, WalletPassData>()

/**
 * Generate unique pass ID
 */
function generatePassId(passType: string): string {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  
  const prefixes: Record<string, string> = {
    'boardingPass': 'BP',
    'eventTicket': 'ET',
    'storeCard': 'SC',
    'coupon': 'CP',
    'giftCard': 'GC',
    'transit': 'TR',
    'generic': 'GN',
    'loyalty': 'LY',
    'offer': 'OF',
    'flight': 'FL'
  }
  
  const prefix = prefixes[passType] || 'WP'
  return `${prefix}-${date}-${random}`
}

/**
 * Hash pass data for integrity
 */
function hashPassData(data: any): string {
  const str = JSON.stringify({ ...data, _timestamp: Date.now() })
  return `hash_${Buffer.from(str).toString('base64').slice(0, 32)}`
}

// ====================================
// PASS CREATION APIs
// ====================================

/**
 * Create a Boarding Pass (Apple) / Flight (Google)
 */
export async function createBoardingPass(
  input: Omit<BoardingPassInput, 'passType'>,
  options?: PassGenerationOptions
): Promise<{
  passData: WalletPassData
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: any
}> {
  const fullInput: BoardingPassInput = { ...input, passType: 'boardingPass' }
  return createWalletPass(fullInput, options)
}

/**
 * Create an Event Ticket
 */
export async function createEventTicket(
  input: Omit<EventTicketInput, 'passType'>,
  options?: PassGenerationOptions
): Promise<{
  passData: WalletPassData
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: any
}> {
  const fullInput: EventTicketInput = { ...input, passType: 'eventTicket' }
  return createWalletPass(fullInput, options)
}

/**
 * Create a Store Card (Loyalty Card)
 */
export async function createStoreCard(
  input: Omit<StoreCardInput, 'passType'>,
  options?: PassGenerationOptions
): Promise<{
  passData: WalletPassData
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: any
}> {
  const fullInput: StoreCardInput = { ...input, passType: 'storeCard' }
  return createWalletPass(fullInput, options)
}

/**
 * Create a Coupon / Offer
 */
export async function createCoupon(
  input: Omit<CouponInput, 'passType'>,
  options?: PassGenerationOptions
): Promise<{
  passData: WalletPassData
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: any
}> {
  const fullInput: CouponInput = { ...input, passType: 'coupon' }
  return createWalletPass(fullInput, options)
}

/**
 * Create a Gift Card
 */
export async function createGiftCard(
  input: Omit<GiftCardInput, 'passType'>,
  options?: PassGenerationOptions
): Promise<{
  passData: WalletPassData
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: any
}> {
  const fullInput: GiftCardInput = { ...input, passType: 'giftCard' }
  return createWalletPass(fullInput, options)
}

/**
 * Create a Transit Pass
 */
export async function createTransitPass(
  input: Omit<TransitPassInput, 'passType'>,
  options?: PassGenerationOptions
): Promise<{
  passData: WalletPassData
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: any
}> {
  const fullInput: TransitPassInput = { ...input, passType: 'transit' }
  return createWalletPass(fullInput, options)
}

/**
 * Create a Generic Pass
 */
export async function createGenericPass(
  input: Omit<GenericPassInput, 'passType'>,
  options?: PassGenerationOptions
): Promise<{
  passData: WalletPassData
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: any
}> {
  const fullInput: GenericPassInput = { ...input, passType: 'generic' }
  return createWalletPass(fullInput, options)
}

/**
 * Create any type of Wallet Pass
 */
export async function createWalletPass(
  input: WalletPassInput,
  options?: PassGenerationOptions
): Promise<{
  passData: WalletPassData
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: any
}> {
  // Validate input
  const validatedInput = WalletPassInputSchema.parse(input) as WalletPassInput
  
  // Generate pass ID
  const passId = generatePassId(validatedInput.passType)
  const now = new Date().toISOString()
  
  // Create pass data
  const passData: WalletPassData = {
    id: passId,
    passType: validatedInput.passType as ApplePassType | GooglePassType,
    createdAt: now,
    updatedAt: now,
    status: getInitialStatus(validatedInput.passType),
    input: validatedInput,
    barcodeValue: getBarcodeValue(validatedInput, passId),
    hash: hashPassData(validatedInput)
  }
  
  // Store pass data
  walletPassStore.set(passId, passData)
  
  // Determine platforms to generate for
  const platforms = options?.platforms || ['apple', 'google']
  
  let applePkpass: Buffer | undefined
  let googleSaveUrl: string | undefined
  let googleObject: any | undefined
  
  // Generate Apple Wallet pass
  if (platforms.includes('apple')) {
    try {
      const appleAdapter = new AppleWalletMultiAdapter({
        teamId: options?.appleTeamId,
        passTypeId: options?.applePassTypeId,
        certPath: options?.appleCertPath,
        certPassword: options?.appleCertPassword,
        wwdrPath: options?.appleWwdrPath
      })
      
      applePkpass = await appleAdapter.generatePass(passId, validatedInput as WalletPassInput)
      passData.applePassTypeId = options?.applePassTypeId || process.env.APPLE_PASS_TYPE_ID
      logDebug(`✅ Apple Wallet pass generated: ${passId}`)
    } catch (error) {
      logWarn(`⚠️ Failed to generate Apple pass: ${error}`)
    }
  }
  
  // Generate Google Wallet pass
  if (platforms.includes('google')) {
    try {
      const googleAdapter = new GoogleWalletMultiAdapter({
        issuerId: options?.googleIssuerId,
        serviceAccountPath: options?.googleServiceAccountPath
      })
      
      const result = await googleAdapter.generatePass(passId, validatedInput as WalletPassInput, {
        createClass: options?.createClass,
        classId: options?.googleClassId
      })
      
      googleSaveUrl = result.saveUrl
      googleObject = result.object
      passData.googleClassId = result.classId
      passData.googleObjectId = result.object.id
      logDebug(`✅ Google Wallet pass generated: ${passId}`)
    } catch (error) {
      logWarn(`⚠️ Failed to generate Google pass: ${error}`)
    }
  }
  
  // Update stored pass data
  walletPassStore.set(passId, passData)
  
  return {
    passData,
    applePkpass,
    googleSaveUrl,
    googleObject
  }
}

// ====================================
// PASS RETRIEVAL APIs
// ====================================

/**
 * Get a pass by ID
 */
export function getWalletPass(passId: string): WalletPassData | undefined {
  return walletPassStore.get(passId)
}

/**
 * List all passes
 */
export function listWalletPasses(filter?: {
  passType?: string
  status?: PassStatus
}): WalletPassData[] {
  let passes = Array.from(walletPassStore.values())
  
  if (filter?.passType) {
    passes = passes.filter(p => p.passType === filter.passType)
  }
  
  if (filter?.status) {
    passes = passes.filter(p => p.status === filter.status)
  }
  
  return passes
}

// ====================================
// PASS UPDATE APIs
// ====================================

/**
 * Update pass status
 */
export async function updateWalletPassStatus(
  passId: string,
  newStatus: PassStatus,
  options?: PassGenerationOptions
): Promise<WalletPassData | undefined> {
  const passData = walletPassStore.get(passId)
  if (!passData) {
    throw new Error(`Pass not found: ${passId}`)
  }
  
  passData.status = newStatus
  passData.updatedAt = new Date().toISOString()
  
  // Update in Google Wallet if configured
  if (passData.googleObjectId && options?.googleServiceAccountPath) {
    try {
      const googleAdapter = new GoogleWalletMultiAdapter({
        issuerId: options?.googleIssuerId,
        serviceAccountPath: options?.googleServiceAccountPath
      })
      
      await googleAdapter.updatePassObject(
        passData.googleObjectId,
        passData.passType as GooglePassType,
        { state: newStatus === 'EXPIRED' || newStatus === 'CANCELLED' ? 'INACTIVE' : 'ACTIVE' }
      )
    } catch (error) {
      logWarn(`⚠️ Failed to update Google pass: ${error}`)
    }
  }
  
  walletPassStore.set(passId, passData)
  return passData
}

/**
 * Update loyalty points
 */
export async function updateLoyaltyBalance(
  passId: string,
  points: number,
  options?: PassGenerationOptions
): Promise<WalletPassData | undefined> {
  const passData = walletPassStore.get(passId)
  if (!passData) {
    throw new Error(`Pass not found: ${passId}`)
  }
  
  if (passData.passType !== 'storeCard' && passData.passType !== 'loyalty') {
    throw new Error(`Pass ${passId} is not a loyalty/store card`)
  }
  
  // Update input data
  const input = passData.input as StoreCardInput
  input.points = points
  passData.updatedAt = new Date().toISOString()
  
  // Update in Google Wallet
  if (passData.googleObjectId && options?.googleServiceAccountPath) {
    try {
      const googleAdapter = new GoogleWalletMultiAdapter({
        issuerId: options?.googleIssuerId,
        serviceAccountPath: options?.googleServiceAccountPath
      })
      
      await googleAdapter.updatePassObject(
        passData.googleObjectId,
        'loyalty',
        {
          loyaltyPoints: {
            label: input.pointsLabel || 'Points',
            balance: { int: points }
          }
        }
      )
    } catch (error) {
      logWarn(`⚠️ Failed to update Google pass: ${error}`)
    }
  }
  
  walletPassStore.set(passId, passData)
  return passData
}

/**
 * Update gift card balance
 */
export async function updateGiftCardBalance(
  passId: string,
  balance: number,
  options?: PassGenerationOptions
): Promise<WalletPassData | undefined> {
  const passData = walletPassStore.get(passId)
  if (!passData) {
    throw new Error(`Pass not found: ${passId}`)
  }
  
  if (passData.passType !== 'giftCard') {
    throw new Error(`Pass ${passId} is not a gift card`)
  }
  
  // Update input data
  const input = passData.input as GiftCardInput
  input.balance = balance
  passData.updatedAt = new Date().toISOString()
  
  // Update status if depleted
  if (balance <= 0) {
    passData.status = 'DEPLETED'
  }
  
  // Update in Google Wallet
  if (passData.googleObjectId && options?.googleServiceAccountPath) {
    try {
      const googleAdapter = new GoogleWalletMultiAdapter({
        issuerId: options?.googleIssuerId,
        serviceAccountPath: options?.googleServiceAccountPath
      })
      
      await googleAdapter.updatePassObject(
        passData.googleObjectId,
        'giftCard',
        {
          balance: {
            currencyCode: input.currency,
            micros: balance * 1000000
          },
          balanceUpdateTime: {
            date: new Date().toISOString()
          }
        }
      )
    } catch (error) {
      logWarn(`⚠️ Failed to update Google pass: ${error}`)
    }
  }
  
  walletPassStore.set(passId, passData)
  return passData
}

/**
 * Send notification/message to pass holder
 */
export async function sendPassNotification(
  passId: string,
  message: { header: string; body: string },
  options?: PassGenerationOptions
): Promise<void> {
  const passData = walletPassStore.get(passId)
  if (!passData) {
    throw new Error(`Pass not found: ${passId}`)
  }
  
  // Send via Google Wallet
  if (passData.googleObjectId && options?.googleServiceAccountPath) {
    try {
      const googleAdapter = new GoogleWalletMultiAdapter({
        issuerId: options?.googleIssuerId,
        serviceAccountPath: options?.googleServiceAccountPath
      })
      
      await googleAdapter.addMessage(
        passData.googleObjectId,
        passData.passType as GooglePassType,
        {
          header: message.header,
          body: message.body,
          messageType: 'TEXT_AND_NOTIFY'
        }
      )
      
      logDebug(`✅ Notification sent to ${passId}`)
    } catch (error) {
      logError(`❌ Failed to send notification: ${error}`)
      throw error
    }
  }
  
  // Note: Apple Wallet requires push notifications via APNs
  // This would require additional setup with Apple Push Notification service
}

/**
 * Regenerate pass (e.g., after updates)
 */
export async function regeneratePass(
  passId: string,
  options?: PassGenerationOptions
): Promise<{
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: any
}> {
  const passData = walletPassStore.get(passId)
  if (!passData) {
    throw new Error(`Pass not found: ${passId}`)
  }
  
  const platforms = options?.platforms || ['apple', 'google']
  
  let applePkpass: Buffer | undefined
  let googleSaveUrl: string | undefined
  let googleObject: any | undefined
  
  // Regenerate Apple pass
  if (platforms.includes('apple')) {
    try {
      const appleAdapter = new AppleWalletMultiAdapter({
        teamId: options?.appleTeamId,
        passTypeId: options?.applePassTypeId,
        certPath: options?.appleCertPath,
        certPassword: options?.appleCertPassword,
        wwdrPath: options?.appleWwdrPath
      })
      
      applePkpass = await appleAdapter.generatePass(passId, passData.input)
    } catch (error) {
      logWarn(`⚠️ Failed to regenerate Apple pass: ${error}`)
    }
  }
  
  // Regenerate Google pass
  if (platforms.includes('google')) {
    try {
      const googleAdapter = new GoogleWalletMultiAdapter({
        issuerId: options?.googleIssuerId,
        serviceAccountPath: options?.googleServiceAccountPath
      })
      
      const result = await googleAdapter.generatePass(passId, passData.input, {
        classId: passData.googleClassId
      })
      
      googleSaveUrl = result.saveUrl
      googleObject = result.object
    } catch (error) {
      logWarn(`⚠️ Failed to regenerate Google pass: ${error}`)
    }
  }
  
  return {
    applePkpass,
    googleSaveUrl,
    googleObject
  }
}

// ====================================
// HELPER FUNCTIONS
// ====================================

/**
 * Get initial status for pass type
 */
function getInitialStatus(passType: string): PassStatus {
  const statusMap: Record<string, PassStatus> = {
    'boardingPass': 'SCHEDULED',
    'eventTicket': 'VALID',
    'storeCard': 'ACTIVE',
    'coupon': 'ACTIVE',
    'giftCard': 'ACTIVE',
    'transit': 'ACTIVE',
    'generic': 'ACTIVE',
    'loyalty': 'ACTIVE',
    'offer': 'ACTIVE',
    'flight': 'SCHEDULED'
  }
  return statusMap[passType] || 'ACTIVE'
}

/**
 * Get barcode value from input
 */
function getBarcodeValue(input: WalletPassInput, passId: string): string {
  switch (input.passType) {
    case 'boardingPass':
      return (input as BoardingPassInput).confirmationCode
    case 'eventTicket':
      return (input as EventTicketInput).ticketNumber
    case 'storeCard':
      return (input as StoreCardInput).memberId
    case 'coupon':
      return (input as CouponInput).promoCode || passId
    case 'giftCard':
      return (input as GiftCardInput).cardNumber
    case 'transit':
      return (input as TransitPassInput).ticketNumber || passId
    case 'generic':
      return (input as GenericPassInput).barcodeValue || passId
    default:
      return passId
  }
}

// ====================================
// EXPORT ALL
// ====================================

export {
  // Types
  WalletPassInput,
  WalletPassData,
  PassGenerationOptions,
  BoardingPassInput,
  EventTicketInput,
  StoreCardInput,
  CouponInput,
  GiftCardInput,
  TransitPassInput,
  GenericPassInput
}
