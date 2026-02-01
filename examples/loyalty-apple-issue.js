import 'dotenv/config'

import {
  createBusiness,
  createCustomerAccount,
  createLoyaltyProgram,
  issueLoyaltyCard,
  getPkpassBuffer
} from '../dist/index.js'

import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

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
  // Check required Apple Wallet credentials
  const teamId = optionalEnv('APPLE_TEAM_ID')
  const passTypeId = optionalEnv('APPLE_PASS_TYPE_ID')
  const certPath = optionalEnv('APPLE_CERT_PATH')
  const certPassword = optionalEnv('APPLE_CERT_PASSWORD')
  const wwdrPath = optionalEnv('APPLE_WWDR_PATH')

  console.log('🍎 Apple Wallet Loyalty issuance (sbcwallet)')
  console.log('Team ID:', teamId || '(not set)')
  console.log('Pass Type ID:', passTypeId || '(not set)')
  console.log('Certificate Path:', certPath || '(not set)')
  console.log('WWDR Path:', wwdrPath || '(not set)')

  if (!teamId) {
    console.warn('⚠️  APPLE_TEAM_ID not set; .pkpass file will not be generated')
  }
  if (!passTypeId) {
    console.warn('⚠️  APPLE_PASS_TYPE_ID not set; .pkpass file will not be generated')
  }
  if (!certPath) {
    console.warn('⚠️  APPLE_CERT_PATH not set; .pkpass file will not be generated')
  }
  if (!wwdrPath) {
    console.warn('⚠️  APPLE_WWDR_PATH not set; .pkpass file will not be generated')
  }

  const hasAppleCreds = teamId && passTypeId && certPath && wwdrPath

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

  console.log('\n✅ Business created:', business.id)
  console.log('   Name:', business.name)
  console.log('   Program:', business.programName)

  const program = await createLoyaltyProgram({
    businessId: business.id,
    site: process.env.LOYALTY_SITE || 'Downtown Branch',
    countryCode: process.env.LOYALTY_COUNTRY_CODE || 'IR',
    homepageUrl: process.env.LOYALTY_HOMEPAGE_URL || 'https://example.com',
    locations,
    metadata: {
      appleWallet: {
        backgroundColor: process.env.LOYALTY_BG || '#111827',
        foregroundColor: process.env.LOYALTY_FG || '#ffffff',
        labelColor: process.env.LOYALTY_LABEL || '#b4b4b4'
      }
    }
  })

  console.log('\n✅ Loyalty program created:', program.id)

  // 2) Create a customer + issue card
  const customer = createCustomerAccount({
    businessId: business.id,
    fullName: process.env.LOYALTY_CUSTOMER_NAME || 'Milad Test'
  })

  console.log('\n✅ Customer account created:', customer.id)
  console.log('   Name:', customer.fullName)
  console.log('   Member ID:', customer.memberId)

  const card = await issueLoyaltyCard({
    businessId: business.id,
    customerId: customer.id,
    initialPoints: Number(process.env.LOYALTY_INITIAL_POINTS || 10)
  })

  console.log('\n✅ Loyalty card issued:', card.id)
  console.log('   Points:', card.points)

  // 3) Generate Apple .pkpass file
  if (hasAppleCreds) {
    try {
      const pkpassBuffer = await getPkpassBuffer('child', card)
      
      // Create output directory if not exists
      const outputDir = path.join(process.cwd(), 'output')
      if (!existsSync(outputDir)) {
        await mkdir(outputDir, { recursive: true })
      }

      // Save .pkpass file
      const filename = `${card.id}.pkpass`
      const filepath = path.join(outputDir, filename)
      await writeFile(filepath, pkpassBuffer)

      console.log('\n📱 Apple Wallet Pass generated!')
      console.log('   File:', filepath)
      console.log('   Size:', `${(pkpassBuffer.length / 1024).toFixed(2)} KB`)
      console.log('\n💡 To install on iPhone/iPad:')
      console.log('   1. Transfer the .pkpass file to your device')
      console.log('   2. Open the file - it will prompt to add to Wallet')
      console.log('   3. Or serve it via HTTP with Content-Type: application/vnd.apple.pkpass')
    } catch (err) {
      console.error('\n❌ Failed to generate .pkpass:', err.message)
      if (err.stack) {
        console.error(err.stack)
      }
    }
  } else {
    console.log('\n⚠️  Apple Wallet credentials not configured')
    console.log('   Set these environment variables to generate .pkpass files:')
    console.log('   - APPLE_TEAM_ID: Your Apple Developer Team ID')
    console.log('   - APPLE_PASS_TYPE_ID: Your Pass Type Identifier (e.g., pass.com.yourcompany.loyalty)')
    console.log('   - APPLE_CERT_PATH: Path to your .p12 or .pem certificate')
    console.log('   - APPLE_CERT_PASSWORD: Certificate password (if any)')
    console.log('   - APPLE_WWDR_PATH: Path to Apple WWDR certificate')
  }

  // 4) Display pass details
  console.log('\n📋 Pass Details:')
  console.log('   ID:', card.id)
  console.log('   Type:', card.type)
  console.log('   Status:', card.status)
  console.log('   Member ID:', card.memberId)
  console.log('   Points:', card.points)
  console.log('   Business:', business.name)
  console.log('   Program:', business.programName)
  console.log('   Customer:', customer.fullName)
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
