import { z } from 'zod'

// Profile types
export type ProfileType = 'logistics' | 'healthcare' | 'loyalty'

// Status types
export type LogisticsStatus = 'ISSUED' | 'PRESENCE' | 'SCALE' | 'OPS' | 'EXITED'
export type HealthcareStatus = 'SCHEDULED' | 'CHECKIN' | 'PROCEDURE' | 'DISCHARGED'
export type LoyaltyStatus = 'ACTIVE' | 'SUSPENDED'
export type PassStatus = LogisticsStatus | HealthcareStatus | LoyaltyStatus

// Time window schema
export const TimeWindowSchema = z.object({
  from: z.string(),
  to: z.string(),
  tz: z.string().optional()
})

export type TimeWindow = z.infer<typeof TimeWindowSchema>

// Base pass data
export interface BasePassData {
  id: string
  profile: ProfileType
  createdAt: string
  updatedAt: string
  status: PassStatus
  hash?: string
  signature?: string
  anchorId?: string
}

// Parent pass data (PES or AppointmentBatch)
export interface ParentPassData extends BasePassData {
  type: 'parent'
  programName: string
  site?: string
  window?: TimeWindow
  capacity?: number
  metadata?: Record<string, any>
}

// Child pass data (TO or PatientVisit)
export interface ChildPassData extends BasePassData {
  type: 'child'
  parentId: string
  // Logistics specific
  plate?: string
  carrier?: string
  client?: string
  // Healthcare specific
  patientName?: string
  procedure?: string
  doctor?: string

  // Loyalty specific
  businessId?: string
  customerId?: string
  customerName?: string
  memberId?: string
  points?: number
  metadata?: Record<string, any>
}

// Unified pass data
export type PassData = ParentPassData | ChildPassData

// Create parent input schema
export const CreateParentInputSchema = z.object({
  profile: z.enum(['logistics', 'healthcare', 'loyalty']).default('logistics'),
  programName: z.string(),
  site: z.string().optional(),
  window: TimeWindowSchema.optional(),
  capacity: z.number().positive().optional(),
  metadata: z.record(z.any()).optional()
})

export type CreateParentInput = z.infer<typeof CreateParentInputSchema>

// Create child input schema
export const CreateChildInputSchema = z.object({
  profile: z.enum(['logistics', 'healthcare', 'loyalty']).default('logistics'),
  parentId: z.string(),
  // Logistics fields
  plate: z.string().optional(),
  carrier: z.string().optional(),
  client: z.string().optional(),
  // Healthcare fields
  patientName: z.string().optional(),
  procedure: z.string().optional(),
  doctor: z.string().optional(),

  // Loyalty fields
  businessId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  memberId: z.string().optional(),
  points: z.number().nonnegative().optional(),
  metadata: z.record(z.any()).optional()
})

// Loyalty domain (multi-tenant) types
export interface LoyaltyBusiness {
  id: string
  name: string
  programName: string
  pointsLabel: string
  loyaltyProgramId?: string
  createdAt: string
  updatedAt: string
}

export interface LoyaltyCustomerAccount {
  id: string
  businessId: string
  fullName: string
  memberId: string
  createdAt: string
  updatedAt: string
}

export const CreateBusinessInputSchema = z.object({
  name: z.string().min(1),
  programName: z.string().min(1).optional(),
  pointsLabel: z.string().min(1).optional()
})

export type CreateBusinessInput = z.infer<typeof CreateBusinessInputSchema>

export const CreateCustomerAccountInputSchema = z.object({
  businessId: z.string().min(1),
  fullName: z.string().min(1)
})

export type CreateCustomerAccountInput = z.infer<typeof CreateCustomerAccountInputSchema>

export const CreateLoyaltyProgramInputSchema = z.object({
  businessId: z.string().min(1),
  // Optional overrides
  programName: z.string().min(1).optional(),
  site: z.string().optional(),
  // Google Wallet geo-fence locations (latitude/longitude pairs)
  locations: z.array(z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })).optional(),
  countryCode: z.string().length(2).optional(),
  homepageUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional()
})

