import {
  createBusiness,
  createCustomerAccount,
  createLoyaltyProgram,
  issueLoyaltyCard,
  updateLoyaltyPoints,
  getGoogleObject
} from '../src/index.js'

async function main() {
  console.log('🎫 sbcwallet Loyalty demo\n')

  // 1) Business defines its loyalty program
  const business = createBusiness({
    name: 'SBC Coffee',
    programName: 'SBC Coffee Rewards',
    pointsLabel: 'Beans'
  })

  const program = await createLoyaltyProgram({
    businessId: business.id,
    site: 'Downtown Branch',
    countryCode: 'IR',
    homepageUrl: 'https://example.com',
    locations: [
      { latitude: 35.6892, longitude: 51.389 },
      { latitude: 35.7000, longitude: 51.4000 }
    ],
    metadata: {
      // Optional Google Wallet class/object customization (public URLs required for images)
      googleWallet: {
        issuerName: 'SBC Coffee',
        backgroundColor: '#111827'
      }
    }
  })

  console.log('✅ Business:', business)
  console.log('✅ Program pass:', program.id)

  // 2) Customer creates an account
  const customer = createCustomerAccount({
    businessId: business.id,
    fullName: 'Milad Test'
  })

  console.log('✅ Customer account:', customer)
  console.log('   (QR/memberId identifier):', customer.memberId)

  // 3) Issue loyalty card (QR identifier + points)
  const card = await issueLoyaltyCard({
    businessId: business.id,
    customerId: customer.id,
    initialPoints: 10
  })

  console.log('✅ Loyalty card issued:', card.id)
  console.log('   Points:', card.points)

  // 4) Update points (simulate purchase)
  const updated = await updateLoyaltyPoints({
    cardId: card.id,
    delta: 25
  })

  console.log('✅ Points updated:', (updated as any).points)

  // 5) Generate Google Wallet object + Save URL (signed only if GOOGLE_SA_JSON is configured)
  const { object, saveUrl } = await getGoogleObject('child', updated as any)
  console.log('\n🔗 Save URL:', saveUrl)
  console.log('📋 Barcode value (QR):', object.barcode?.value)
  console.log('📋 Text modules:', object.textModulesData)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
