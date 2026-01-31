/**
 * Examples: All Wallet Pass Types
 * 
 * This file demonstrates how to create all supported pass types
 * for both Apple Wallet and Google Wallet.
 */

import {
  // Pass creation functions
  createBoardingPass,
  createEventTicket,
  createStoreCard,
  createCoupon,
  createGiftCard,
  createTransitPass,
  createGenericPass,
  // Update functions
  updateLoyaltyBalance,
  updateGiftCardBalance,
  sendPassNotification
} from '../dist/index.js'
import { writeFile } from 'fs/promises'
import 'dotenv/config'

// ================================================
// 1. BOARDING PASS (Flight)
// ================================================
async function exampleBoardingPass() {
  console.log('\n✈️ Creating Boarding Pass...')
  
  const result = await createBoardingPass({
    // Transit type
    transitType: 'PKTransitTypeAir',
    
    // Passenger info
    passengerName: 'John Doe',
    passengerFirstName: 'John',
    passengerLastName: 'Doe',
    
    // Flight info
    carrier: 'American Airlines',
    carrierCode: 'AA',
    flightNumber: '1234',
    
    // Origin/Destination
    originCode: 'MEX',
    originName: 'Mexico City',
    destinationCode: 'LAX',
    destinationName: 'Los Angeles',
    
    // Timing
    departureDate: '2026-02-15',
    departureTime: '08:30',
    arrivalDate: '2026-02-15',
    arrivalTime: '11:45',
    boardingTime: '08:00',
    
    // Seat info
    seat: '12A',
    seatClass: 'Economy',
    boardingGroup: '2',
    
    // Terminal/Gate
    departureTerminal: 'T2',
    gate: 'A32',
    
    // Booking
    confirmationCode: 'ABC123',
    
    // Optional: Frequent flyer
    frequentFlyerProgram: 'AAdvantage',
    frequentFlyerNumber: '1234567890'
  })
  
  console.log('✅ Boarding Pass created:', result.passData.id)
  
  if (result.applePkpass) {
    await writeFile(`${result.passData.id}.pkpass`, result.applePkpass)
    console.log(`   📱 Apple: ${result.passData.id}.pkpass`)
  }
  
  if (result.googleSaveUrl) {
    console.log(`   🤖 Google: ${result.googleSaveUrl.substring(0, 80)}...`)
  }
  
  return result
}

// ================================================
// 2. EVENT TICKET
// ================================================
async function exampleEventTicket() {
  console.log('\n🎫 Creating Event Ticket...')
  
  const result = await createEventTicket({
    // Event info
    eventName: 'Taylor Swift - Eras Tour',
    eventType: 'CONCERT',
    
    // Venue
    venueName: 'SoFi Stadium',
    venueAddress: '1001 Stadium Dr, Inglewood, CA 90301',
    venueLatitude: 33.9534,
    venueLongitude: -118.3390,
    
    // Date/Time
    eventDate: '2026-03-20',
    eventTime: '19:00',
    doorsOpen: '17:30',
    
    // Ticket info
    ticketHolderName: 'Jane Smith',
    ticketNumber: 'TKT-2026-03-20-001234',
    ticketType: 'VIP',
    
    // Seat
    section: 'Floor A',
    row: '5',
    seat: '12',
    gate: 'VIP Entrance',
    
    // Price
    price: 450.00,
    currency: 'USD',
    
    // Purchaser
    purchaserName: 'Jane Smith',
    purchaserEmail: 'jane@example.com',
    
    // Additional
    eventDetails: 'No professional cameras. No outside food or drinks.',
    terms: 'All sales are final. No refunds or exchanges.'
  })
  
  console.log('✅ Event Ticket created:', result.passData.id)
  
  if (result.applePkpass) {
    await writeFile(`${result.passData.id}.pkpass`, result.applePkpass)
    console.log(`   📱 Apple: ${result.passData.id}.pkpass`)
  }
  
  if (result.googleSaveUrl) {
    console.log(`   🤖 Google: ${result.googleSaveUrl.substring(0, 80)}...`)
  }
  
  return result
}

