# sbcwallet

Unified wallet-pass SDK for Apple Wallet (.pkpass) and Google Wallet.

## Features

### Supported Pass Types

| Pass Type | Apple Wallet | Google Wallet |
|-----------|--------------|---------------|
| Boarding Pass | ✅ boardingPass | ✅ flight, transit |
| Event Ticket | ✅ eventTicket | ✅ eventTicket |
| Store Card / Loyalty | ✅ storeCard | ✅ loyalty |
| Coupon | ✅ coupon | ✅ offer |
| Gift Card | ✅ storeCard | ✅ giftCard |
| Transit Pass | ✅ boardingPass | ✅ transit |
| Generic Pass | ✅ generic | ✅ generic |

## Installation

```sh
npm install sbcwallet
```

## Configuration

### Environment Variables

```bash
# Google Wallet Configuration
GOOGLE_ISSUER_ID=your-issuer-id
GOOGLE_SA_JSON=/path/to/credentials.json

# Apple Wallet Configuration
APPLE_TEAM_ID=YOUR_TEAM_ID
APPLE_PASS_TYPE_ID=pass.com.example.app
APPLE_CERT_PATH=/path/to/certificate.p12
APPLE_CERT_PASSWORD=your-password
APPLE_WWDR_PATH=/path/to/wwdr.pem
```

For detailed setup instructions:
- Apple Wallet: [APPLE_WALLET_SETUP.md](APPLE_WALLET_SETUP.md)
- Google Wallet: [GOOGLE_WALLET_SETUP.md](GOOGLE_WALLET_SETUP.md)

---

## Quick Start

### 1. Boarding Pass

```ts
import { createBoardingPass } from 'sbcwallet'

const boardingPass = await createBoardingPass({
  serialNumber: 'FLIGHT-2026-001',
  description: 'Flight from Tehran to Muscat',
  
  flight: {
    flightNumber: 'W5-1234',
    departureAirport: 'IKA',
    departureCity: 'Tehran',
    arrivalAirport: 'MCT',
    arrivalCity: 'Muscat',
    departureTime: '2026-02-15T10:30:00Z',
    arrivalTime: '2026-02-15T12:30:00Z',
    boardingTime: '2026-02-15T09:45:00Z',
    gate: 'A12',
    terminal: 'Terminal 1'
  },
  
  passenger: {
    name: 'Ali Mohammadi',
    seat: '12A',
    class: 'Economy',
    boardingGroup: 'A',
    confirmationCode: 'ABC123'
  },
  
  airline: {
    name: 'Mahan Air',
    logoUrl: 'https://example.com/mahan-logo.png'
  },
  
  style: {
    backgroundColor: '#003366',
    foregroundColor: '#FFFFFF',
    labelColor: '#CCCCCC'
  },
  
  barcode: {
    type: 'QR',
    message: 'M1MOHAMMADI/ALI  EABC123 IKAMCTW5 1234 050Y012A0001 100'
  }
})

// Get Google Wallet Save URL
console.log('Google Save URL:', boardingPass.google?.saveUrl)

// Save Apple Wallet file
import { writeFile } from 'node:fs/promises'
if (boardingPass.apple?.pkpassBuffer) {
  await writeFile('boarding-pass.pkpass', boardingPass.apple.pkpassBuffer)
}
```

### 2. Event Ticket

```ts
import { createEventTicket } from 'sbcwallet'

const eventTicket = await createEventTicket({
  serialNumber: 'EVENT-2026-001',
  description: 'Traditional Music Concert',
  
  event: {
    name: 'Traditional Persian Music Concert',
    startDate: '2026-03-21T19:00:00Z',
    endDate: '2026-03-21T22:00:00Z',
    venue: {
      name: 'Vahdat Hall',
      address: 'Tehran, Hafez Street',
      latitude: 35.6892,
      longitude: 51.3890
    }
  },
  
  ticket: {
    section: 'VIP',
    row: 'A',
    seat: '15',
    ticketType: 'General Admission',
    ticketNumber: 'TKT-001234'
  },
  
  attendee: {
    name: 'Sara Ahmadi'
  },
  
  style: {
    backgroundColor: '#8B0000',
    foregroundColor: '#FFFFFF'
  },
  
  barcode: {
    type: 'QR',
    message: 'EVENT-2026-001-TKT-001234'
  }
})
```

