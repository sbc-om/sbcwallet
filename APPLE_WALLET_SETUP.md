# Apple Wallet Setup Guide

Complete guide for setting up Apple Wallet pass generation with sbcwallet.

## Prerequisites

- ✅ Apple Developer Account ($99/year) - [developer.apple.com/programs](https://developer.apple.com/programs/)
- ✅ Mac computer (required for certificate signing)
- ✅ sbcwallet package (already built)

---

## Step 1: Create Pass Type Identifier

1. Go to [developer.apple.com/account](https://developer.apple.com/account)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Click **Identifiers** → **+** button
4. Select **Pass Type IDs** → Continue

### Create Two Pass Type IDs:

#### For Logistics (Transport Orders)
- **Description**: sbcwallet Logistics Pass
- **Identifier**: `pass.com.sbcwallet.logistics`
- Click **Continue** → **Register**

#### For Healthcare (Patient Visits) - Optional
- **Description**: sbcwallet Healthcare Pass
- **Identifier**: `pass.com.sbcwallet.healthcare`
- Click **Continue** → **Register**

---

## Step 2: Generate Pass Type ID Certificate

### A. Create Certificate Signing Request (CSR)

1. Open **Keychain Access** on your Mac
2. Menu: **Keychain Access** → **Certificate Assistant** → **Request a Certificate from a Certificate Authority**
3. Fill in:
   - **User Email**: your@email.com
   - **Common Name**: sbcwallet Pass Certificate
   - **Request is**: Saved to disk
4. Save as `PassCertificate.certSigningRequest`

### B. Create Certificate in Apple Developer Portal

1. Go to **Certificates** → **+** button
2. Select **Pass Type ID Certificate** → Continue
3. Choose your Pass Type ID: `pass.com.sbcwallet.logistics`
4. Upload the `.certSigningRequest` file
5. Download the certificate: `pass.cer`

### C. Install Certificate

1. Double-click `pass.cer` to install in Keychain Access
2. Find the certificate in **My Certificates**
3. Right-click → **Export "Pass Type ID..."**
4. Save as: `sbcwallet-pass.p12`
5. **Set a password** (you'll need this later)
6. Save to: `/Users/przpgo/code/sbcwallet/pass/certs/`

---

## Step 3: Get Apple WWDR Certificate

### Download Worldwide Developer Relations Certificate

1. Go to [Apple PKI](https://www.apple.com/certificateauthority/)
2. Download **Worldwide Developer Relations - G4** certificate
3. Or use direct link: [WWDR G4 Certificate](https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer)
4. Double-click to install in Keychain Access

### Export WWDR as PEM

```bash
# Create certs directory
mkdir -p /Users/przpgo/code/sbcwallet/pass/certs

# Export from Keychain (or download and convert)
# If you have the .cer file:
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out certs/wwdr.pem
```

**Alternative**: Export from Keychain Access
1. Find "Apple Worldwide Developer Relations Certification Authority" in System keychain
2. Right-click → Export
3. Save as `wwdr.pem` (format: Privacy Enhanced Mail (.pem))

---

## Step 4: Configure Environment Variables

Create a `.env` file in the project root:

```bash
cd /Users/przpgo/code/sbcwallet/pass

cat > .env << 'EOF'
# Apple Wallet Configuration
APPLE_TEAM_ID=YOUR_TEAM_ID
APPLE_PASS_TYPE_ID=pass.com.sbcwallet.logistics
APPLE_CERT_PATH=./certs/sbcwallet-pass.p12
APPLE_CERT_PASSWORD=your_p12_password
APPLE_WWDR_PATH=./certs/wwdr.pem
EOF
```

### Find Your Team ID

1. Go to [developer.apple.com/account](https://developer.apple.com/account)
2. Click on **Membership** in sidebar
3. Your Team ID is shown (e.g., `ABCD123456`)
4. Update `.env` with your Team ID

---

## Step 5: Verify Certificate Setup

Create a test script:

```bash
cat > test-apple-wallet.ts << 'EOF'
import { createParentSchedule, createChildTicket, getPkpassBuffer } from './dist/index.js'
import { writeFile } from 'fs/promises'
import 'dotenv/config'

async function testAppleWallet() {
  console.log('🧪 Testing Apple Wallet Pass Generation\n')

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

  // Generate pkpass
  try {
    const pkpass = await getPkpassBuffer('child', child)
    await writeFile('test-transport-order.pkpass', pkpass)
    console.log('\n✅ SUCCESS! Generated: test-transport-order.pkpass')
    console.log('📱 AirDrop this file to your iPhone to test!')
  } catch (error) {
    console.error('❌ Error generating pass:', error)
    throw error
  }
}

testAppleWallet()
EOF
```

### Install dotenv and run:

```bash
npm install dotenv
npx tsc test-apple-wallet.ts --module ESNext --target ES2022 --moduleResolution node --esModuleInterop
node test-apple-wallet.js
```

Expected output:
```
🧪 Testing Apple Wallet Pass Generation

✅ Parent created: PES-2025-10-20-XXXX
✅ Child created: TO-2025-10-20-XXXX-YYYY

✅ SUCCESS! Generated: test-transport-order.pkpass
📱 AirDrop this file to your iPhone to test!
```

---

## Step 6: Install Pass on iPhone

### Option 1: AirDrop
1. Right-click `test-transport-order.pkpass` on Mac
2. Share → AirDrop → Your iPhone
3. Tap on iPhone to open
4. Click **Add** to add to Wallet

### Option 2: Email
1. Email the `.pkpass` file to yourself
2. Open on iPhone
3. Tap attachment → Add to Wallet

### Option 3: Web Server
```bash
# Serve the file locally
python3 -m http.server 8080
```
Navigate to `http://your-mac-ip:8080/test-transport-order.pkpass` from iPhone

---

## Step 7: Test Pass Updates

Create an update script:

```typescript
import { updatePassStatus, getPass } from './dist/index.js'

const passId = 'TO-2025-10-20-XXXX-YYYY' // Use your actual ID

// Simulate status transitions
await updatePassStatus(passId, 'PRESENCE')
console.log('✅ Status: PRESENCE')

await updatePassStatus(passId, 'SCALE')
console.log('✅ Status: SCALE')

// In production, you'd regenerate and push the updated pass
```

---

## Troubleshooting

### Common Issues

#### 1. "teamIdentifier" is not allowed to be empty
- **Solution**: Set `APPLE_TEAM_ID` in `.env` file
- Find it at developer.apple.com/account → Membership

#### 2. Certificate verification failed
- **Solution**: Ensure WWDR certificate is in PEM format
- Verify with: `openssl x509 -in certs/wwdr.pem -text -noout`

#### 3. Invalid password for p12 file
- **Solution**: Re-export certificate from Keychain Access with correct password
- Update `APPLE_CERT_PASSWORD` in `.env`

#### 4. Pass not appearing on iPhone
- **Solution**: Check that:
  - Pass Type ID matches in code and certificate
  - Certificate is not expired
  - iPhone has internet connection (for first-time verification)

#### 5. Permission denied on certs directory
```bash
chmod 600 certs/*.p12
chmod 644 certs/*.pem
```

---

## Directory Structure

Your final setup should look like:

```
sbcwallet/pass/
├── .env                          # Environment variables
├── certs/
│   ├── sbcwallet-pass.p12        # Your pass certificate (private)
│   └── wwdr.pem                 # Apple WWDR cert (public)
├── test-transport-order.pkpass  # Generated pass file
└── test-apple-wallet.ts         # Test script
```

---

## Next Steps

### 1. Production Setup
- Store certificates securely (not in git)
- Use environment-specific configs
- Implement pass update notifications
- Set up web service for pass distribution

### 2. Add Logo Images
```bash
mkdir -p certs/images
# Add these images:
# - icon.png (29×29, 58×58, 87×87)
# - icon@2x.png (58×58)
# - icon@3x.png (87×87)
# - logo.png (160×50)
# - logo@2x.png (320×100)
# - logo@3x.png (480×150)
```

### 3. Enable Pass Updates
- Implement web service endpoints
- Set up push notifications
- Add pass registration/update logic

---

## Apple Wallet Pass Types

Apple Wallet supports **5 types of passes**, each optimized for specific use cases:

### 1. 🎫 Boarding Pass (`boardingPass`)
For transportation tickets - flights, trains, buses, ferries, etc.

| Field | Description |
|-------|-------------|
| `transitType` | `PKTransitTypeAir`, `PKTransitTypeTrain`, `PKTransitTypeBus`, `PKTransitTypeBoat`, `PKTransitTypeGeneric` |
| `headerFields` | Gate, seat, boarding time |
| `primaryFields` | Origin → Destination |
| `secondaryFields` | Passenger name, class |
| `auxiliaryFields` | Flight number, date |

**Key Features:**
- Automatic flight tracking updates
- Maps integration for airports/stations
- Time-relevant notifications
- QR/Barcode scanning

```json
{
  "boardingPass": {
    "transitType": "PKTransitTypeAir",
    "headerFields": [{"key": "gate", "label": "GATE", "value": "A32"}],
    "primaryFields": [
      {"key": "origin", "label": "MEX", "value": "Mexico City"},
      {"key": "destination", "label": "LAX", "value": "Los Angeles"}
    ]
  }
}
```

---

### 2. 🎟️ Event Ticket (`eventTicket`)
For concerts, sports, movies, conferences, and any event admission.

| Field | Description |
|-------|-------------|
| `headerFields` | Event date/time |
| `primaryFields` | Event name, venue |
| `secondaryFields` | Seat, section, row |
| `auxiliaryFields` | Door, entry time |

**Key Features:**
- Multiple upcoming events on single pass
- Calendar integration
- Location-based notifications
- Poster-style design option

```json
{
  "eventTicket": {
    "headerFields": [{"key": "date", "label": "DATE", "value": "Jan 31, 2026"}],
    "primaryFields": [{"key": "event", "label": "EVENT", "value": "Taylor Swift Eras Tour"}],
    "secondaryFields": [
      {"key": "seat", "label": "SEAT", "value": "A12"},
      {"key": "section", "label": "SEC", "value": "VIP"}
    ]
  }
}
```

---

### 3. 💳 Store Card (`storeCard`)
For loyalty cards, membership cards, gift cards, and reward programs.

| Field | Description |
|-------|-------------|
| `headerFields` | Points balance, tier |
| `primaryFields` | Member name, ID |
| `secondaryFields` | Rewards, status |
| `auxiliaryFields` | Expiration, offers |

**Key Features:**
- Balance/points display
- Automatic updates
- Store location notifications
- Grouped with related offers

```json
{
  "storeCard": {
    "headerFields": [{"key": "balance", "label": "POINTS", "value": "2,450"}],
    "primaryFields": [{"key": "name", "label": "MEMBER", "value": "John Doe"}],
    "secondaryFields": [{"key": "tier", "label": "STATUS", "value": "Gold"}]
  }
}
```

---

### 4. 🏷️ Coupon (`coupon`)
For discounts, promotional offers, and special deals.

| Field | Description |
|-------|-------------|
| `headerFields` | Discount amount/percentage |
| `primaryFields` | Offer description |
| `secondaryFields` | Terms, conditions |
| `auxiliaryFields` | Expiration date |

**Key Features:**
- Expiration date tracking
- Location-based reminders
- Single/multiple use options
- Auto-archive after redemption

```json
{
  "coupon": {
    "headerFields": [{"key": "discount", "label": "OFF", "value": "25%"}],
    "primaryFields": [{"key": "offer", "label": "OFFER", "value": "Spring Sale - All Items"}],
    "auxiliaryFields": [{"key": "expires", "label": "EXPIRES", "value": "Feb 28, 2026"}]
  }
}
```

---

### 5. 📋 Generic Pass (`generic`)
For any pass that doesn't fit other categories - ID cards, insurance cards, parking passes, gym memberships, etc.

| Field | Description |
|-------|-------------|
| `headerFields` | Category, type |
| `primaryFields` | Main identifier |
| `secondaryFields` | Details |
| `auxiliaryFields` | Additional info |

**Key Features:**
- Most flexible format
- Customizable layout
- Works for any use case
- Full update support

```json
{
  "generic": {
    "headerFields": [{"key": "type", "label": "TYPE", "value": "Transport Order"}],
    "primaryFields": [{"key": "id", "label": "ORDER #", "value": "TO-2026-01-31-001"}],
    "secondaryFields": [
      {"key": "plate", "label": "PLATE", "value": "ABC-123"},
      {"key": "carrier", "label": "CARRIER", "value": "Fast Transport"}
    ]
  }
}
```

---

## Pass Type Comparison

| Pass Type | Best For | Visual Style | Special Features |
|-----------|----------|--------------|------------------|
| **Boarding Pass** | Transportation | Strip/Horizontal | Flight tracking, transit info |
| **Event Ticket** | Events/Shows | Strip/Poster | Multiple events, calendar |
| **Store Card** | Loyalty/Gift Cards | Strip | Balance display, location |
| **Coupon** | Discounts/Offers | Strip | Expiration, auto-archive |
| **Generic** | Everything else | Square | Most flexible |

---

## Semantic Tags

Semantic tags provide machine-readable metadata for enhanced functionality:

```json
{
  "semantics": {
    "airlineCode": "AA",
    "flightNumber": "1234",
    "departureAirportCode": "MEX",
    "arrivalAirportCode": "LAX",
    "departureGate": "A32",
    "boardingGroup": "1",
    "seatNumber": "12A",
    "passengerName": {
      "familyName": "Doe",
      "givenName": "John"
    }
  }
}
```

---

## Resources

### Official Documentation
- [Apple Wallet Developer Guide](https://developer.apple.com/documentation/walletpasses)
- [Pass Design Guidelines](https://developer.apple.com/design/human-interface-guidelines/wallet)
- [Creating the Source for a Pass](https://developer.apple.com/documentation/walletpasses/creating-the-source-for-a-pass)
- [Building a Pass](https://developer.apple.com/documentation/walletpasses/building-a-pass)
- [Distributing and Updating a Pass](https://developer.apple.com/documentation/walletpasses/distributing-and-updating-a-pass)

### Pass Type Documentation
- [Boarding Pass - Semantic Tags](https://developer.apple.com/documentation/walletpasses/creating-an-airline-boarding-pass-using-semantic-tags)
- [Event Ticket - Poster Style](https://developer.apple.com/documentation/walletpasses/creating-an-event-pass-using-semantic-tags)
- [Store Card Pass](https://developer.apple.com/documentation/walletpasses/creating-a-store-card-pass)
- [Coupon Pass](https://developer.apple.com/documentation/walletpasses/creating-a-coupon-pass)
- [Generic Pass](https://developer.apple.com/documentation/walletpasses/creating-a-generic-pass)

### API References
- [Pass Object Reference](https://developer.apple.com/documentation/walletpasses/pass)
- [Pass Fields Reference](https://developer.apple.com/documentation/walletpasses/passfields)
- [Semantic Tags Reference](https://developer.apple.com/documentation/walletpasses/semantictags)
- [Personalization Dictionary](https://developer.apple.com/documentation/walletpasses/personalizationdictionary)

### Web Service (Pass Updates)
- [Adding a Web Service to Update Passes](https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes)
- [Register a Pass for Update Notifications](https://developer.apple.com/documentation/walletpasses/register-a-pass-for-update-notifications)
- [Send an Updated Pass](https://developer.apple.com/documentation/walletpasses/send-an-updated-pass)

### Tools & Libraries
- [passkit-generator Documentation](https://github.com/alexandercerutti/passkit-generator)
- [Apple PKI - Certificates](https://www.apple.com/certificateauthority/)
- [sbcwallet Pass README](./README.md)

---

**Ready to generate your first pass?** Follow Steps 1-6 above after purchasing your Apple Developer account!
