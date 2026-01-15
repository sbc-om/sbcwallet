# 🎟️ sbcwallet

Unified Wallet-Pass SDK for Real-World Credentials

sbcwallet is a TypeScript SDK for generating, signing, and managing verifiable passes on Apple Wallet and Google Wallet.
Built on @sbcwallet, it bridges cryptographic truth and real-world credentials — enabling secure, interoperable workflows for logistics, healthcare, and beyond.

⸻

## ✨ Overview

sbcwallet provides a unified abstraction layer for issuing and updating wallet passes across multiple ecosystems.
It standardizes claim flows (like PES → TO) and status pipelines (ISSUED → PRESENCE → OPS → EXITED) while maintaining verifiable hashes, signatures, and anchor integrity via sbcwallet Core.

⸻

## 🚀 Quickstart

```jsnpm install sbcwallet

import { createParentSchedule, createChildTicket, getPkpassBuffer } from 'sbcwallet'

// 1️⃣ Create a parent PES schedule
const pes = await createParentSchedule({
  profile: 'logistics',
  programName: 'Morning Yard Veracruz',
  site: 'Patio Gate 3'
})

// 2️⃣ Claim a child Transport Order
const to = await createChildTicket({
  parentId: pes.id,
  plate: 'ABC123A',
  carrier: 'Transportes Golfo'
})

// 3️⃣ Generate Apple Wallet pass
const buf = await getPkpassBuffer('child', to)
await fs.promises.writeFile('ticket.pkpass', buf)
```

## 🎁 Loyalty Cards (Multi-tenant)

Each business defines its own loyalty program, customers create accounts, and each customer gets a loyalty card that shows:
- A QR/barcode identifier (`memberId`)
- Current points (`points`) which can be updated

```ts
import {
	createBusiness,
	createCustomerAccount,
	createLoyaltyProgram,
	issueLoyaltyCard,
	updateLoyaltyPoints,
	getGoogleObject
} from 'sbcwallet'

const biz = createBusiness({ name: 'SBC Coffee', pointsLabel: 'Beans' })
await createLoyaltyProgram({ businessId: biz.id })

const customer = createCustomerAccount({ businessId: biz.id, fullName: 'Alice' })
const card = await issueLoyaltyCard({ businessId: biz.id, customerId: customer.id, initialPoints: 10 })
await updateLoyaltyPoints({ cardId: card.id, delta: 5 })

const { saveUrl } = await getGoogleObject('child', card)
console.log(saveUrl)
```

⸻

## 🧠 Architecture
```bash
sbcwallet
├── adapters/      # Apple + Google Wallet adapters
├── api/           # Unified issuance/update API
├── profiles/      # Domain-specific field maps
├── templates/     # JSON templates for passes
└── types.ts       # Shared types and validation
```
### Key Components
```bash
Module	Description
adapters/apple.ts	Builds and signs .pkpass files using passkit-generator.
adapters/google.ts	Creates Google Wallet class/object JSON payloads.
api/unified.ts	Unified functions: createParentSchedule, createChildTicket, updatePassStatus.
profiles/	Domain-specific mappings (logistics, healthcare, etc.).
templates/	JSON templates for field mapping and layout.
```

⸻

## 🧩 Profiles

### Logistics (default)

Entity	Description	Example
Parent (PES)	Program Entry Schedule	Gate window, site, available slots
Child (TO)	Transport Order	Plate, carrier, client, status
Statuses	ISSUED → PRESENCE → SCALE → OPS → EXITED	

### Healthcare (reference)

Entity	Description	Example
Parent	Appointment Batch	Doctor, location, date
Child	Patient Visit Ticket	Patient, procedure, status
Statuses	SCHEDULED → CHECKIN → PROCEDURE → DISCHARGED	

Switch profiles dynamically:
```js
await createChildTicket({ profile: 'healthcare', ... })
```

⸻

## 🔐 Integration with sbcwallet Core

sbcwallet Pass automatically uses:
	•	hashEvent() for deterministic hashes
	•	signCredential() for ECDSA signatures
	•	dailyMerkle() for anchoring batches

This ensures every pass is cryptographically verifiable and compatible with sbcwallet’s event audit trail.

⸻

## 🧪 Testing

`npm run test`

Tests include:
	•	Apple .pkpass field mapping
	•	Google Wallet JSON validity
	•	Cross-profile field validation
	•	Core integration (hash + sign + verify)

⸻

## ⚙️ Environment Variables (Apple Wallet)

```sh
APPLE_TEAM_ID=ABCD1234
APPLE_PASS_TYPE_ID=pass.com.sbcwallet.logistics
APPLE_CERT_PATH=./certs/pass.p12
APPLE_CERT_PASSWORD=yourpassword
APPLE_WWDR_PATH=./certs/wwdr.pem
```

For Google Wallet, include:
```sh
GOOGLE_ISSUER_ID=issuer-id
GOOGLE_SA_JSON=./google/credentials.json
```

⸻

## 🧾 License

Apache License 2.0
© 2025 sbcwallet — open and extensible.

⸻

## 🤝 Contributing
	1.	Fork the repo
	2.	Run npm install
	3.	Add or improve a profile under src/profiles/
	4.	Write tests in tests/
	5.	Submit a PR using conventional commits

⸻

## 🧭 Part of the sbcwallet Ecosystem

Repo	Purpose
```sh
sbcwallet/core	Verifiable event SDK — hashing, signing, Merkle trees
sbcwallet/pass	Wallet-pass abstraction over Core (this repo)
sbcwallet/wallet	Reference logistics PWA & API
sbcwallet/id	Hosted identity & orchestration layer (SaaS)
```

⸻

“sbcwallet Pass connects cryptographic truth with human experience —
turning every credential into a verifiable story.”

Reflection: evidence ✓ logic consistent brevity optimized