### 3. Store Card / Loyalty Card

```ts
import { createStoreCard } from 'sbcwallet'

const storeCard = await createStoreCard({
  serialNumber: 'LOYALTY-001',
  description: 'X Cafe Loyalty Card',
  
  program: {
    name: 'X Rewards',
    issuerName: 'X Cafe',
    logoUrl: 'https://example.com/xcafe-logo.png'
  },
  
  member: {
    name: 'Mohammad Rezaei',
    memberId: 'MEM-123456',
    tier: 'Gold'
  },
  
  balance: {
    points: 1250,
    pointsLabel: 'Points',
    secondaryBalance: 50000,
    secondaryBalanceLabel: 'Credit'
  },
  
  style: {
    backgroundColor: '#111827',
    foregroundColor: '#F9FAFB',
    labelColor: '#9CA3AF'
  },
  
  barcode: {
    type: 'QR',
    message: 'MEM-123456'
  }
})
```

### 4. Coupon

```ts
import { createCoupon } from 'sbcwallet'

const coupon = await createCoupon({
  serialNumber: 'COUPON-001',
  description: '20% Off Purchase',
  
  offer: {
    title: '20% Special Discount',
    description: '20% off on all products',
    discountAmount: '20%',
    promoCode: 'SAVE20',
    issuerName: 'X Store',
    logoUrl: 'https://example.com/store-logo.png'
  },
  
  validity: {
    startDate: '2026-01-01T00:00:00Z',
    expirationDate: '2026-03-31T23:59:59Z'
  },
  
  terms: 'Minimum purchase $50. Cannot be combined with other offers.',
  
  style: {
    backgroundColor: '#DC2626',
    foregroundColor: '#FFFFFF'
  },
  
  barcode: {
    type: 'QR',
    message: 'COUPON-SAVE20-001'
  }
})
```

### 5. Gift Card

```ts
import { createGiftCard } from 'sbcwallet'

const giftCard = await createGiftCard({
  serialNumber: 'GIFT-001',
  description: '$500 Gift Card',
  
  card: {
    cardNumber: 'GIFT-1234-5678-9012',
    pin: '1234',
    initialBalance: 500,
    currentBalance: 500,
    currencyCode: 'USD',
    issuerName: 'Big Store',
    logoUrl: 'https://example.com/logo.png'
  },
  
  validity: {
    expirationDate: '2027-01-31T23:59:59Z'
  },
  
  recipient: {
    name: 'Dear Friend',
    message: 'Happy Birthday! 🎂'
  },
  
  style: {
    backgroundColor: '#7C3AED',
    foregroundColor: '#FFFFFF'
  },
  
  barcode: {
    type: 'QR',
    message: 'GIFT-1234-5678-9012'
  }
})
```

### 6. Transit Pass

```ts
import { createTransitPass } from 'sbcwallet'

const transitPass = await createTransitPass({
  serialNumber: 'TRANSIT-001',
  description: 'Metro Ticket',
  
  trip: {
    departureStation: 'Central Station',
    arrivalStation: 'Airport',
    departureTime: '2026-02-15T08:30:00Z',
    transitType: 'metro', // metro, bus, train, ferry, tram
    lineNumber: 'Line 1',
    vehicleNumber: 'Train 123'
  },
  
  ticket: {
    ticketNumber: 'MTR-001234',
    ticketType: 'Single Ride',
    validFrom: '2026-02-15T00:00:00Z',
    validUntil: '2026-02-15T23:59:59Z',
    zones: ['Zone 1', 'Zone 2']
  },
  
  passenger: {
    name: 'Reza Karimi'
  },
  
  operator: {
    name: 'Metro Transit',
    logoUrl: 'https://example.com/metro-logo.png'
  },
  
  style: {
    backgroundColor: '#0891B2',
    foregroundColor: '#FFFFFF'
  },
  
  barcode: {
    type: 'QR',
    message: 'MTR-001234'
  }
})
```

### 7. Generic Pass

