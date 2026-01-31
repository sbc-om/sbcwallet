import { z } from 'zod'

// ===========================================
// PASS TYPES - Apple & Google Wallet
// ===========================================

// Apple Wallet Pass Types
export type ApplePassType = 
  | 'boardingPass'
  | 'eventTicket'
  | 'storeCard'
  | 'coupon'
  | 'generic'

// Google Wallet Pass Types
export type GooglePassType =
  | 'loyalty'        // LoyaltyObject
  | 'giftCard'       // GiftCardObject
  | 'offer'          // OfferObject
  | 'eventTicket'    // EventTicketObject
  | 'flight'         // FlightObject
  | 'transit'        // TransitObject
  | 'generic'        // GenericObject

// Boarding Pass Transit Types (Apple)
export type AppleTransitType =
  | 'PKTransitTypeAir'
  | 'PKTransitTypeBoat'
  | 'PKTransitTypeBus'
  | 'PKTransitTypeTrain'
  | 'PKTransitTypeGeneric'

// Transit Types (Google)
export type GoogleTransitType =
  | 'BUS'
  | 'RAIL'
  | 'TRAM'
  | 'FERRY'
  | 'OTHER'

// Profile types
export type ProfileType = 'logistics' | 'healthcare' | 'loyalty'

// Status types
export type LogisticsStatus = 'ISSUED' | 'PRESENCE' | 'SCALE' | 'OPS' | 'EXITED'
export type HealthcareStatus = 'SCHEDULED' | 'CHECKIN' | 'PROCEDURE' | 'DISCHARGED'
export type LoyaltyStatus = 'ACTIVE' | 'SUSPENDED'
export type EventStatus = 'VALID' | 'USED' | 'EXPIRED' | 'CANCELLED'
export type FlightStatus = 'SCHEDULED' | 'BOARDING' | 'DEPARTED' | 'LANDED' | 'CANCELLED' | 'DELAYED'
export type TransitStatus = 'ACTIVE' | 'EXPIRED' | 'USED'
export type OfferStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED'
export type GiftCardStatus = 'ACTIVE' | 'DEPLETED' | 'EXPIRED'
export type PassStatus = LogisticsStatus | HealthcareStatus | LoyaltyStatus | EventStatus | FlightStatus | TransitStatus | OfferStatus | GiftCardStatus

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
  id: z.string().min(1).optional(),
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
  id: z.string().min(1).optional(),
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
  wallet?: {
    googleWallet?: Record<string, any>
    appleWallet?: Record<string, any>
  }
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
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  programName: z.string().min(1).optional(),
  pointsLabel: z.string().min(1).optional(),
  // Per-business theming / design knobs (optional)
  wallet: z.object({
    googleWallet: z.record(z.any()).optional(),
    appleWallet: z.record(z.any()).optional()
  }).optional()
})

export type CreateBusinessInput = z.infer<typeof CreateBusinessInputSchema>

export const CreateCustomerAccountInputSchema = z.object({
  id: z.string().min(1).optional(),
  businessId: z.string().min(1),
  fullName: z.string().min(1),
  memberId: z.string().min(1).optional()
})

export type CreateCustomerAccountInput = z.infer<typeof CreateCustomerAccountInputSchema>

export const CreateLoyaltyProgramInputSchema = z.object({
  programId: z.string().min(1).optional(),
  businessId: z.string().min(1),
  // Optional overrides
  programName: z.string().min(1).optional(),
  site: z.string().optional(),
  // Google Wallet geo-fence locations (latitude/longitude pairs)
  locations: z.array(z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })).optional(),
  // Apple Wallet: text shown when the pass becomes relevant (e.g., near a location)
  relevantText: z.string().min(1).optional(),
  countryCode: z.string().length(2).optional(),
  homepageUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional()
})

export type CreateLoyaltyProgramInput = z.infer<typeof CreateLoyaltyProgramInputSchema>