export type CreateLoyaltyProgramInput = z.infer<typeof CreateLoyaltyProgramInputSchema>

export const IssueLoyaltyCardInputSchema = z.object({
  businessId: z.string().min(1),
  customerId: z.string().min(1),
  initialPoints: z.number().nonnegative().optional().default(0),
  metadata: z.record(z.any()).optional()
})

export type IssueLoyaltyCardInput = z.infer<typeof IssueLoyaltyCardInputSchema>

export const UpdateLoyaltyPointsInputSchema = z.object({
  cardId: z.string().min(1),
  // Use either setPoints or delta
  setPoints: z.number().nonnegative().optional(),
  delta: z.number().int().optional()
}).refine(v => v.setPoints !== undefined || v.delta !== undefined, {
  message: 'Provide either setPoints or delta'
})

export type UpdateLoyaltyPointsInput = z.infer<typeof UpdateLoyaltyPointsInputSchema>

export type GeoLocation = {
  latitude: number
  longitude: number
}

export type CreateChildInput = z.infer<typeof CreateChildInputSchema>

// Apple Wallet specific types
export interface ApplePassConfig {
  teamId: string
  passTypeId: string
  certPath: string
  certPassword: string
  wwdrPath: string
}

export interface ApplePassField {
  key: string
  label: string
  value: string | number
  textAlignment?: 'PKTextAlignmentLeft' | 'PKTextAlignmentCenter' | 'PKTextAlignmentRight' | 'PKTextAlignmentNatural'
}

export interface ApplePassTemplate {
  formatVersion: number
  passTypeIdentifier: string
  serialNumber: string
  teamIdentifier: string
  organizationName: string
  description: string
  backgroundColor?: string
  foregroundColor?: string
  labelColor?: string
  logoText?: string
  generic?: {
    primaryFields?: ApplePassField[]
    secondaryFields?: ApplePassField[]
    auxiliaryFields?: ApplePassField[]
    backFields?: ApplePassField[]
    headerFields?: ApplePassField[]
  }
  barcode?: {
    message: string
    format: string
    messageEncoding: string
  }
  barcodes?: Array<{
    message: string
    format: string
    messageEncoding: string
  }>
}

// Google Wallet specific types
export interface GooglePassConfig {
  issuerId: string
  serviceAccountPath?: string
}

export interface GoogleTextField {
  header?: string
  body?: string
}

export interface GooglePassClass {
  id: string
  issuerName: string
  reviewStatus?: string
}

export interface GooglePassObject {
  id: string
  classId: string
  state?: string
  locations?: GeoLocation[]
  linksModuleData?: {
    uris: Array<{
      uri: string
      description?: string
      id?: string
    }>
  }
  imageModulesData?: Array<{
    mainImage: {
      sourceUri: {
        uri: string
      }
    }
  }>
  messages?: Array<{
    id: string
    header: string
    body: string
    messageType?: string
  }>
  barcode?: {
    type: string
    value: string
  }
  cardTitle?: GoogleTextField
  header?: GoogleTextField
  textModulesData?: Array<{
    header: string
    body: string
    id: string
  }>
  heroImage?: {
    sourceUri: {
      uri: string
    }
  }
  hexBackgroundColor?: string
}

// Profile configuration
export interface ProfileFieldMap {
  parent: Record<string, { label: string; key: string }>
  child: Record<string, { label: string; key: string }>
}

export interface ProfileConfig {
  name: ProfileType
  fieldMap: ProfileFieldMap
  statusFlow: PassStatus[]
  defaultTemplates: {
    apple: {
      parent: Partial<ApplePassTemplate>
      child: Partial<ApplePassTemplate>
    }
    google: {
      parentClass: Partial<GooglePassClass>
      parentObject: Partial<GooglePassObject>
      childObject: Partial<GooglePassObject>
    }
  }
}

// Pass generation result
export interface PassGenerationResult {
  passData: PassData
  applePkpass?: Buffer
  googleSaveUrl?: string
  googleObject?: GooglePassObject
}