```ts
import { createGenericPass } from 'sbcwallet'

const genericPass = await createGenericPass({
  serialNumber: 'GENERIC-001',
  description: 'Gym Membership Card',
  
  header: 'Fitness Club',
  primaryText: 'John Smith',
  secondaryText: 'Gold Membership',
  
  auxiliaryFields: [
    { label: 'Member ID', value: 'MEM-789456' },
    { label: 'Join Date', value: '2025-06-01' }
  ],
  
  backFields: [
    { label: 'Address', value: '123 Main Street, City' },
    { label: 'Phone', value: '+1-234-567-8900' },
    { label: 'Hours', value: 'Mon-Fri: 6AM - 11PM' }
  ],
  
  images: {
    logoUrl: 'https://example.com/gym-logo.png',
    heroImageUrl: 'https://example.com/gym-hero.jpg'
  },
  
  style: {
    backgroundColor: '#065F46',
    foregroundColor: '#FFFFFF'
  },
  
  barcode: {
    type: 'QR',
    message: 'MEMBER-789456'
  }
})
```

---

## Unified API

For more flexibility, you can use the generic `createWalletPass` function:

```ts
import { createWalletPass } from 'sbcwallet'

// Create any pass type by specifying passType
const pass = await createWalletPass({
  passType: 'eventTicket',
  // ... other parameters based on pass type
})
```

### Pass Management

```ts
import {
  getWalletPass,
  listWalletPasses,
  updateWalletPassStatus,
  updateLoyaltyBalance,
  updateGiftCardBalance,
  sendPassNotification,
  regeneratePass
} from 'sbcwallet'

// Get pass by ID
const pass = await getWalletPass('PASS-123')

// List passes for a user
const userPasses = await listWalletPasses({ userId: 'USER-001' })

// Update pass status (e.g., for cancelled event)
await updateWalletPassStatus('PASS-123', 'cancelled')

// Update loyalty card points
await updateLoyaltyBalance('LOYALTY-001', {
  pointsDelta: 100,
  newTier: 'Platinum'
})

// Update gift card balance
await updateGiftCardBalance('GIFT-001', {
  newBalance: 350
})

// Send notification to pass (Google Wallet)
await sendPassNotification('PASS-123', {
  header: 'Reminder',
  body: 'Your event is tomorrow!'
})

// Regenerate pass after updates
const updatedPass = await regeneratePass('PASS-123')
```

---

## Multi-tenant Loyalty

For complex scenarios like multi-business platforms:

### Define a Business

```ts
import { createBusiness, createLoyaltyProgram } from 'sbcwallet'

const biz = createBusiness({
  name: 'X Cafe',
  programName: 'X Rewards',
  pointsLabel: 'Points',
  wallet: {
    googleWallet: {
      issuerName: 'X Cafe',
      backgroundColor: '#111827',
      logoUrl: 'https://example.com/logo.png',
      classOverrides: {
        reviewStatus: 'UNDER_REVIEW'
      }
    },
    appleWallet: {
      organizationName: 'X Cafe',
      logoText: 'X',
      backgroundColor: 'rgb(17, 24, 39)',
      passOverrides: {
        userInfo: { tenant: 'x' }
      }
    }
  }
})

await createLoyaltyProgram({
  businessId: biz.id,
  locations: [
    { latitude: 35.6892, longitude: 51.389 },
    { latitude: 35.7, longitude: 51.4 }
  ],
  relevantText: 'Welcome back — show this card at checkout',
  countryCode: 'OM',
  homepageUrl: 'https://example.com'
})
```

### Issue a Card

```ts
import {
  createCustomerAccount,
  issueLoyaltyCard,
  updateLoyaltyPoints,
  getGoogleObject,
  getPkpassBuffer
} from 'sbcwallet'

const customer = createCustomerAccount({
  businessId: biz.id,
  fullName: 'Alice',
  memberId: 'USER-123'
})

const card = await issueLoyaltyCard({
  businessId: biz.id,
  customerId: customer.id,
  initialPoints: 10
})

// Update points
await updateLoyaltyPoints({ cardId: card.id, delta: 5 })

// Get Google Wallet Save URL
const { saveUrl } = await getGoogleObject('child', card)
console.log(saveUrl)

// Save Apple Wallet file
const pkpass = await getPkpassBuffer('child', card)
await writeFile('loyalty.pkpass', pkpass)
```

---

## Location-based Features

### Lock Screen Surfacing

```ts
// Apple Wallet: Auto-display when user is near location
createBusiness({
  wallet: {
    appleWallet: {
      passOverrides: {
        locations: [
          { latitude: 35.6892, longitude: 51.389 }
        ],
        relevantText: 'Welcome — show this card at checkout'
      }
    }
  }
})
```