export const IssueLoyaltyCardInputSchema = z.object({
  cardId: z.string().min(1).optional(),
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

export const PushLoyaltyMessageInputSchema = z.object({
  cardId: z.string().min(1).optional(),
  objectId: z.string().min(1).optional(),
  header: z.string().min(1),
  body: z.string().min(1),
  messageType: z.string().min(1).optional()
}).refine(v => v.cardId !== undefined || v.objectId !== undefined, {
  message: 'Provide either cardId or objectId'
})

export type PushLoyaltyMessageInput = z.infer<typeof PushLoyaltyMessageInputSchema>

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

// ===========================================
// BOARDING PASS TYPES
// ===========================================

export interface BoardingPassInput {
  passType: 'boardingPass'
  transitType: AppleTransitType | GoogleTransitType
  // Passenger info
  passengerName: string
  passengerFirstName?: string
  passengerLastName?: string
  // Flight/Trip info
  carrier: string
  carrierCode?: string
  flightNumber?: string
  tripNumber?: string
  // Origin/Destination
  originCode: string
  originName?: string
  destinationCode: string
  destinationName?: string
  // Timing
  departureDate: string
  departureTime?: string
  arrivalDate?: string
  arrivalTime?: string
  boardingTime?: string
  gateCloses?: string
  // Seat info
  seat?: string
  seatClass?: string
  boardingGroup?: string
  zone?: string
  // Terminal info
  departureTerminal?: string
  arrivalTerminal?: string
  gate?: string
  // Booking
  confirmationCode: string
  eTicketNumber?: string
  // Frequent flyer
  frequentFlyerProgram?: string
  frequentFlyerNumber?: string
  // Optional
  operatingCarrier?: string
  operatingFlightNumber?: string
  metadata?: Record<string, any>
}

export const BoardingPassInputSchema = z.object({
  passType: z.literal('boardingPass'),
  transitType: z.string(),
  passengerName: z.string().min(1),
  passengerFirstName: z.string().optional(),
  passengerLastName: z.string().optional(),
  carrier: z.string().min(1),
  carrierCode: z.string().optional(),
  flightNumber: z.string().optional(),
  tripNumber: z.string().optional(),
  originCode: z.string().min(2).max(4),
  originName: z.string().optional(),
  destinationCode: z.string().min(2).max(4),
  destinationName: z.string().optional(),
  departureDate: z.string(),
  departureTime: z.string().optional(),
  arrivalDate: z.string().optional(),
  arrivalTime: z.string().optional(),
  boardingTime: z.string().optional(),
  gateCloses: z.string().optional(),
  seat: z.string().optional(),
  seatClass: z.string().optional(),
  boardingGroup: z.string().optional(),
  zone: z.string().optional(),
  departureTerminal: z.string().optional(),
  arrivalTerminal: z.string().optional(),
  gate: z.string().optional(),
  confirmationCode: z.string().min(1),
  eTicketNumber: z.string().optional(),
  frequentFlyerProgram: z.string().optional(),
  frequentFlyerNumber: z.string().optional(),
  operatingCarrier: z.string().optional(),
  operatingFlightNumber: z.string().optional(),
  metadata: z.record(z.any()).optional()
})

// ===========================================
// EVENT TICKET TYPES
// ===========================================

export interface EventTicketInput {
  passType: 'eventTicket'
  // Event info
  eventName: string
  eventType?: string
  // Venue info
  venueName: string
  venueAddress?: string
  venueLatitude?: number
  venueLongitude?: number
  // Date/Time
  eventDate: string
  eventTime?: string
  eventEndDate?: string
  eventEndTime?: string
  doorsOpen?: string
  // Ticket info
  ticketHolderName?: string
  ticketNumber: string
  ticketType?: string
  // Seat info
  section?: string
  row?: string
  seat?: string
  gate?: string
  entrance?: string
  // Price
  price?: number
  currency?: string
  // Purchaser
  purchaserName?: string
  purchaserEmail?: string
  // Additional
  eventDetails?: string
  terms?: string
  metadata?: Record<string, any>
}

export const EventTicketInputSchema = z.object({
  passType: z.literal('eventTicket'),
  eventName: z.string().min(1),
  eventType: z.string().optional(),
  venueName: z.string().min(1),
  venueAddress: z.string().optional(),
  venueLatitude: z.number().min(-90).max(90).optional(),
  venueLongitude: z.number().min(-180).max(180).optional(),
  eventDate: z.string(),
  eventTime: z.string().optional(),
  eventEndDate: z.string().optional(),
  eventEndTime: z.string().optional(),
  doorsOpen: z.string().optional(),
  ticketHolderName: z.string().optional(),
  ticketNumber: z.string().min(1),
  ticketType: z.string().optional(),
  section: z.string().optional(),
  row: z.string().optional(),
  seat: z.string().optional(),
  gate: z.string().optional(),
  entrance: z.string().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  purchaserName: z.string().optional(),
  purchaserEmail: z.string().email().optional(),
  eventDetails: z.string().optional(),
  terms: z.string().optional(),
  metadata: z.record(z.any()).optional()
})

// ===========================================
// STORE CARD (LOYALTY) TYPES
// ===========================================

export interface StoreCardInput {
  passType: 'storeCard'
  // Program info
  programName: string
  storeName?: string
  // Member info
  memberName: string
  memberId: string
  // Points/Balance
  points?: number
  pointsLabel?: string
  secondaryPoints?: number
  secondaryPointsLabel?: string
  // Tier
  tier?: string
  tierLabel?: string
  // Expiration
  expirationDate?: string
  // Rewards
  availableRewards?: string
  // Branding
  backgroundColor?: string
  foregroundColor?: string
  logoUrl?: string
  // Contact
  website?: string
  supportPhone?: string
  supportEmail?: string
  terms?: string
  metadata?: Record<string, any>
}

export const StoreCardInputSchema = z.object({
  passType: z.literal('storeCard'),
  programName: z.string().min(1),
  storeName: z.string().optional(),
  memberName: z.string().min(1),
  memberId: z.string().min(1),
  points: z.number().nonnegative().optional(),
  pointsLabel: z.string().optional(),
  secondaryPoints: z.number().nonnegative().optional(),
  secondaryPointsLabel: z.string().optional(),
  tier: z.string().optional(),
  tierLabel: z.string().optional(),
  expirationDate: z.string().optional(),
  availableRewards: z.string().optional(),
  backgroundColor: z.string().optional(),
  foregroundColor: z.string().optional(),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  supportPhone: z.string().optional(),
  supportEmail: z.string().email().optional(),
  terms: z.string().optional(),
  metadata: z.record(z.any()).optional()
})

// ===========================================
// COUPON/OFFER TYPES
// ===========================================

export interface CouponInput {
  passType: 'coupon'
  // Offer info
  offerTitle: string
  offerDescription?: string
  discount: string  // e.g., "25%", "$10", "Buy 1 Get 1"
  // Store info
  storeName: string
  storeLocations?: string[]
  // Code
  promoCode?: string
  // Validity
  validFrom?: string
  validUntil: string
  // Redemption
  redemptionType?: 'ONLINE' | 'INSTORE' | 'BOTH'
  maxRedemptions?: number
  // Terms
  terms?: string
  restrictions?: string
  finePrint?: string
  // Branding
  backgroundColor?: string
  logoUrl?: string
  // Contact
  website?: string
  supportUrl?: string
  metadata?: Record<string, any>
}

export const CouponInputSchema = z.object({
  passType: z.literal('coupon'),
  offerTitle: z.string().min(1),
  offerDescription: z.string().optional(),
  discount: z.string().min(1),
  storeName: z.string().min(1),
  storeLocations: z.array(z.string()).optional(),
  promoCode: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string(),
  redemptionType: z.enum(['ONLINE', 'INSTORE', 'BOTH']).optional(),
  maxRedemptions: z.number().positive().optional(),
  terms: z.string().optional(),
  restrictions: z.string().optional(),
  finePrint: z.string().optional(),
  backgroundColor: z.string().optional(),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  supportUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional()
})

// ===========================================
// GIFT CARD TYPES
// ===========================================

export interface GiftCardInput {
  passType: 'giftCard'
  // Card info
  cardNumber: string
  pin?: string
  // Balance
  balance: number
  currency: string
  // Event/Promo
  eventNumber?: string
  // Holder
  cardHolderName?: string
  // Merchant
  merchantName: string
  // Validity
  expirationDate?: string
  // Branding
  backgroundColor?: string
  logoUrl?: string
  // Contact
  website?: string
  balanceCheckUrl?: string
  metadata?: Record<string, any>
}

export const GiftCardInputSchema = z.object({
  passType: z.literal('giftCard'),
  cardNumber: z.string().min(1),
  pin: z.string().optional(),
  balance: z.number().nonnegative(),
  currency: z.string().length(3),
  eventNumber: z.string().optional(),
  cardHolderName: z.string().optional(),
  merchantName: z.string().min(1),
  expirationDate: z.string().optional(),
  backgroundColor: z.string().optional(),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  balanceCheckUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional()
})

// ===========================================
// TRANSIT PASS TYPES
// ===========================================

export interface TransitPassInput {
  passType: 'transit'
  transitType: GoogleTransitType
  // Passenger
  passengerName?: string
  passengerType?: 'ADULT' | 'CHILD' | 'SENIOR' | 'STUDENT'
  // Trip
  tripType?: 'ONE_WAY' | 'ROUND_TRIP'
  // Legs (can have multiple for connections)
  ticketLegs: Array<{
    originCode?: string
    originName: string
    destinationCode?: string
    destinationName: string
    departureDateTime: string
    arrivalDateTime?: string
    transitOperator?: string
    transitLine?: string
    fare?: string
    platform?: string
    zone?: string
    carriage?: string
    seat?: string
    coach?: string
  }>
  // Ticket info
  ticketNumber?: string
  ticketStatus?: TransitStatus
  // Validity
  validFrom?: string
  validUntil?: string
  // Price
  price?: number
  currency?: string
  // Branding
  operatorName?: string
  backgroundColor?: string
  logoUrl?: string
  metadata?: Record<string, any>
}

export const TransitPassInputSchema = z.object({
  passType: z.literal('transit'),
  transitType: z.enum(['BUS', 'RAIL', 'TRAM', 'FERRY', 'OTHER']),
  passengerName: z.string().optional(),
  passengerType: z.enum(['ADULT', 'CHILD', 'SENIOR', 'STUDENT']).optional(),
  tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']).optional(),
  ticketLegs: z.array(z.object({
    originCode: z.string().optional(),
    originName: z.string().min(1),
    destinationCode: z.string().optional(),
    destinationName: z.string().min(1),
    departureDateTime: z.string(),
    arrivalDateTime: z.string().optional(),
    transitOperator: z.string().optional(),
    transitLine: z.string().optional(),
    fare: z.string().optional(),
    platform: z.string().optional(),
    zone: z.string().optional(),
    carriage: z.string().optional(),
    seat: z.string().optional(),
    coach: z.string().optional()
  })).min(1),
  ticketNumber: z.string().optional(),
  ticketStatus: z.enum(['ACTIVE', 'EXPIRED', 'USED']).optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  operatorName: z.string().optional(),
  backgroundColor: z.string().optional(),
  logoUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional()
})

// ===========================================
// GENERIC PASS TYPES
// ===========================================

export interface GenericPassInput {
  passType: 'generic'
  // Title/Header
  cardTitle: string
  header: string
  subheader?: string
  // Main content
  primaryValue?: string
  primaryLabel?: string
  // Custom fields (flexible)
  fields?: Array<{
    key: string
    label: string
    value: string
  }>
  // Barcode
  barcodeValue?: string
  barcodeType?: 'QR_CODE' | 'CODE_128' | 'CODE_39' | 'AZTEC' | 'PDF_417'
  // Links
  links?: Array<{
    url: string
    label: string
  }>
  // Images (Google requires public URLs)
  logoUrl?: string
  heroImageUrl?: string
  // Branding
  backgroundColor?: string
  foregroundColor?: string
  // Back fields (Apple)
  backFields?: Array<{
    key: string
    label: string
    value: string
  }>
  // Locations for notifications
  locations?: GeoLocation[]
  // Valid time
  validFrom?: string
  validUntil?: string
  metadata?: Record<string, any>
}

export const GenericPassInputSchema = z.object({
  passType: z.literal('generic'),
  cardTitle: z.string().min(1),
  header: z.string().min(1),
  subheader: z.string().optional(),
  primaryValue: z.string().optional(),
  primaryLabel: z.string().optional(),
  fields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    value: z.string()
  })).optional(),
  barcodeValue: z.string().optional(),
  barcodeType: z.enum(['QR_CODE', 'CODE_128', 'CODE_39', 'AZTEC', 'PDF_417']).optional(),
  links: z.array(z.object({
    url: z.string().url(),
    label: z.string()
  })).optional(),
  logoUrl: z.string().url().optional(),
  heroImageUrl: z.string().url().optional(),
  backgroundColor: z.string().optional(),
  foregroundColor: z.string().optional(),
  backFields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    value: z.string()
  })).optional(),
  locations: z.array(z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })).optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  metadata: z.record(z.any()).optional()
})

