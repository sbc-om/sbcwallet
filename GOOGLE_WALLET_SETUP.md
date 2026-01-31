# Google Wallet Setup Guide

Complete guide for setting up Google Wallet pass generation with sbcwallet.

## Prerequisites

- ✅ Google Cloud Account - **FREE** (no purchase required!)
- ✅ Google Pay & Wallet Console access - **FREE**
- ✅ sbcwallet package (already built)

---

## 💰 Cost Comparison

| Platform | Cost | What You Get |
|----------|------|--------------|
| **Apple Wallet** | $99/year | Apple Developer Program membership |
| **Google Wallet** | **FREE** | Full access to Google Wallet API |

**No payment required for Google Wallet!** 🎉

---

## Step 1: Set Up Google Cloud Project

### A. Create Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** → **NEW PROJECT**
3. Fill in:
   - **Project name**: `sbcwallet Pass`
   - **Organization**: (optional)
4. Click **CREATE**

### B. Enable Google Wallet API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "**Google Wallet API**"
3. Click on it → Click **ENABLE**

---

## Step 2: Create Service Account

### A. Create Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **Service account**
3. Fill in:
   - **Service account name**: `sbcwallet-pass-service`
   - **Service account ID**: `sbcwallet-pass-service` (auto-filled)
   - **Description**: Service account for sbcwallet Pass generation
4. Click **CREATE AND CONTINUE**
5. Skip optional steps → Click **DONE**

### B. Create Service Account Key

1. Click on the service account you just created
2. Go to **KEYS** tab
3. Click **ADD KEY** → **Create new key**
4. Choose **JSON** format
5. Click **CREATE**
6. Save the JSON file as: `/Users/przpgo/code/sbcwallet/pass/certs/google-credentials.json`

---

## Step 3: Get Issuer ID

### A. Register for Google Pay & Wallet Console