### Push Notifications

```ts
import { pushLoyaltyMessage } from 'sbcwallet'

// Google Wallet: Send message to pass
await pushLoyaltyMessage({
  cardId: card.id,
  header: 'X Cafe',
  body: 'You are nearby — show this card to earn points.',
  messageType: 'TEXT_AND_NOTIFY'
})
```

---

## Demo Servers

### Google Wallet

```sh
# Multi-tenant loyalty server
npm run loyalty:server:multi
# Open http://localhost:5190

# Simple loyalty server
npm run loyalty:server
# Open http://localhost:5189

# Google Wallet issuance (CLI)
node examples/loyalty-google-issue.js
```

### Apple Wallet

```sh
# Apple Wallet server with web UI
node examples/loyalty-apple-server.js
# Open http://localhost:3001

# Apple Wallet issuance (CLI)
node examples/loyalty-apple-issue.js
```

#### Required Environment Variables for Apple Wallet

```bash
# Apple Developer credentials
APPLE_TEAM_ID=YOUR_TEAM_ID           # Your Apple Developer Team ID
APPLE_PASS_TYPE_ID=pass.com.x.y      # Your Pass Type Identifier
APPLE_CERT_PATH=/path/to/cert.p12    # Path to signing certificate
APPLE_CERT_PASSWORD=password         # Certificate password (if any)
APPLE_WWDR_PATH=/path/to/wwdr.pem    # Apple WWDR certificate

# Optional customization
LOYALTY_BUSINESS_NAME=SBC Coffee
LOYALTY_PROGRAM_NAME=SBC Rewards
LOYALTY_CUSTOMER_NAME=John Doe
LOYALTY_INITIAL_POINTS=10
LOYALTY_BG=#111827
```

---

## TypeScript Support

This SDK is fully written in TypeScript with complete type definitions:

```ts
import type {
  // Pass types
  ApplePassType,
  GooglePassType,
  
  // Pass inputs
  BoardingPassInput,
  EventTicketInput,
  StoreCardInput,
  CouponInput,
  GiftCardInput,
  TransitPassInput,
  GenericPassInput,
  WalletPassInput,
  
  // Pass data
  WalletPassData,
  PassGenerationOptions,
  
  // Statuses
  EventStatus,
  FlightStatus,
  TransitStatus,
  OfferStatus,
  GiftCardStatus
} from 'sbcwallet'
```

---

## Development

```sh
# Install dependencies
npm install

# Build project
npm run build

# Run tests
npm test

# Check package before publishing
npm pack --dry-run
```

---

## API Reference

### Pass Creation Functions

| Function | Description |
|----------|-------------|
| `createBoardingPass(input)` | Create flight/transit boarding pass |
| `createEventTicket(input)` | Create event ticket |
| `createStoreCard(input)` | Create loyalty/store card |
| `createCoupon(input)` | Create discount coupon |
| `createGiftCard(input)` | Create gift card |
| `createTransitPass(input)` | Create transit pass |
| `createGenericPass(input)` | Create generic pass |
| `createWalletPass(input)` | Create any pass type |

### Pass Management Functions

| Function | Description |
|----------|-------------|
| `getWalletPass(id)` | Get pass by ID |
| `listWalletPasses(filter)` | List passes |
| `updateWalletPassStatus(id, status)` | Update pass status |
| `updateLoyaltyBalance(id, data)` | Update loyalty points |
| `updateGiftCardBalance(id, data)` | Update gift card balance |
| `sendPassNotification(id, message)` | Send notification |
| `regeneratePass(id)` | Regenerate pass |

### Loyalty Functions

| Function | Description |
|----------|-------------|
| `createBusiness(config)` | Define a business |
| `createLoyaltyProgram(config)` | Create loyalty program |
| `createCustomerAccount(data)` | Create customer account |
| `issueLoyaltyCard(data)` | Issue loyalty card |
| `updateLoyaltyPoints(data)` | Update points |
| `pushLoyaltyMessage(data)` | Send message |

### Apple Wallet Functions

| Function | Description |
|----------|-------------|
| `getPkpassBuffer(type, card)` | Get pkpass file buffer |

### Google Wallet Functions

| Function | Description |
|----------|-------------|
| `getGoogleObject(type, card)` | Get Save URL |

---

## License

MIT License - See [LICENSE](LICENSE) for details.
