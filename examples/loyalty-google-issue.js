import 'dotenv/config'

import {
  createBusiness,
  createCustomerAccount,
  createLoyaltyProgram,
  issueLoyaltyCard,
  getGoogleObject
} from '../dist/index.js'

function optionalEnv(name) {
  const value = process.env[name]
  return value && String(value).trim() ? String(value).trim() : undefined
}

function parseLocationsFromEnv() {
  // LOYALTY_LOCATIONS="35.6892,51.389;35.7000,51.4000"
  const raw = process.env.LOYALTY_LOCATIONS
  if (!raw) return undefined

  const pairs = raw
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)

  const locations = pairs
    .map(pair => {
      const [latStr, lngStr] = pair.split(',').map(s => s.trim())
      const latitude = Number(latStr)
      const longitude = Number(lngStr)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
      return { latitude, longitude }
    })
    .filter(Boolean)

  return locations.length > 0 ? locations : undefined
}

async function main() {
  const issuerId = optionalEnv('GOOGLE_ISSUER_ID') || 'test-issuer'
  const saPath = optionalEnv('GOOGLE_SA_JSON')
  const logoUrl = optionalEnv('LOYALTY_LOGO_URL')

  console.log('🎫 Google Wallet Loyalty issuance (sbcwallet)')
  console.log('Issuer:', issuerId)
  console.log('Service Account JSON:', saPath || '(not set)')

  if (!optionalEnv('GOOGLE_ISSUER_ID')) {
    console.warn('⚠️  GOOGLE_ISSUER_ID not set; using test issuer (Save URL will not work on device)')
  }
  if (!saPath) {
    console.warn('⚠️  GOOGLE_SA_JSON not set; returning unsigned URL (will not work on device)')
  }
  if (!logoUrl) {
    console.warn('⚠️  LOYALTY_LOGO_URL not set; loyalty class will be created without programLogo')
  }

  const locations = parseLocationsFromEnv() || [
    { latitude: 35.6892, longitude: 51.389 },
    { latitude: 35.7000, longitude: 51.4 }
  ]

  // 1) Create tenant + loyalty program
  const business = createBusiness({
    name: process.env.LOYALTY_BUSINESS_NAME || 'SBC',
    programName: process.env.LOYALTY_PROGRAM_NAME || 'SBC Rewards',
    pointsLabel: process.env.LOYALTY_POINTS_LABEL || 'Points'
  })

  const program = await createLoyaltyProgram({
    businessId: business.id,
    site: process.env.LOYALTY_SITE || 'Downtown Branch',
    countryCode: process.env.LOYALTY_COUNTRY_CODE || 'IR',
    homepageUrl: process.env.LOYALTY_HOMEPAGE_URL || 'https://example.com',
    locations,
    metadata: {
      googleWallet: {
        issuerName: process.env.LOYALTY_ISSUER_NAME || business.name,
        backgroundColor: process.env.LOYALTY_BG || '#111827',
        logoUrl,
        heroImageUrl: process.env.LOYALTY_HERO_URL,
        wordMarkUrl: process.env.LOYALTY_WORDMARK_URL,
        updateRequestUrl: process.env.LOYALTY_UPDATE_REQUEST_URL
      }
    }
  })

  // Ensure loyalty class exists in Google Wallet
  await getGoogleObject('parent', program)

  // 2) Create a customer + issue card
  const customer = createCustomerAccount({
    businessId: business.id,
    fullName: process.env.LOYALTY_CUSTOMER_NAME || 'Milad Test'
  })

  const card = await issueLoyaltyCard({
    businessId: business.id,
    customerId: customer.id,
    initialPoints: Number(process.env.LOYALTY_INITIAL_POINTS || 10)
  })

  const { saveUrl, object } = await getGoogleObject('child', card)

  console.log('\n✅ Loyalty card issued')
  console.log('Member ID (QR):', customer.memberId)
  console.log('Object ID:', object.id)
  console.log('Save URL:', saveUrl)
  console.log('\nOpen the Save URL on your phone to add the card.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