1. Go to [pay.google.com/business/console](https://pay.google.com/business/console)
2. Sign in with the same Google account
3. If first time:
   - Accept Terms of Service
   - Fill in business information (can use personal info for testing)

### B. Create Issuer Account

1. In Google Pay & Wallet Console, go to **Google Wallet API**
2. Click **Create Issuer Account** (if not already created)
3. Fill in:
   - **Issuer name**: sbcwallet
   - **Contact email**: your@email.com
4. Your **Issuer ID** will be shown (format: `3388000000012345678`)
5. **Save this ID** - you'll need it!

---

## Step 4: Grant Permissions

### A. Add Service Account to Issuer

1. In Google Pay & Wallet Console → **Google Wallet API**
2. Click on your Issuer account
3. Click **Add user** or **Manage users**
4. Add your service account email:
   - Format: `sbcwallet-pass-service@sbcwallet-pass.iam.gserviceaccount.com`
   - Role: **Developer** or **Owner**
5. Click **INVITE**

---

## Step 5: Configure Environment Variables

Create or update your `.env` file:

```bash
cd /Users/przpgo/code/sbcwallet/pass

cat >> .env << 'EOF'

# Google Wallet Configuration
GOOGLE_ISSUER_ID=3388000000012345678
GOOGLE_SA_JSON=./certs/google-credentials.json
EOF
```

Replace `3388000000012345678` with your actual Issuer ID from Step 3.

---

## Step 6: Install Google Auth Library

```bash
npm install google-auth-library
```

---

## Step 7: Test Google Wallet Integration

Create a test script:

```bash
cat > test-google-wallet.ts << 'EOF'
import { createParentSchedule, createChildTicket, getGoogleObject } from './dist/index.js'
import 'dotenv/config'

async function testGoogleWallet() {
  console.log('🧪 Testing Google Wallet Pass Generation\n')

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

  console.log('✅ Parent created:', parent.id)

  // Create child
  const child = await createChildTicket({
    profile: 'logistics',
    parentId: parent.id,
    plate: 'TEST123',
    carrier: 'Test Transport',
    client: 'Test Client'
  })

  console.log('✅ Child created:', child.id)

  // Generate Google Wallet object
  try {
    const { object, saveUrl } = await getGoogleObject('child', child)

    console.log('\n✅ Google Wallet Object Generated!')
    console.log('\n📋 Object Details:')
    console.log(JSON.stringify(object, null, 2))

    console.log('\n🔗 Save URL:')
    console.log(saveUrl)

    console.log('\n📱 To test on Android:')
    console.log('1. Open the Save URL on your Android device')
    console.log('2. Or scan QR code (generate from Save URL)')
    console.log('3. Pass will be added to Google Wallet')
  } catch (error) {
    console.error('❌ Error generating pass:', error)
    throw error
  }
}

testGoogleWallet()
EOF
```

### Run the test:

```bash
npm install dotenv
npx tsc test-google-wallet.ts --module ESNext --target ES2022 --moduleResolution node --esModuleInterop
node test-google-wallet.js
```

Expected output:
```
🧪 Testing Google Wallet Pass Generation

✅ Parent created: PES-2025-10-20-XXXX
✅ Child created: TO-2025-10-20-XXXX-YYYY

✅ Google Wallet Object Generated!

📋 Object Details:
{
  "id": "3388000000012345678.TO-2025-10-20-XXXX-YYYY",
  "classId": "3388000000012345678.logistics_child",
  "state": "ACTIVE",
  "cardTitle": {
    "header": "Transport Order",
    "body": "TEST123"
  },
  ...
}

🔗 Save URL:
https://pay.google.com/gp/v/save/3388000000012345678.TO-2025-10-20-XXXX-YYYY

📱 To test on Android:
1. Open the Save URL on your Android device
2. Or scan QR code (generate from Save URL)
3. Pass will be added to Google Wallet
```

---

## Step 8: Create Generic Pass Class (One-time Setup)

Google Wallet requires creating a "class" before creating individual passes. Create this script:

```typescript
// create-google-class.ts
import { GoogleAuth } from 'google-auth-library'
import 'dotenv/config'

const ISSUER_ID = process.env.GOOGLE_ISSUER_ID!
const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_SA_JSON!

async function createGenericClass() {
  const auth = new GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
  })

  const client = await auth.getClient()
  const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1'

  // Create class for logistics child (Transport Order)
  const classId = `${ISSUER_ID}.logistics_child`
  const classPayload = {
    id: classId,
    issuerName: 'sbcwallet',
    reviewStatus: 'UNDER_REVIEW'
  }

  try {
    const response = await client.request({
      url: `${baseUrl}/genericClass`,
      method: 'POST',
      data: classPayload
    })
    console.log('✅ Class created:', classId)
    console.log(response.data)
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log('ℹ️  Class already exists:', classId)
    } else {
      console.error('❌ Error:', error.response?.data || error.message)
    }
  }
}

createGenericClass()
```

Run once:
```bash
npx tsc create-google-class.ts --module ESNext --target ES2022 --moduleResolution node --esModuleInterop
node create-google-class.js
```

---

## Step 9: Install Pass on Android

### Option 1: Direct URL
1. Open the Save URL on your Android device
2. Tap **Save to Google Wallet**
3. Pass appears in Google Wallet app

### Option 2: QR Code
```bash
# Generate QR code from Save URL
npm install qrcode
```

---

## 🧩 If you see: "This pass is only used for testing"

This message is shown by Google Wallet when your issuer/classes are still in **test / under-review** mode.
In that state, only **allowlisted test accounts** (managed in the Google Pay & Wallet Console) can save the pass.

Fix:
1. Open Google Pay & Wallet Console: https://pay.google.com/business/console
2. Go to **Google Wallet API** → select your **Issuer**
3. Add your Google account email under **Users** and/or **Test accounts** (wording varies)
4. Retry the signed Save URL on the same Google account on your Android device

Notes:
- For true public/production distribution, your classes/issuer must pass Google's review process; until then, saving is restricted to allowlisted accounts.

```javascript
import QRCode from 'qrcode'

const saveUrl = 'https://pay.google.com/gp/v/save/...'
QRCode.toFile('google-wallet-qr.png', saveUrl)
console.log('QR code saved to google-wallet-qr.png')
```

Scan with Android camera → Opens in Google Wallet

### Option 3: Add to Website
```html
<a href="https://pay.google.com/gp/v/save/YOUR_OBJECT_ID">
  <img src="https://pay.google.com/gp/v/resources/add-to-google-wallet-button.svg">
</a>
```

---

## Step 10: Update Google Adapter (Production Ready)

For production, update the Google adapter to actually call the API:

```typescript
// src/adapters/google.ts
import { GoogleAuth } from 'google-auth-library'

export class GoogleWalletAdapter {
  private auth: GoogleAuth

  constructor(config?: Partial<GooglePassConfig>) {
    this.config = {
      issuerId: config?.issuerId || process.env.GOOGLE_ISSUER_ID || '',
      serviceAccountPath: config?.serviceAccountPath || process.env.GOOGLE_SA_JSON
    }

    this.auth = new GoogleAuth({
      keyFile: this.config.serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
    })
  }

  async createPassObject(object: GooglePassObject): Promise<void> {
    const client = await this.auth.getClient()
    const url = 'https://walletobjects.googleapis.com/walletobjects/v1/genericObject'

    await client.request({
      url,
      method: 'POST',
      data: object
    })
  }

  // ... rest of implementation
}
```

---

## Comparison: Apple vs Google Wallet

| Feature | Apple Wallet | Google Wallet |
|---------|--------------|---------------|
| **Cost** | $99/year | **FREE** ✅ |
| **Setup Time** | ~30 min | ~20 min |
| **Certificate Required** | Yes (complex) | No (JSON key) |
| **Distribution** | .pkpass file | URL/QR code |
| **Testing** | Need iPhone | Works on any device with browser |
| **Updates** | Push notifications | Automatic via API |
| **Platforms** | iOS only | Android + Web |

---

## Testing Checklist

- [ ] Google Cloud project created
- [ ] Google Wallet API enabled
- [ ] Service account created with JSON key
- [ ] Issuer ID obtained
- [ ] Service account added to issuer
- [ ] `.env` configured with credentials
- [ ] Test script runs successfully
- [ ] Pass class created
- [ ] Save URL works on Android
- [ ] Pass appears in Google Wallet

---

## Troubleshooting

### 1. "Invalid Issuer ID"
- **Solution**: Verify Issuer ID format (should be 19 digits)
- Check: pay.google.com/business/console → Google Wallet API

### 2. "Permission denied"
- **Solution**: Add service account email to issuer users
- Format: `service-name@project-id.iam.gserviceaccount.com`

### 3. "Class not found"
- **Solution**: Run `create-google-class.ts` first
- Each profile/type needs its own class

### 4. Save URL doesn't work
- **Solution**: URL format should be:
  ```
  https://pay.google.com/gp/v/save/ISSUER_ID.OBJECT_ID
  ```

### 5. "Insufficient authentication scopes"
- **Solution**: Check service account has correct scope:
  ```
  https://www.googleapis.com/auth/wallet_object.issuer
  ```

---

## Production Checklist

### Security
- [ ] Don't commit `google-credentials.json` to git
- [ ] Use environment variables for all credentials
- [ ] Rotate service account keys periodically
- [ ] Use separate service accounts for dev/prod

### API Implementation
- [ ] Implement actual API calls (not just stubs)
- [ ] Add error handling and retries
- [ ] Implement pass updates via API
- [ ] Add webhook handlers for events

### Distribution
- [ ] Generate signed JWTs for Save URLs (more secure)
- [ ] Implement QR code generation
- [ ] Add "Add to Google Wallet" buttons to website
- [ ] Support deep linking from mobile apps

---

## Google Wallet Pass Types

Google Wallet supports multiple pass types organized by use case:

### 🛒 Retail Passes

#### 1. 💳 Loyalty Card (`LoyaltyObject`)
For loyalty programs, rewards cards, and membership programs.

| Field | Description |
|-------|-------------|
| `accountName` | Member name |
| `accountId` | Member ID/number |
| `loyaltyPoints` | Points balance |
| `secondaryLoyaltyPoints` | Secondary currency |
| `programName` | Loyalty program name |

**Key Features:**
- Real-time points updates
- Location-based notifications
- Linked offers and rewards
- Tier status display

```json
{
  "id": "ISSUER_ID.loyalty-12345",
  "classId": "ISSUER_ID.loyalty-class",
  "accountName": "John Doe",
  "accountId": "12345678",
  "loyaltyPoints": {
    "balance": {"int": 2450},
    "label": "Points"
  },
  "barcode": {
    "type": "QR_CODE",
    "value": "12345678"
  }
}
```

---

#### 2. 🎁 Gift Card (`GiftCardObject`)
For gift cards, store credit, and prepaid cards.

| Field | Description |
|-------|-------------|
| `cardNumber` | Gift card number |
| `pin` | PIN (if applicable) |
| `balance` | Current balance |
| `balanceUpdateTime` | Last update time |
| `eventNumber` | Event/promo code |

**Key Features:**
- Balance display and updates
- PIN masking option
- Merchant branding
- Transaction history

```json
{
  "id": "ISSUER_ID.giftcard-67890",
  "classId": "ISSUER_ID.giftcard-class",
  "cardNumber": "1234-5678-9012-3456",
  "balance": {
    "currencyCode": "USD",
    "micros": 50000000
  },
  "barcode": {
    "type": "CODE_128",
    "value": "1234567890123456"
  }
}
```

---

#### 3. 🏷️ Offer (`OfferObject`)
For coupons, discounts, and promotional offers.

| Field | Description |
|-------|-------------|
| `redemptionChannel` | `ONLINE`, `INSTORE`, `BOTH` |
| `provider` | Offer provider |
| `shortTitle` | Brief offer title |
| `longTitle` | Full offer description |
| `validTimeInterval` | Start and end dates |

**Key Features:**
- Expiration tracking
- Location-based reminders
- Single/multi-use options
- Barcode for redemption

```json
{
  "id": "ISSUER_ID.offer-promo2026",
  "classId": "ISSUER_ID.offer-class",
  "redemptionChannel": "BOTH",
  "shortTitle": "25% OFF",
  "longTitle": "25% off all items - Spring Sale",
  "validTimeInterval": {
    "start": {"date": "2026-01-01"},
    "end": {"date": "2026-02-28"}
  }
}
```

---

### 🎫 Tickets & Events

#### 4. 🎟️ Event Ticket (`EventTicketObject`)
For concerts, sports, movies, conferences, and any event.

| Field | Description |
|-------|-------------|
| `ticketHolderName` | Attendee name |
| `ticketNumber` | Ticket ID |
| `seatInfo` | Seat details |
| `faceValue` | Ticket price |
| `dateTime` | Event date/time |

**Key Features:**
- Venue maps integration
- Calendar integration
- Multi-ticket grouping
- Save to Photos

```json
{
  "id": "ISSUER_ID.event-concert-2026",
  "classId": "ISSUER_ID.event-class",
  "ticketHolderName": "John Doe",
  "ticketNumber": "TKT-001234",
  "seatInfo": {
    "seat": {"defaultValue": {"value": "A12"}},
    "section": {"defaultValue": {"value": "VIP"}},
    "row": {"defaultValue": {"value": "1"}}
  }
}
```

---

#### 5. ✈️ Flight/Boarding Pass (`FlightObject`)
For airline boarding passes.

| Field | Description |
|-------|-------------|
| `passengerName` | Passenger details |
| `boardingAndSeatingInfo` | Seat, group, class |
| `reservationInfo` | PNR, booking reference |
| `flightHeader` | Flight number, carrier |

**Key Features:**
- Real-time flight updates
- Gate changes notifications
- Boarding time alerts
- Airport maps

```json
{
  "id": "ISSUER_ID.flight-aa1234",
  "classId": "ISSUER_ID.flight-class",
  "passengerName": "DOE/JOHN",
  "boardingAndSeatingInfo": {
    "seatNumber": "12A",
    "seatClass": "Economy",
    "boardingGroup": "1"
  },
  "reservationInfo": {
    "confirmationCode": "ABC123"
  }
}
```

---

#### 6. 🚆 Transit Pass (`TransitObject`)
For public transportation - trains, buses, metros.

| Field | Description |
|-------|-------------|
| `passengerType` | Adult, child, senior |
| `passengerNames` | Passenger list |
| `tripType` | Single, round-trip |
| `ticketLegs` | Route segments |

**Key Features:**
- Multi-leg trips
- NFC tap-to-ride
- Real-time delays
- Station maps

```json
{
  "id": "ISSUER_ID.transit-metro-pass",
  "classId": "ISSUER_ID.transit-class",
  "passengerType": "ADULT",
  "tripType": "ROUND_TRIP",
  "ticketLegs": [{
    "originName": {"defaultValue": {"value": "Central Station"}},
    "destinationName": {"defaultValue": {"value": "Airport Terminal"}},
    "departureDateTime": "2026-01-31T08:30:00"
  }]
}
```

---

### 🔑 Access & ID

#### 7. 🚗 Generic Private Pass (`GenericPrivatePassObject`)
For ID cards, keys, and access credentials.

| Field | Description |
|-------|-------------|
| `cardTitle` | Pass title |
| `header` | Top header text |
| `subheader` | Subheader text |
| `textModulesData` | Custom text fields |
| `imageModulesData` | Custom images |

**Key Features:**
- NFC access support
- Photo ID display
- Custom fields
- Privacy controls

---

### 🏥 Health

#### 8. 💉 Vaccination Card
For COVID-19 and other vaccination records.

**Key Features:**
- SMART Health Card support
- QR verification
- Privacy-focused
- Easy sharing

---

### 📋 Generic Pass (`GenericObject`)

For anything that doesn't fit other categories - the most flexible option!

| Field | Description |
|-------|-------------|
| `cardTitle` | Main title |
| `header` | Header text |
| `subheader` | Subheader text |
| `textModulesData` | Custom text sections |
| `linksModuleData` | Links to websites |
| `imageModulesData` | Custom images |
| `barcode` | QR, CODE_128, etc. |
| `hexBackgroundColor` | Background color |

**Perfect For:**
- Transport orders
- Insurance cards
- Parking passes
- Gym memberships
- Library cards
- Any custom pass!

```json
{
  "id": "ISSUER_ID.generic-to-001",
  "classId": "ISSUER_ID.generic-class",
  "cardTitle": {
    "defaultValue": {"value": "Transport Order"}
  },
  "header": {
    "defaultValue": {"value": "TO-2026-01-31-001"}
  },
  "textModulesData": [
    {"id": "plate", "header": "Plate", "body": "ABC-123"},
    {"id": "carrier", "header": "Carrier", "body": "Fast Transport"},
    {"id": "window", "header": "Time Window", "body": "08:00 - 12:00"}
  ],
  "barcode": {
    "type": "QR_CODE",
    "value": "TO-2026-01-31-001"
  },
  "hexBackgroundColor": "#1a73e8"
}
```

---

## Pass Type Comparison

| Pass Type | API Object | Best For | Special Features |
|-----------|------------|----------|------------------|
| **Loyalty** | `LoyaltyObject` | Rewards programs | Points, tiers, linked offers |
| **Gift Card** | `GiftCardObject` | Store credit | Balance, PIN support |
| **Offer** | `OfferObject` | Coupons, discounts | Expiration, redemption |
| **Event Ticket** | `EventTicketObject` | Concerts, sports | Venue maps, calendar |
| **Flight** | `FlightObject` | Boarding passes | Flight tracking, gates |
| **Transit** | `TransitObject` | Public transport | NFC, multi-leg trips |
| **Generic** | `GenericObject` | Everything else | Most flexible |

---

## Resources

### Official Documentation
- [Google Wallet API Overview](https://developers.google.com/wallet)
- [Google Wallet REST API](https://developers.google.com/wallet/generic/rest)
- [Google Wallet Android SDK](https://developers.google.com/wallet/generic/android)
- [Google Wallet Web Integration](https://developers.google.com/wallet/generic/web)

### Pass Type Documentation
- [Loyalty Cards](https://developers.google.com/wallet/retail/loyalty-cards)
- [Gift Cards](https://developers.google.com/wallet/retail/gift-cards)
- [Offers](https://developers.google.com/wallet/retail/offers)
- [Event Tickets](https://developers.google.com/wallet/tickets/events)
- [Flight Boarding Passes](https://developers.google.com/wallet/tickets/boarding-passes)
- [Transit Passes](https://developers.google.com/wallet/tickets/transit-passes)
- [Generic Passes](https://developers.google.com/wallet/generic)

### API References
- [GenericObject Reference](https://developers.google.com/wallet/generic/rest/v1/genericobject)
- [GenericClass Reference](https://developers.google.com/wallet/generic/rest/v1/genericclass)
- [LoyaltyObject Reference](https://developers.google.com/wallet/retail/loyalty-cards/rest/v1/loyaltyobject)
- [EventTicketObject Reference](https://developers.google.com/wallet/tickets/events/rest/v1/eventticketobject)
- [FlightObject Reference](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightobject)

### Consoles & Tools
- [Google Cloud Console](https://console.cloud.google.com)
- [Google Pay & Wallet Console](https://pay.google.com/business/console)
- [Pass Visual Builder](https://developers.google.com/wallet/retail/loyalty-cards/resources/pass-builder)
- [Wallet API Codelab](https://developers.google.com/wallet/generic/resources/codelabs)

### Code Samples & Libraries
- [REST API Samples (All Languages)](https://github.com/google-wallet/rest-samples)
- [Android SDK Samples](https://github.com/google-wallet/android)
- [Web Integration Samples](https://github.com/google-wallet/web)
- [Pass Converter (Cross-platform)](https://github.com/nickcmiller/pass-converter)

---

## Next Steps

1. **Complete basic setup** (Steps 1-7) - **FREE, takes 20 min**
2. **Test on Android device** (Step 9)
3. **Implement production API** (Step 10)
4. **Add to your app/website**

**No purchase required - get started now!** 🚀
