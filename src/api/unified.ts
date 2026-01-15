import type {
  CreateParentInput,
  CreateChildInput,
  CreateBusinessInput,
  CreateCustomerAccountInput,
  CreateLoyaltyProgramInput,
  IssueLoyaltyCardInput,
  UpdateLoyaltyPointsInput,
  LoyaltyBusiness,
  LoyaltyCustomerAccount,
  ParentPassData,
  ChildPassData,
  PassData,
  PassStatus,
  ProfileType,
  ProfileConfig,
  PassGenerationResult
} from '../types.js'
import {
  CreateParentInputSchema,
  CreateChildInputSchema,
  CreateBusinessInputSchema,
  CreateCustomerAccountInputSchema,
  CreateLoyaltyProgramInputSchema,
  IssueLoyaltyCardInputSchema,
  UpdateLoyaltyPointsInputSchema
} from '../types.js'
import { AppleWalletAdapter } from '../adapters/apple.js'
import { GoogleWalletAdapter } from '../adapters/google.js'
import logisticsProfile from '../profiles/logistics/index.js'
import healthcareProfile from '../profiles/healthcare/index.js'
import loyaltyProfile from '../profiles/loyalty/index.js'

const hashEvent = (data: any): string => {
  // Include timestamp and random value to ensure unique hashes
  const str = JSON.stringify({ ...data, _timestamp: Date.now(), _random: Math.random() })
  return `hash_${Buffer.from(str).toString('base64').slice(0, 32)}`
}

const signCredential = (hash: string): string => {
  return `sig_${hash.slice(5, 37)}`
}

// In-memory storage (replace with actual database in production)
const passStore = new Map<string, PassData>()
const businessStore = new Map<string, LoyaltyBusiness>()
const customerStore = new Map<string, LoyaltyCustomerAccount>()

// Profile registry
const profiles: Record<ProfileType, ProfileConfig> = {
  logistics: logisticsProfile,
  healthcare: healthcareProfile,
  loyalty: loyaltyProfile
}

/**
 * Get a profile by name
 */
export function getProfile(profileType: ProfileType): ProfileConfig {
  return profiles[profileType]
}

/**
 * List all available profiles
 */
export function listProfiles(): ProfileType[] {
  return Object.keys(profiles) as ProfileType[]
}

/**
 * Generate a unique ID for a pass
 */
function generatePassId(profile: ProfileType, type: 'parent' | 'child', parentId?: string): string {
  const date = new Date().toISOString().split('T')[0]
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()

  if (type === 'parent') {
    const prefix = profile === 'logistics' ? 'PES' : profile === 'healthcare' ? 'APB' : 'LPR'
    return `${prefix}-${date}-${random}`
  } else {
    const prefix = profile === 'logistics' ? 'TO' : profile === 'healthcare' ? 'PV' : 'LCR'
    const parentSuffix = parentId ? parentId.split('-').pop() : random
    return `${prefix}-${date}-${parentSuffix}-${random}`
  }
}

function generateBusinessId(): string {
  const date = new Date().toISOString().split('T')[0]
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `BIZ-${date}-${random}`
}

function generateCustomerId(): string {
  const date = new Date().toISOString().split('T')[0]
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `CUS-${date}-${random}`
}

function generateMemberId(businessId: string): string {
  const bizSuffix = businessId.split('-').pop() || 'BIZ'
  const random = Math.random().toString(36).substring(2, 10).toUpperCase()
  // This is the value we encode into the QR code / barcode.
  return `SBC-${bizSuffix}-${random}`
}

/**
 * Create a business (tenant) that owns a loyalty program.
 */
export function createBusiness(input: CreateBusinessInput): LoyaltyBusiness {
  const validated = CreateBusinessInputSchema.parse(input)

  const id = (validated as any).id || generateBusinessId()
  const now = new Date().toISOString()

  const business: LoyaltyBusiness = {
    id,
    name: validated.name,
    programName: validated.programName || `${validated.name} Loyalty`,
    pointsLabel: validated.pointsLabel || 'Points',
    createdAt: now,
    updatedAt: now
  }

  businessStore.set(id, business)
  return business
}

export function getBusiness(businessId: string): LoyaltyBusiness | undefined {
  return businessStore.get(businessId)
}

/**
 * Create a customer account under a business.
 */
export function createCustomerAccount(input: CreateCustomerAccountInput): LoyaltyCustomerAccount {
  const validated = CreateCustomerAccountInputSchema.parse(input)

  const business = businessStore.get(validated.businessId)
  if (!business) {
    throw new Error(`Business not found: ${validated.businessId}`)
  }

  const id = (validated as any).id || generateCustomerId()
  const now = new Date().toISOString()

  const customer: LoyaltyCustomerAccount = {
    id,
    businessId: validated.businessId,
    fullName: validated.fullName,
    memberId: (validated as any).memberId || generateMemberId(validated.businessId),
    createdAt: now,
    updatedAt: now
  }

  customerStore.set(id, customer)
  return customer
}

