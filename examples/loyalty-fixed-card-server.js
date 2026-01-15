import 'dotenv/config'

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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

const PORT = Number(process.env.LOYALTY_FIXED_ADMIN_PORT || process.env.LOYALTY_ADMIN_PORT || 5180)
const STATE_PATH = process.env.LOYALTY_FIXED_STATE_PATH
  ? process.env.LOYALTY_FIXED_STATE_PATH
  : join(__dirname, '.loyalty-fixed-state.json')

function optionalEnv(name) {
  const value = process.env[name]
  return value && String(value).trim() ? String(value).trim() : undefined
}

function nowDate() {
  return new Date().toISOString().split('T')[0]
}

function randomUpper(n) {
  return Math.random().toString(36).slice(2, 2 + n).toUpperCase()
}

function generateIds() {
  const date = nowDate()
  const seed = randomUpper(6)
  return {
    businessId: `BIZ-${date}-${seed}`,
    programId: `LPR-${date}-${seed}`,
    customerId: `CUS-${date}-${seed}`,
    memberId: `SBC-${seed}-${randomUpper(8)}`,
    cardId: `LCR-${date}-${seed}-${randomUpper(4)}`
  }
}

async function readJsonFile(path) {
  if (!existsSync(path)) return null
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
}

async function writeJsonFile(path, data) {
  // Lazy import to keep top-level clean
  const { writeFile } = await import('node:fs/promises')
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(data, null, 2))
}

async function readBodyJson(req) {
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
  version: 1,
  businessId: null,
  programId: null,
  customerId: null,
  memberId: null,
  cardId: null,
  points: 10,
  saveUrl: null
}

let runtimeState = {
  business: null,
  program: null,
  customer: null,
  card: null,
  saveUrl: null
}

async function ensureStateLoaded() {
  if (state.businessId) return state

  const disk = await readJsonFile(STATE_PATH)
  if (disk && disk.businessId && disk.programId && disk.customerId && disk.memberId && disk.cardId) {
    state = { ...state, ...disk }
    return state
  }

  const ids = generateIds()
  state.businessId = ids.businessId
  state.programId = ids.programId
  state.customerId = ids.customerId
  state.memberId = ids.memberId
  state.cardId = ids.cardId

  await writeJsonFile(STATE_PATH, state)
  return state
}

async function bootstrapInMemoryStores() {
  if (runtimeState.card && runtimeState.program && runtimeState.customer && runtimeState.business) {
    return runtimeState
  }

  await ensureStateLoaded()

  const logoUrl = optionalEnv('LOYALTY_LOGO_URL') || 'https://placehold.co/256x256/png?text=SBC'
  if (!optionalEnv('LOYALTY_LOGO_URL')) {
    console.warn('⚠️  LOYALTY_LOGO_URL not set; using placeholder logo (set it to your public HTTPS logo URL for production)')
  }

  const business = createBusiness({
    id: state.businessId,
    name: process.env.LOYALTY_BUSINESS_NAME || 'SBC',
    programName: process.env.LOYALTY_PROGRAM_NAME || 'SBC Rewards',
    pointsLabel: process.env.LOYALTY_POINTS_LABEL || 'Points'
  })

  const locations = parseLocationsFromEnv() || [
    { latitude: 35.6892, longitude: 51.389 },
    { latitude: 35.7000, longitude: 51.4 }
  ]

  const program = await createLoyaltyProgram({
    businessId: business.id,
    programId: state.programId,
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
    id: state.customerId,
    businessId: business.id,
    fullName: process.env.LOYALTY_CUSTOMER_NAME || 'Milad Test',
    memberId: state.memberId
  })

  // Re-create the SAME loyalty card ID every run.
  const card = await issueLoyaltyCard({
    cardId: state.cardId,
    businessId: business.id,
    customerId: customer.id,
    initialPoints: Number(state.points ?? 10)
  })

  const { saveUrl } = await getGoogleObject('child', card)
  state.saveUrl = saveUrl
  runtimeState = { business, program, customer, card, saveUrl }

  await writeJsonFile(STATE_PATH, state)
  return runtimeState
}

async function refreshSaveUrlFromLatestCard() {
  const card = getPass(state.cardId) || null
  if (!card) return
  const { saveUrl } = await getGoogleObject('child', card)
  state.saveUrl = saveUrl
  runtimeState.card = card
  runtimeState.saveUrl = saveUrl
  await writeJsonFile(STATE_PATH, state)
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

    if (req.method === 'POST' && url.pathname === '/init') {
      // Reinitialize runtime state but keep persisted IDs.
      runtimeState = { business: null, program: null, customer: null, card: null, saveUrl: null }
      const hydrated = await bootstrapInMemoryStores()
      json(res, 200, hydrated)
      return
    }

    if (req.method === 'GET' && url.pathname === '/state') {
      const hydrated = await bootstrapInMemoryStores()
      json(res, 200, hydrated)
      return
    }

    if (req.method === 'POST' && url.pathname === '/points') {
      const hydrated = await bootstrapInMemoryStores()
      const body = await readBodyJson(req)

      if (body.setPoints !== undefined) {
        const updated = await updateLoyaltyPoints({ cardId: state.cardId, setPoints: Number(body.setPoints) })
        state.points = Number(updated.points ?? 0)
      } else if (body.delta !== undefined) {
        const updated = await updateLoyaltyPoints({ cardId: state.cardId, delta: Number(body.delta) })
        state.points = Number(updated.points ?? 0)
      } else {
        throw new Error('Provide setPoints or delta')
      }

      await refreshSaveUrlFromLatestCard()

      // Keep runtime state in sync for UI display.
      hydrated.card = runtimeState.card
      hydrated.saveUrl = runtimeState.saveUrl
      json(res, 200, hydrated)
      return
    }

    json(res, 404, { error: 'Not found' })
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) })
  }
})

server.listen(PORT, async () => {
  console.log(`✅ Loyalty fixed-card server running: http://localhost:${PORT}`)
  console.log(`State file: ${STATE_PATH}`)
  console.log('This server reuses the same business/program/customer/card IDs across restarts.')
  console.log('Env required for real device add: GOOGLE_ISSUER_ID, GOOGLE_SA_JSON')
  console.log('Optional: LOYALTY_LOGO_URL (public HTTPS logo URL)')
})
