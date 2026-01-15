import 'dotenv/config'

import http from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import crypto from 'node:crypto'

import {
  createBusiness,
  createCustomerAccount,
  createLoyaltyProgram,
  issueLoyaltyCard,
  updateLoyaltyPoints,
  pushLoyaltyMessage,
  getGoogleObject,
  getPass
} from '../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = Number(process.env.LOYALTY_MULTI_PORT || 5190)
const STATE_PATH = process.env.LOYALTY_MULTI_STATE_PATH
  ? process.env.LOYALTY_MULTI_STATE_PATH
  : join(__dirname, '.loyalty-multi-state.json')

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

function stableHash(input, n = 10) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, n).toUpperCase()
}

function makeCustomerId(businessId, memberId) {
  const biz = String(businessId).split('-').pop() || 'BIZ'
  return `CUS-${biz}-${stableHash(`${businessId}|${memberId}`, 10)}`
}

function makeCardId(businessId, memberId) {
  const biz = String(businessId).split('-').pop() || 'BIZ'
  return `LCR-${biz}-${stableHash(`${businessId}|${memberId}`, 10)}`
}

function makeProgramId(businessId) {
  const biz = String(businessId).split('-').pop() || 'BIZ'
  return `LPR-${biz}`
}

async function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { version: 1, businesses: {}, customers: {}, cards: {} }
  }
  return JSON.parse(await readFile(STATE_PATH, 'utf8'))
}

async function saveState(state) {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8')
}

async function ensureBusinessRuntime(state, businessId) {
  const b = state.businesses[businessId]
  if (!b) throw new Error(`Business not found: ${businessId}`)

  // Ensure in-memory business exists
  createBusiness({
    id: businessId,
    name: b.name,
    programName: b.programName,
    pointsLabel: b.pointsLabel,
    wallet: b.wallet
  })

  // Ensure program exists
  const programId = b.programId || makeProgramId(businessId)
  b.programId = programId

  const program = await createLoyaltyProgram({
    businessId,
    programId,
    programName: b.programName,
    site: b.site,
    countryCode: b.countryCode,
    homepageUrl: b.homepageUrl,
    locations: b.locations,
    metadata: {
      googleWallet: b.wallet?.googleWallet,
      appleWallet: b.wallet?.appleWallet
    }
  })

  // Ensure loyalty class exists (if creds exist)
  await getGoogleObject('parent', program)

  await saveState(state)
  return b
}