export function getCustomerAccount(customerId: string): LoyaltyCustomerAccount | undefined {
  return customerStore.get(customerId)
}

/**
 * Define (or update) the loyalty program pass for a business.
 * This creates a parent pass with profile=loyalty.
 */
export async function createLoyaltyProgram(input: CreateLoyaltyProgramInput): Promise<ParentPassData> {
  const validated = CreateLoyaltyProgramInputSchema.parse(input)

  const business = businessStore.get(validated.businessId)
  if (!business) {
    throw new Error(`Business not found: ${validated.businessId}`)
  }

  const program = await createParentSchedule({
    id: (validated as any).programId,
    profile: 'loyalty',
    programName: validated.programName || business.programName,
    site: validated.site,
    metadata: {
      ...validated.metadata,
      businessId: business.id,
      businessName: business.name,
      pointsLabel: business.pointsLabel,
      googleWallet: {
        ...(validated.metadata as any)?.googleWallet,
        locations: validated.locations,
        countryCode: validated.countryCode,
        homepageUrl: validated.homepageUrl
      }
    }
  })

  business.loyaltyProgramId = program.id
  business.updatedAt = new Date().toISOString()
  businessStore.set(business.id, business)

  return program
}

/**
 * Issue a loyalty card (child pass) for a customer.
 * QR/barcode value uses memberId.
 */
export async function issueLoyaltyCard(input: IssueLoyaltyCardInput): Promise<ChildPassData> {
  const validated = IssueLoyaltyCardInputSchema.parse(input)

  const business = businessStore.get(validated.businessId)
  if (!business) {
    throw new Error(`Business not found: ${validated.businessId}`)
  }
  if (!business.loyaltyProgramId) {
    throw new Error(`Business has no loyalty program yet: ${validated.businessId}`)
  }

  const customer = customerStore.get(validated.customerId)
  if (!customer || customer.businessId !== validated.businessId) {
    throw new Error(`Customer not found for business: ${validated.customerId}`)
  }

  const program = passStore.get(business.loyaltyProgramId)
  const programGoogleWallet = program && program.type === 'parent' ? (program.metadata as any)?.googleWallet : undefined

  const card = await createChildTicket({
    id: (validated as any).cardId,
    profile: 'loyalty',
    parentId: business.loyaltyProgramId,
    businessId: business.id,
    customerId: customer.id,
    customerName: customer.fullName,
    memberId: customer.memberId,
    points: validated.initialPoints,
    metadata: {
      ...validated.metadata,
      businessName: business.name,
      pointsLabel: business.pointsLabel,
      googleWallet: {
        ...(programGoogleWallet || {}),
        ...((validated.metadata as any)?.googleWallet || {})
      }
    }
  })

  // Loyalty cards start as ACTIVE unless explicitly overridden
  card.status = 'ACTIVE' as PassStatus
  card.updatedAt = new Date().toISOString()
  card.hash = hashEvent(card)
  card.signature = signCredential(card.hash)
  passStore.set(card.id, card)

  return card
}

/**
 * Update points on a loyalty card.
 */
export async function updateLoyaltyPoints(input: UpdateLoyaltyPointsInput): Promise<PassData> {
  const validated = UpdateLoyaltyPointsInputSchema.parse(input)
  const pass = passStore.get(validated.cardId)

  if (!pass) {
    throw new Error(`Pass not found: ${validated.cardId}`)
  }
  if (pass.type !== 'child' || pass.profile !== 'loyalty') {
    throw new Error(`Not a loyalty card: ${validated.cardId}`)
  }

  const currentPoints = typeof pass.points === 'number' ? pass.points : 0
  const nextPoints = validated.setPoints !== undefined
    ? validated.setPoints
    : Math.max(0, currentPoints + (validated.delta || 0))

  pass.points = nextPoints
  pass.updatedAt = new Date().toISOString()

  pass.hash = hashEvent(pass)
  pass.signature = signCredential(pass.hash)

  passStore.set(pass.id, pass)
  return pass
}

/**
 * Create a parent schedule (PES or AppointmentBatch)
 */
