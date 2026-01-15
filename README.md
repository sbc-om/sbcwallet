# sbcwallet

Unified wallet-pass SDK for Apple Wallet (.pkpass) and Google Wallet.

## Install

```sh
npm install sbcwallet
```

## Quickstart (Loyalty)

Multi-tenant loyalty is designed for a real-world setup:
- Each business (tenant) defines its own card design (logo, colors, issuer name).
- Users add a card using their own `memberId`.
- Points can be updated for an existing issued card.

### Define a business (per-tenant theme) and create its program

```ts
import { createBusiness, createLoyaltyProgram } from 'sbcwallet'

const biz = createBusiness({
	name: 'X Cafe',
	programName: 'Spirit Rewards',
	pointsLabel: 'Points',
	wallet: {
		googleWallet: {
			issuerName: 'X Cafe',
			backgroundColor: '#111827',
			logoUrl: 'https://example.com/logo.png',

			// Advanced passthrough: merged into the Google loyaltyClass payload
			classOverrides: {
				reviewStatus: 'UNDER_REVIEW'
			}
		},
		appleWallet: {
			organizationName: 'X Cafe',
			logoText: 'X',
			backgroundColor: 'rgb(17, 24, 39)',

			// Advanced passthrough: merged into the Apple pass.json payload
			passOverrides: {
				userInfo: { tenant: 'spirit-hub' }
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
	// Apple Wallet: shown when the pass becomes relevant (e.g., near a location)
	relevantText: 'Welcome back — show this card at checkout',
	countryCode: 'OM',
	homepageUrl: 'https://example.com'
})
```

### Issue a card and generate a Save URL

```ts
import {
	createCustomerAccount,
	issueLoyaltyCard,
	updateLoyaltyPoints,
	getGoogleObject
} from 'sbcwallet'

const memberId = 'USER-123'

const customer = createCustomerAccount({
	businessId: biz.id,
	fullName: 'Alice',
	memberId
})

const card = await issueLoyaltyCard({
	businessId: biz.id,
	customerId: customer.id,
	initialPoints: 10,
	metadata: {
		googleWallet: {
			objectOverrides: {
				linksModuleData: {
					uris: [{ uri: 'https://example.com', description: 'Website' }]
				}
			}
		}
	}
})

await updateLoyaltyPoints({ cardId: card.id, delta: 5 })

const { saveUrl } = await getGoogleObject('child', card)
console.log(saveUrl)
```

## Location-based surfacing and notifications

This SDK supports two related concepts:

1) Location-based surfacing (no server required)
- Apple Wallet: setting `locations` and `relevantText` in pass.json can surface the pass on the lock screen when the user is near the business.
- Google Wallet: setting `locations` on the class/object helps Wallet surface the pass contextually.

2) Push-style notifications (server required)
- Google Wallet supports sending a message via the `addMessage` API. Your system decides *when* to send the message (for example, after your app detects the user is near the business).

```ts
import { pushLoyaltyMessage } from 'sbcwallet'

await pushLoyaltyMessage({
	cardId: card.id,
	header: 'X',
	body: 'You are nearby — show this card to earn points.',
	messageType: 'TEXT_AND_NOTIFY'
})
```

## Demo server (multi-tenant)

```sh
npm run loyalty:server:multi
```

Open `http://localhost:5190`.

## Configuration

For Google Wallet Save URLs to work on-device you must set:
- `GOOGLE_ISSUER_ID`
- `GOOGLE_SA_JSON`

For Apple Wallet signing, see APPLE_WALLET_SETUP.md.

## Development

```sh
npm run build
npm test
npm pack --dry-run
```