// ================================================
// 3. STORE CARD (Loyalty)
// ================================================
async function exampleStoreCard() {
  console.log('\n💳 Creating Store Card (Loyalty)...')
  
  const result = await createStoreCard({
    // Program info
    programName: 'Coffee Rewards',
    storeName: 'Premium Coffee Co.',
    
    // Member info
    memberName: 'Bob Johnson',
    memberId: 'MEM-2026-001234',
    
    // Points
    points: 2450,
    pointsLabel: 'Points',
    secondaryPoints: 5,
    secondaryPointsLabel: 'Free Drinks',
    
    // Tier
    tier: 'Gold',
    tierLabel: 'Status',
    
    // Validity
    expirationDate: '2027-12-31',
    
    // Rewards
    availableRewards: '1 Free Large Coffee',
    
    // Branding
    backgroundColor: '#1e3a5f',
    
    // Contact
    website: 'https://premiumcoffee.example.com',
    supportEmail: 'rewards@premiumcoffee.example.com',
    terms: 'Points expire after 12 months of inactivity.'
  })
  
  console.log('✅ Store Card created:', result.passData.id)
  
  if (result.applePkpass) {
    await writeFile(`${result.passData.id}.pkpass`, result.applePkpass)
    console.log(`   📱 Apple: ${result.passData.id}.pkpass`)
  }
  
  if (result.googleSaveUrl) {
    console.log(`   🤖 Google: ${result.googleSaveUrl.substring(0, 80)}...`)
  }
  
  return result
}

// ================================================
// 4. COUPON / OFFER
// ================================================
async function exampleCoupon() {
  console.log('\n🏷️ Creating Coupon...')
  
  const result = await createCoupon({
    // Offer info
    offerTitle: 'Spring Sale - All Items',
    offerDescription: 'Get 25% off your entire purchase during our Spring Sale event!',
    discount: '25% OFF',
    
    // Store
    storeName: 'Fashion Outlet',
    storeLocations: ['New York', 'Los Angeles', 'Chicago'],
    
    // Code
    promoCode: 'SPRING25',
    
    // Validity
    validFrom: '2026-03-01',
    validUntil: '2026-03-31',
    
    // Redemption
    redemptionType: 'BOTH',
    
    // Terms
    terms: 'Cannot be combined with other offers.',
    restrictions: 'Excludes clearance items and gift cards.',
    finePrint: 'Offer valid at participating locations only.',
    
    // Branding
    backgroundColor: '#e63946',
    
    // Contact
    website: 'https://fashionoutlet.example.com',
    supportUrl: 'https://fashionoutlet.example.com/help'
  })
  
  console.log('✅ Coupon created:', result.passData.id)
  
  if (result.applePkpass) {
    await writeFile(`${result.passData.id}.pkpass`, result.applePkpass)
    console.log(`   📱 Apple: ${result.passData.id}.pkpass`)
  }
  
  if (result.googleSaveUrl) {
    console.log(`   🤖 Google: ${result.googleSaveUrl.substring(0, 80)}...`)
  }
  
  return result
}

// ================================================
// 5. GIFT CARD
// ================================================
async function exampleGiftCard() {
  console.log('\n🎁 Creating Gift Card...')
  
  const result = await createGiftCard({
    // Card info
    cardNumber: '1234-5678-9012-3456',
    pin: '1234',
    
    // Balance
    balance: 150.00,
    currency: 'USD',
    
    // Holder
    cardHolderName: 'Alice Williams',
    
    // Merchant
    merchantName: 'Tech Store',
    
    // Validity
    expirationDate: '2028-12-31',
    
    // Branding
    backgroundColor: '#2d3748',
    
    // Contact
    website: 'https://techstore.example.com',
    balanceCheckUrl: 'https://techstore.example.com/gift-card/balance'
  })
  
  console.log('✅ Gift Card created:', result.passData.id)
  
  if (result.applePkpass) {
    await writeFile(`${result.passData.id}.pkpass`, result.applePkpass)
    console.log(`   📱 Apple: ${result.passData.id}.pkpass`)
  }
  
  if (result.googleSaveUrl) {
    console.log(`   🤖 Google: ${result.googleSaveUrl.substring(0, 80)}...`)
  }
  
  return result
}

// ================================================
// 6. TRANSIT PASS
// ================================================
async function exampleTransitPass() {
  console.log('\n🚆 Creating Transit Pass...')
  
  const result = await createTransitPass({
    // Transit type
    transitType: 'RAIL',
    
    // Passenger
    passengerName: 'Charlie Brown',
    passengerType: 'ADULT',
    
    // Trip type
    tripType: 'ROUND_TRIP',
    
    // Legs
    ticketLegs: [
      {
        originCode: 'NYP',
        originName: 'New York Penn Station',
        destinationCode: 'WAS',
        destinationName: 'Washington Union Station',
        departureDateTime: '2026-02-20T08:00:00',
        arrivalDateTime: '2026-02-20T11:30:00',
        transitOperator: 'Amtrak',
        transitLine: 'Acela Express',
        fare: 'Business Class',
        platform: '7',
        carriage: 'Coach 3',
        seat: '12A'
      },
      {
        originCode: 'WAS',
        originName: 'Washington Union Station',
        destinationCode: 'NYP',
        destinationName: 'New York Penn Station',
        departureDateTime: '2026-02-22T17:00:00',
        arrivalDateTime: '2026-02-22T20:30:00',
        transitOperator: 'Amtrak',
        transitLine: 'Acela Express',
        fare: 'Business Class'
      }
    ],
    
    // Ticket info
    ticketNumber: 'AMT-2026022001234',
    
    // Validity
    validFrom: '2026-02-20',
    validUntil: '2026-02-22',
    
    // Price
    price: 350.00,
    currency: 'USD',
    
    // Operator
    operatorName: 'Amtrak',
    backgroundColor: '#004b87'
  })
  
  console.log('✅ Transit Pass created:', result.passData.id)
  
  if (result.applePkpass) {
    await writeFile(`${result.passData.id}.pkpass`, result.applePkpass)
    console.log(`   📱 Apple: ${result.passData.id}.pkpass`)
  }
  
  if (result.googleSaveUrl) {
    console.log(`   🤖 Google: ${result.googleSaveUrl.substring(0, 80)}...`)
  }
  
  return result
}