export async function createParentSchedule(input: CreateParentInput): Promise<ParentPassData> {
  // Validate input
  const validated = CreateParentInputSchema.parse(input)

  // Get profile
  const profile = getProfile(validated.profile)

  // Generate ID (allow callers to provide a stable one)
  const id = (validated as any).id || generatePassId(validated.profile, 'parent')

  // Get initial status
  const initialStatus = profile.statusFlow[0] as PassStatus

  // Create pass data
  const passData: ParentPassData = {
    id,
    type: 'parent',
    profile: validated.profile,
    programName: validated.programName,
    site: validated.site,
    window: validated.window,
    capacity: validated.capacity,
    metadata: validated.metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: initialStatus
  }

  const hash = hashEvent(passData)
  const signature = signCredential(hash)

  passData.hash = hash
  passData.signature = signature

  // Store pass
  passStore.set(id, passData)

  return passData
}

/**
 * Create a child ticket (TO or PatientVisit)
 */
export async function createChildTicket(input: CreateChildInput): Promise<ChildPassData> {
  // Validate input
  const validated = CreateChildInputSchema.parse(input)

  // Verify parent exists
  const parent = passStore.get(validated.parentId)
  if (!parent || parent.type !== 'parent') {
    throw new Error(`Parent pass not found: ${validated.parentId}`)
  }

  // Get profile
  const profile = getProfile(validated.profile)

  // Generate ID (allow callers to provide a stable one)
  const id = (validated as any).id || generatePassId(validated.profile, 'child', validated.parentId)

  // Get initial status
  const initialStatus = profile.statusFlow[0] as PassStatus

  // Create pass data
  const passData: ChildPassData = {
    id,
    type: 'child',
    profile: validated.profile,
    parentId: validated.parentId,
    plate: validated.plate,
    carrier: validated.carrier,
    client: validated.client,
    patientName: validated.patientName,
    procedure: validated.procedure,
    doctor: validated.doctor,
    businessId: validated.businessId,
    customerId: validated.customerId,
    customerName: validated.customerName,
    memberId: validated.memberId,
    points: validated.points,
    metadata: validated.metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: initialStatus
  }

  const hash = hashEvent(passData)
  const signature = signCredential(hash)

  passData.hash = hash
  passData.signature = signature

  // Store pass
  passStore.set(id, passData)

  return passData
}

/**
 * Update the status of a pass
 */
export async function updatePassStatus(passId: string, newStatus: PassStatus): Promise<PassData> {
  // Get pass
  const passData = passStore.get(passId)
  if (!passData) {
    throw new Error(`Pass not found: ${passId}`)
  }

  // Get profile
  const profile = getProfile(passData.profile)

  // Validate status transition
  if (!profile.statusFlow.includes(newStatus)) {
    throw new Error(`Invalid status '${newStatus}' for profile '${passData.profile}'`)
  }

  // Update status
  passData.status = newStatus
  passData.updatedAt = new Date().toISOString()

  // Re-hash and sign
  const hash = hashEvent(passData)
  const signature = signCredential(hash)

  passData.hash = hash
  passData.signature = signature

  // Update store
  passStore.set(passId, passData)

  return passData
}

/**
 * Get a pass by ID
 */
export function getPass(passId: string): PassData | undefined {
  return passStore.get(passId)
}

/**
 * Get Apple Wallet .pkpass buffer for a pass
 */
export async function getPkpassBuffer(
  passType: 'parent' | 'child',
  passData: PassData
): Promise<Buffer> {
  const profile = getProfile(passData.profile)
  const adapter = new AppleWalletAdapter()

  return adapter.generatePkpass(passData, profile, passType)
}

/**
 * Get Google Wallet object for a pass
 */
export async function getGoogleObject(
  passType: 'parent' | 'child',
  passData: PassData
): Promise<{ object: any; saveUrl: string }> {
  const profile = getProfile(passData.profile)
  const adapter = new GoogleWalletAdapter()

  return adapter.generatePassObject(passData, profile, passType)
}

/**
 * Generate a complete pass with both Apple and Google wallet data
 */
export async function generatePass(
  passData: PassData,
  options: {
    includeApple?: boolean
    includeGoogle?: boolean
  } = { includeApple: true, includeGoogle: true }
): Promise<PassGenerationResult> {
  const profile = getProfile(passData.profile)
  const passType = passData.type

  const result: PassGenerationResult = {
    passData
  }

  if (options.includeApple) {
    try {
      result.applePkpass = await getPkpassBuffer(passType, passData)
    } catch (error) {
      console.warn('Failed to generate Apple Wallet pass:', error)
    }
  }

  if (options.includeGoogle) {
    try {
      const googleResult = await getGoogleObject(passType, passData)
      result.googleObject = googleResult.object
      result.googleSaveUrl = googleResult.saveUrl
    } catch (error) {
      console.warn('Failed to generate Google Wallet object:', error)
    }
  }

  return result
}
