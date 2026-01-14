import { createParentSchedule, createChildTicket, getGoogleObject } from './dist/index.js'
import 'dotenv/config'

async function testGoogleWallet() {
  console.log('🧪 Testing Google Wallet Pass Generation\n')

  // Verify environment variables
  if (!process.env.GOOGLE_ISSUER_ID) {
    console.error('❌ GOOGLE_ISSUER_ID not set in .env file')
    console.log('\nPlease add to .env:')
    console.log('GOOGLE_ISSUER_ID=your_issuer_id_here')
    process.exit(1)
  }

  if (!process.env.GOOGLE_SA_JSON) {
    console.error('❌ GOOGLE_SA_JSON not set in .env file')
    console.log('\nReal device testing requires a Google service account JSON key:')
    console.log('GOOGLE_SA_JSON=./certs/google-credentials.json')
    console.log('\nWithout this, the Save URL will be unsigned and Google Wallet will not accept it.')
    process.exit(1)
  }

  console.log('✅ Issuer ID found:', process.env.GOOGLE_ISSUER_ID)

  // Create parent
  const parent = await createParentSchedule({
    profile: 'logistics',
    programName: 'Test Yard Veracruz',
    site: 'Patio Gate 3',
    window: {
      from: '2025-10-20T08:00:00-06:00',
      to: '2025-10-20T12:00:00-06:00',
      tz: 'America/Mexico_City'
    }
  })

  console.log('\n✅ Parent created:', parent.id)
  console.log('   Program:', parent.programName)
  console.log('   Site:', parent.site)

  // Create child
  const child = await createChildTicket({
    profile: 'logistics',
    parentId: parent.id,
    plate: 'TEST123',
    carrier: 'Test Transport',
    client: 'Test Client'
  })

  console.log('\n✅ Child created:', child.id)
  console.log('   Plate:', child.plate)
  console.log('   Carrier:', child.carrier)

  // Generate Google Wallet object
  try {
    const { object, saveUrl } = await getGoogleObject('child', child)

    console.log('\n' + '='.repeat(60))
    console.log('✅ GOOGLE WALLET OBJECT GENERATED!')
    console.log('='.repeat(60))

    console.log('\n📋 Object Details:')
    console.log(JSON.stringify(object, null, 2))

    console.log('\n' + '='.repeat(60))
    console.log('🔗 SAVE TO WALLET URL:')
    console.log('='.repeat(60))
    console.log(saveUrl)

    const looksSigned = saveUrl.includes('/eyJ')
    if (!looksSigned) {
      console.log('\n⚠️  Save URL does not look like a signed JWT.')
      console.log('   Ensure GOOGLE_SA_JSON points to a valid service account JSON file.')
    }

    console.log('\n' + '='.repeat(60))
    console.log('📱 TO TEST ON YOUR DEVICE:')
    console.log('='.repeat(60))
    console.log('1. Copy the Save URL above')
    console.log('2. Open it on your Android phone or any browser')
    console.log('3. Click "Save to Google Wallet"')
    console.log('4. Pass will appear in your Google Wallet app!')

    console.log('\n' + '='.repeat(60))
    console.log('🎉 SUCCESS!')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('\n❌ Error generating pass:', error)
    throw error
  }
}

testGoogleWallet().catch(console.error)
