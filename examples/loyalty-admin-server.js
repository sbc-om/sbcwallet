import 'dotenv/config'

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  createBusiness,
  createCustomerAccount,
  createLoyaltyProgram,
  issueLoyaltyCard,
  updateLoyaltyPoints,
  getGoogleObject,
  getPass
} from '../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = Number(process.env.LOYALTY_ADMIN_PORT || 5179)

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(data, null, 2))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON body')
  }
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

let state = {
  business: null,
  program: null,
  customer: null,
  card: null,
  saveUrl: null
}

async function initState() {
  const logoUrl = process.env.LOYALTY_LOGO_URL
  if (!logoUrl) {
    throw new Error('Missing env var LOYALTY_LOGO_URL (Google Wallet loyaltyClass requires a public HTTPS logo URL)')
  }

  const business = createBusiness({
    name: process.env.LOYALTY_BUSINESS_NAME || 'SBC Coffee',
    programName: process.env.LOYALTY_PROGRAM_NAME || 'SBC Coffee Rewards',
    pointsLabel: process.env.LOYALTY_POINTS_LABEL || 'Points'
  })

  const locations = parseLocationsFromEnv() || [
    { latitude: 35.6892, longitude: 51.389 },
    { latitude: 35.7000, longitude: 51.4 }
  ]

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

  // Ensure loyalty class exists in API (when creds exist)
  await getGoogleObject('parent', program)

  const customer = createCustomerAccount({
    businessId: business.id,
    fullName: process.env.LOYALTY_CUSTOMER_NAME || 'Milad Test'
  })

  const card = await issueLoyaltyCard({
    businessId: business.id,
    customerId: customer.id,
    initialPoints: Number(process.env.LOYALTY_INITIAL_POINTS || 10)
  })

  const { saveUrl } = await getGoogleObject('child', card)

  state = { business, program, customer, card, saveUrl }
  return state
}

async function ensureState() {
  if (!state.card || !state.program || !state.customer || !state.business) {
    await initState()
  }
  return state
}

async function refreshSaveUrlForCard() {
  const card = state.card
  if (!card) return
  const latest = getPass(card.id) || card
  const { saveUrl } = await getGoogleObject('child', latest)
  state.saveUrl = saveUrl
  state.card = latest
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (req.method === 'GET' && url.pathname === '/') {
      const html = await readFile(join(__dirname, 'loyalty-admin.html'), 'utf8')
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      })
      res.end(html)
      return
    }

    if (req.method === 'GET' && url.pathname === '/state') {
      await ensureState()
      json(res, 200, state)
      return
    }

    if (req.method === 'POST' && url.pathname === '/init') {
      await initState()
      json(res, 200, state)
      return
    }

    if (req.method === 'POST' && url.pathname === '/points') {
      await ensureState()
      const body = await readJson(req)

      const cardId = state.card.id

      if (body.setPoints !== undefined) {
        await updateLoyaltyPoints({ cardId, setPoints: Number(body.setPoints) })
      } else if (body.delta !== undefined) {
        await updateLoyaltyPoints({ cardId, delta: Number(body.delta) })
      } else {
        throw new Error('Provide setPoints or delta')
      }

      // Upsert updated object in Google Wallet when creds exist
      await refreshSaveUrlForCard()

      json(res, 200, state)
      return
    }

    json(res, 404, { error: 'Not found' })
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) })
  }
})

server.listen(PORT, () => {
  console.log(`✅ Loyalty admin server running: http://localhost:${PORT}`)
  console.log('Env required for real device add: GOOGLE_ISSUER_ID, GOOGLE_SA_JSON')
  console.log('Optional: LOYALTY_LOCATIONS="lat,lng;lat,lng"')
})
