// Main exports (Legacy API)
export {
  createParentSchedule,
  createChildTicket,
  updatePassStatus,
  createBusiness,
  getBusiness,
  createCustomerAccount,
  getCustomerAccount,
  createLoyaltyProgram,
  issueLoyaltyCard,
  updateLoyaltyPoints,
  pushLoyaltyMessage,
  getPkpassBuffer,
  getGoogleObject,
  listProfiles,
  getProfile,
  getPass,
  generatePass
} from './api/unified.js'

// New Wallet Pass API (All Pass Types)
export {
  // Pass Creation
  createBoardingPass,
  createEventTicket,
  createStoreCard,
  createCoupon,
  createGiftCard,
  createTransitPass,
  createGenericPass,
  createWalletPass,
  // Pass Retrieval
  getWalletPass,
  listWalletPasses,
  // Pass Updates
  updateWalletPassStatus,
  updateLoyaltyBalance,
  updateGiftCardBalance,
  sendPassNotification,
  regeneratePass
} from './api/wallet-pass.js'

// Adapter exports (Legacy)
export { AppleWalletAdapter } from './adapters/apple.js'
export { GoogleWalletAdapter } from './adapters/google.js'

// New Multi-Pass Adapters
export { AppleWalletMultiAdapter } from './adapters/apple-wallet.js'
export { GoogleWalletMultiAdapter } from './adapters/google-wallet.js'

// Profile exports
export { default as logisticsProfile } from './profiles/logistics/index.js'
export { default as healthcareProfile } from './profiles/healthcare/index.js'
export { default as loyaltyProfile } from './profiles/loyalty/index.js'

// Type exports
export type {
  // Pass Types
  ApplePassType,
  GooglePassType,
  AppleTransitType,
  GoogleTransitType,
  // Status Types
  ProfileType,
  PassStatus,
  LogisticsStatus,
  HealthcareStatus,
  LoyaltyStatus,
  EventStatus,
  FlightStatus,
  TransitStatus,
  OfferStatus,
  GiftCardStatus,
  // Common Types
  GeoLocation,
  TimeWindow,
  // Legacy Pass Data
  BasePassData,
  ParentPassData,
  ChildPassData,
  PassData,
  CreateParentInput,
  CreateChildInput,
  // Loyalty Types
  LoyaltyBusiness,
  LoyaltyCustomerAccount,
  CreateBusinessInput,
  CreateCustomerAccountInput,
  CreateLoyaltyProgramInput,
  IssueLoyaltyCardInput,
  UpdateLoyaltyPointsInput,
  PushLoyaltyMessageInput,
  // Apple Wallet Types
  ApplePassConfig,
  ApplePassField,
  ApplePassTemplate,
  // Google Wallet Types
  GooglePassConfig,
  GoogleTextField,
  GooglePassClass,
  GooglePassObject,
  // Profile Types
  ProfileFieldMap,
  ProfileConfig,
  PassGenerationResult,
  // New Pass Input Types
  BoardingPassInput,
  EventTicketInput,
  StoreCardInput,
  CouponInput,
  GiftCardInput,
  TransitPassInput,
  GenericPassInput,
  WalletPassInput,
  WalletPassData,
  PassGenerationOptions
} from './types.js'

// Schema exports
export {
  // Legacy Schemas
  CreateParentInputSchema,
  CreateChildInputSchema,
  TimeWindowSchema,
  CreateBusinessInputSchema,
  CreateCustomerAccountInputSchema,
  CreateLoyaltyProgramInputSchema,
  IssueLoyaltyCardInputSchema,
  UpdateLoyaltyPointsInputSchema,
  PushLoyaltyMessageInputSchema,
  // New Pass Schemas
  BoardingPassInputSchema,
  EventTicketInputSchema,
  StoreCardInputSchema,
  CouponInputSchema,
  GiftCardInputSchema,
  TransitPassInputSchema,
  GenericPassInputSchema,
  WalletPassInputSchema
} from './types.js'