async function ensureCardForMember(state, businessId, memberId, fullName, issuance = {}) {
  await ensureBusinessRuntime(state, businessId)

  state.customers[businessId] ||= {}
  state.cards[businessId] ||= {}

  const customerId = makeCustomerId(businessId, memberId)
  const cardId = makeCardId(businessId, memberId)

  const customer = createCustomerAccount({
    id: customerId,
    businessId,
    fullName: fullName || state.customers[businessId][memberId]?.fullName || memberId,
    memberId
  })

  // Persist customer mapping
  state.customers[businessId][memberId] = {
    customerId: customer.id,
    fullName: customer.fullName,
    memberId: customer.memberId
  }

  const previous = state.cards[businessId][memberId]
  const initialPoints = Number(previous?.points ?? 0)

  const card = await issueLoyaltyCard({
    cardId,
    businessId,
    customerId: customer.id,
    initialPoints,
    metadata: {
      googleWallet: issuance.googleObjectOverrides
        ? { objectOverrides: issuance.googleObjectOverrides }
        : undefined,
      appleWallet: issuance.applePassOverrides
        ? { passOverrides: issuance.applePassOverrides }
        : undefined
    }
  })

  const { saveUrl } = await getGoogleObject('child', card)

  state.cards[businessId][memberId] = {
    cardId: card.id,
    points: card.points ?? 0,
    saveUrl
  }

  await saveState(state)
  return { customer, card, saveUrl }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (req.method === 'GET' && url.pathname === '/') {
      const html = await readFile(join(__dirname, 'loyalty-multi-admin.html'), 'utf8')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(html)
      return
    }

    if (req.method === 'GET' && url.pathname === '/state') {
      const state = await loadState()
      json(res, 200, state)
      return
    }

    // Create a business (tenant) with its own design
    if (req.method === 'POST' && url.pathname === '/business') {
      const state = await loadState()
      const body = await readBodyJson(req)

      const businessId = body.businessId || `BIZ-${stableHash(body.name || 'BIZ', 8)}`
      const name = body.name || 'Business'

      state.businesses[businessId] = {
        id: businessId,
        name,
        programName: body.programName || `${name} Rewards`,
        pointsLabel: body.pointsLabel || 'Points',
        site: body.site,
        countryCode: body.countryCode,
        homepageUrl: body.homepageUrl,
        locations: Array.isArray(body.locations) ? body.locations : undefined,
        wallet: {
          googleWallet: {
            issuerName: body.googleIssuerName || name,
            backgroundColor: body.googleBg || '#111827',
            logoUrl: body.logoUrl || 'https://placehold.co/256x256/png?text=LOGO',
            heroImageUrl: body.heroImageUrl,
            wordMarkUrl: body.wordMarkUrl,
            updateRequestUrl: body.updateRequestUrl,
            classOverrides: body.googleClassOverrides,
            ...(body.googleWalletOverrides || {})
          },
          appleWallet: {
            organizationName: name,
            logoText: body.appleLogoText || name,
            backgroundColor: body.appleBg,
            foregroundColor: body.appleFg,
            labelColor: body.appleLabel,
            passOverrides: body.applePassOverrides
          }
        }
      }

      await ensureBusinessRuntime(state, businessId)
      json(res, 200, { ok: true, businessId })
      return
    }

    // User claims/adds a card to wallet using THEIR own memberId
    if (req.method === 'POST' && url.pathname === '/wallet/save') {
      const state = await loadState()
      const body = await readBodyJson(req)

      const businessId = body.businessId
      const memberId = body.memberId
      if (!businessId) throw new Error('businessId is required')
      if (!memberId) throw new Error('memberId is required')

      const { customer, card, saveUrl } = await ensureCardForMember(
        state,
        businessId,
        memberId,
        body.fullName,
        {
          googleObjectOverrides: body.googleObjectOverrides,
          applePassOverrides: body.applePassOverrides
        }
      )
      json(res, 200, { businessId, customer, card, saveUrl })
      return
    }

    // Update points for a specific member under a business
    if (req.method === 'POST' && url.pathname === '/points') {
      const state = await loadState()
      const body = await readBodyJson(req)

      const businessId = body.businessId
      const memberId = body.memberId
      if (!businessId) throw new Error('businessId is required')
      if (!memberId) throw new Error('memberId is required')

      const entry = state.cards?.[businessId]?.[memberId]
      if (!entry?.cardId) throw new Error('Card not found for this memberId')

      const cardId = entry.cardId
      if (body.setPoints !== undefined) {
        const updated = await updateLoyaltyPoints({ cardId, setPoints: Number(body.setPoints) })
        entry.points = Number(updated.points ?? 0)
      } else if (body.delta !== undefined) {
        const updated = await updateLoyaltyPoints({ cardId, delta: Number(body.delta) })
        entry.points = Number(updated.points ?? 0)
      } else {
        throw new Error('Provide setPoints or delta')
      }

      // Refresh Save URL from latest card
      const latest = getPass(cardId) || null
      if (latest) {
        const { saveUrl } = await getGoogleObject('child', latest)
        entry.saveUrl = saveUrl
      }

      await saveState(state)
      json(res, 200, { ok: true, businessId, memberId, cardId, points: entry.points, saveUrl: entry.saveUrl })
      return
    }

    // Send a push-style message to the card (Google Wallet addMessage)
    if (req.method === 'POST' && url.pathname === '/message') {
      const state = await loadState()
      const body = await readBodyJson(req)

      const businessId = body.businessId
      const memberId = body.memberId
      if (!businessId) throw new Error('businessId is required')
      if (!memberId) throw new Error('memberId is required')

      const entry = state.cards?.[businessId]?.[memberId]
      if (!entry?.cardId) throw new Error('Card not found for this memberId')

      const header = body.header || 'Message'
      const messageBody = body.body
      if (!messageBody) throw new Error('body is required')

      const result = await pushLoyaltyMessage({
        cardId: entry.cardId,
        header,
        body: messageBody,
        messageType: body.messageType
      })

      json(res, 200, { ok: true, businessId, memberId, cardId: entry.cardId, objectId: result.objectId })
      return
    }

    json(res, 404, { error: 'Not found' })
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) })
  }
})

server.listen(PORT, () => {
  console.log(`✅ Loyalty multi-tenant server running: http://localhost:${PORT}`)
  console.log(`State file: ${STATE_PATH}`)
  console.log('Endpoints:')
  console.log('  POST /business        -> create a business (design/theme)')
  console.log('  POST /wallet/save     -> get Save URL for (businessId, memberId)')
  console.log('  POST /points          -> update points for (businessId, memberId)')
  console.log('  POST /message         -> add a Google Wallet message for (businessId, memberId)')
  console.log('  GET  /state           -> debug persisted state')
})