// ================================================
// 7. GENERIC PASS
// ================================================
async function exampleGenericPass() {
  console.log('\n📋 Creating Generic Pass...')
  
  const result = await createGenericPass({
    // Title
    cardTitle: 'Transport Order',
    header: 'TO-2026-01-31-001',
    subheader: 'Yard Veracruz',
    
    // Custom fields
    fields: [
      { key: 'plate', label: 'Plate', value: 'ABC-123' },
      { key: 'carrier', label: 'Carrier', value: 'Fast Transport' },
      { key: 'client', label: 'Client', value: 'ACME Corp' },
      { key: 'status', label: 'Status', value: 'ISSUED' },
      { key: 'window', label: 'Time Window', value: '08:00 - 12:00' }
    ],
    
    // Barcode
    barcodeValue: 'TO-2026-01-31-001',
    barcodeType: 'QR_CODE',
    
    // Links
    links: [
      { url: 'https://example.com/track/TO-2026-01-31-001', label: 'Track Order' }
    ],
    
    // Branding
    backgroundColor: '#4a90e2',
    
    // Back fields (Apple)
    backFields: [
      { key: 'details', label: 'Details', value: 'Container: CONT-123456' },
      { key: 'contact', label: 'Contact', value: 'dispatch@example.com' }
    ],
    
    // Locations
    locations: [
      { latitude: 19.1738, longitude: -96.1342 }  // Veracruz
    ],
    
    // Validity
    validFrom: '2026-01-31',
    validUntil: '2026-01-31'
  })
  
  console.log('✅ Generic Pass created:', result.passData.id)
  
  if (result.applePkpass) {
    await writeFile(`${result.passData.id}.pkpass`, result.applePkpass)
    console.log(`   📱 Apple: ${result.passData.id}.pkpass`)
  }
  
  if (result.googleSaveUrl) {
    console.log(`   🤖 Google: ${result.googleSaveUrl.substring(0, 80)}...`)
  }
  
  return result
}

// ================================================
// UPDATE EXAMPLES
// ================================================
async function exampleUpdates(storeCardId: string, giftCardId: string) {
  console.log('\n📝 Update Examples...')
  
  // Update loyalty points
  console.log('   Updating loyalty points...')
  await updateLoyaltyBalance(storeCardId, 2500)
  console.log('   ✅ Points updated to 2500')
  
  // Update gift card balance
  console.log('   Updating gift card balance...')
  await updateGiftCardBalance(giftCardId, 125.50)
  console.log('   ✅ Balance updated to $125.50')
  
  // Send notification (requires Google credentials)
  try {
    console.log('   Sending notification...')
    await sendPassNotification(storeCardId, {
      header: '🎉 Bonus Points!',
      body: 'You earned 50 bonus points on your last purchase!'
    })
    console.log('   ✅ Notification sent')
  } catch (error) {
    console.log('   ⚠️ Notification skipped (requires Google credentials)')
  }
}

// ================================================
// MAIN
// ================================================
async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  SBC Wallet - All Pass Types Examples')
  console.log('═══════════════════════════════════════════')
  
  try {
    // Create all pass types
    await exampleBoardingPass()
    await exampleEventTicket()
    const storeCard = await exampleStoreCard()
    await exampleCoupon()
    const giftCard = await exampleGiftCard()
    await exampleTransitPass()
    await exampleGenericPass()
    
    // Update examples
    await exampleUpdates(storeCard.passData.id, giftCard.passData.id)
    
    console.log('\n═══════════════════════════════════════════')
    console.log('  ✅ All examples completed!')
    console.log('═══════════════════════════════════════════')
    console.log('\n📱 To test passes:')
    console.log('   - Apple: AirDrop .pkpass files to your iPhone')
    console.log('   - Google: Open the Save URL on an Android device')
    
  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

main()