// ===========================================
// UNIFIED PASS INPUT TYPE
// ===========================================

export type WalletPassInput = 
  | BoardingPassInput
  | EventTicketInput
  | StoreCardInput
  | CouponInput
  | GiftCardInput
  | TransitPassInput
  | GenericPassInput

// Schema discriminated union
export const WalletPassInputSchema = z.discriminatedUnion('passType', [
  BoardingPassInputSchema,
  EventTicketInputSchema,
  StoreCardInputSchema,
  CouponInputSchema,
  GiftCardInputSchema,
  TransitPassInputSchema,
  GenericPassInputSchema
])

// ===========================================
// WALLET PASS DATA (for storage/retrieval)
// ===========================================

export interface WalletPassData {
  id: string
  passType: ApplePassType | GooglePassType
  createdAt: string
  updatedAt: string
  status: PassStatus
  input: WalletPassInput
  // Generated pass info
  applePassTypeId?: string
  googleClassId?: string
  googleObjectId?: string
  // Barcode
  barcodeValue?: string
  // Hash for integrity
  hash?: string
  signature?: string
}

// ===========================================
// PASS GENERATION OPTIONS
// ===========================================

export interface PassGenerationOptions {
  // Target platforms
  platforms?: ('apple' | 'google')[]
  // Apple specific
  applePassTypeId?: string
  appleTeamId?: string
  appleCertPath?: string
  appleCertPassword?: string
  appleWwdrPath?: string
  // Google specific
  googleIssuerId?: string
  googleServiceAccountPath?: string
  googleClassId?: string
  // Generate class (Google only)
  createClass?: boolean
}

