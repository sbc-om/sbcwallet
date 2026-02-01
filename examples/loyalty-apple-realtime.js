/**
 * Apple Wallet Pass Server with Real-Time Updates
 * 
 * This server implements Apple's PassKit Web Service specification
 * to enable real-time pass updates without re-downloading.
 * 
 * Requirements:
 *   - HTTPS (Apple requires SSL for production)
 *   - APNs certificate for push notifications
 *   - Public URL accessible from Apple's servers
 * 
 * For local testing, use ngrok: ngrok http 3002
 * 
 * Environment Variables:
 *   APPLE_TEAM_ID, APPLE_PASS_TYPE_ID, APPLE_CERT_PATH, etc.
 *   APPLE_APNS_KEY_PATH   - Path to APNs auth key (.p8)
 *   APPLE_APNS_KEY_ID     - APNs Key ID
 *   PUBLIC_URL            - Public URL for webServiceURL (e.g., https://abc123.ngrok.io)
 *   PORT                  - Server port (default: 3002)
 */

import 'dotenv/config'
import http from 'http'
import https from 'https'
import http2 from 'http2'
import { URL } from 'url'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import {
  createBusiness,
  createCustomerAccount,
  createLoyaltyProgram,
  issueLoyaltyCard,
  updateLoyaltyPoints,
  getPkpassBuffer
} from '../dist/index.js'

const PORT = process.env.PORT || 3002
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`
const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID || 'pass.com.sbc.loyalty'

// APNs configuration - use sandbox for development
const USE_SANDBOX = process.env.APNS_SANDBOX !== 'false' // Default to sandbox
const APNS_HOST = USE_SANDBOX ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
const APNS_PORT = 443

// APNs Token-based authentication (.p8 key)
const APNS_KEY_ID = process.env.APPLE_APNS_KEY_ID || 'KDP29L8J65'
const APNS_TEAM_ID = process.env.APPLE_TEAM_ID || '542Y2ARGQJ'
const APNS_KEY_PATH = process.env.APPLE_APNS_KEY_PATH || './certs/AuthKey_KDP29L8J65.p8'

let apnsKey = null
let apnsJwtToken = null
let apnsJwtTokenTime = 0

try {
  apnsKey = fs.readFileSync(APNS_KEY_PATH, 'utf8')
  console.log(`✅ APNs Auth Key loaded (${USE_SANDBOX ? 'SANDBOX' : 'PRODUCTION'})`)
  console.log(`   Key ID: ${APNS_KEY_ID}`)
  console.log(`   Team ID: ${APNS_TEAM_ID}`)
} catch (err) {
  console.log('⚠️ APNs Auth Key not loaded - push notifications disabled')
  console.log('   Error:', err.message)
}

/**
 * Generate JWT token for APNs authentication
 * Token is valid for 1 hour, we cache it and regenerate after 50 minutes
 */
function getApnsJwtToken() {
  const now = Math.floor(Date.now() / 1000)
  
  // Reuse token if less than 50 minutes old
  if (apnsJwtToken && (now - apnsJwtTokenTime) < 3000) {
    return apnsJwtToken
  }
  
  // JWT Header
  const header = {
    alg: 'ES256',
    kid: APNS_KEY_ID
  }
  
  // JWT Payload
  const payload = {
    iss: APNS_TEAM_ID,
    iat: now
  }
  
  // Base64URL encode
  const base64url = (obj) => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  }
  
  const headerB64 = base64url(header)
  const payloadB64 = base64url(payload)
  const signingInput = `${headerB64}.${payloadB64}`
  
  // Sign with ES256 (ECDSA with P-256 and SHA-256)
  const sign = crypto.createSign('SHA256')
  sign.update(signingInput)
  sign.end()
  
  const signature = sign.sign(apnsKey)
  
  // Convert DER signature to raw r||s format for JWT
  // DER format: 0x30 [len] 0x02 [r-len] [r] 0x02 [s-len] [s]
  const derToRaw = (der) => {
    let offset = 2 // Skip 0x30 and length
    
    // Read r
    if (der[offset] !== 0x02) throw new Error('Invalid DER signature')
    offset++
    let rLen = der[offset++]
    let r = der.slice(offset, offset + rLen)
    offset += rLen
    
    // Read s
    if (der[offset] !== 0x02) throw new Error('Invalid DER signature')
    offset++
    let sLen = der[offset++]
    let s = der.slice(offset, offset + sLen)
    
    // Remove leading zeros if present (DER adds them for positive numbers)
    if (r.length === 33 && r[0] === 0) r = r.slice(1)
    if (s.length === 33 && s[0] === 0) s = s.slice(1)
    
    // Pad to 32 bytes each
    const rPadded = Buffer.alloc(32)
    const sPadded = Buffer.alloc(32)
    r.copy(rPadded, 32 - r.length)
    s.copy(sPadded, 32 - s.length)
    
    return Buffer.concat([rPadded, sPadded])
  }
  
  const rawSig = derToRaw(signature)
  const signatureB64 = rawSig.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  
  apnsJwtToken = `${signingInput}.${signatureB64}`
  apnsJwtTokenTime = now
  
  return apnsJwtToken
}

/**
 * Send APNs push notification using HTTP/2 with JWT authentication
 * For PassKit, we send an empty push to trigger the device to fetch the updated pass
 */
async function sendApnsPush(pushToken) {
  if (!apnsKey) {
    throw new Error('APNs Auth Key not configured')
  }

  return new Promise((resolve, reject) => {
    console.log(`   🔌 Connecting to APNs (${APNS_HOST})...`)
    
    let settled = false
    
    // Set a shorter timeout for initial connection
    const connectionTimeout = setTimeout(() => {
      if (!settled) {
        settled = true
        console.log('   ❌ APNs connection timeout (10s)')
        reject(new Error('APNs connection timeout'))
      }
    }, 10000)
    
    const client = http2.connect(`https://${APNS_HOST}:${APNS_PORT}`, {
      peerMaxConcurrentStreams: 1
    })
    
    const cleanup = () => {
      clearTimeout(connectionTimeout)
      if (!client.destroyed) {
        client.close()
      }
    }
    
    client.on('error', (err) => {
      console.log(`   ❌ APNs connection error: ${err.code || err.message}`)
      if (!settled) {
        settled = true
        cleanup()
        reject(err)
      }
    })
    
    client.on('connect', () => {
      clearTimeout(connectionTimeout)
      console.log('   ✅ APNs connection established')
      
      const jwt = getApnsJwtToken()
      
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${pushToken}`,
        'authorization': `bearer ${jwt}`,
        'apns-topic': PASS_TYPE_ID,
        'apns-push-type': 'background',
        'apns-priority': '5'
      })

      let responseData = ''
      
      req.on('response', (headers) => {
        const status = headers[':status']
        console.log(`   📡 APNs response status: ${status}`)
      
        if (status === 200) {
          if (!settled) {
            settled = true
            cleanup()
            resolve({ status, success: true })
          }
        } else {
          // Collect error response body
          req.on('data', (chunk) => {
            responseData += chunk
          })
          req.on('end', () => {
            console.log(`   📡 APNs response body: ${responseData}`)
            if (!settled) {
              settled = true
              cleanup()
              reject(new Error(`APNs returned status ${status}: ${responseData}`))
            }
          })
        }
      })

      req.on('error', (err) => {
        console.log(`   ❌ APNs request error: ${err.message}`)
        if (!settled) {
          settled = true
          cleanup()
          reject(err)
        }
      })

      // Empty payload for PassKit push (just sends notification, no data)
      req.end(JSON.stringify({}))
    })
    
    // Timeout for entire operation
    setTimeout(() => {
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error('APNs request timeout'))
      }
    }, 15000)
  })
}

// In-memory storage for demo
const businesses = new Map()
const customers = new Map()
const programs = new Map()
const cards = new Map()

// Device registrations: Map<serialNumber, Set<{ deviceLibraryId, pushToken }>>
const deviceRegistrations = new Map()

// Auth tokens for passes: Map<serialNumber, authToken>
const passAuthTokens = new Map()

// Pass update timestamps: Map<serialNumber, lastUpdated>
const passUpdateTimes = new Map()

// Initialize default business/program
let defaultBusiness = null
let defaultProgram = null

async function initDemo() {
  console.log('🍎 Initializing Apple Wallet Real-Time Update Server...\n')

  // Check credentials
  const hasAppleCreds = Boolean(
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_PASS_TYPE_ID &&
    process.env.APPLE_CERT_PATH &&
    process.env.APPLE_WWDR_PATH
  )

  if (!hasAppleCreds) {
    console.warn('⚠️  Apple Wallet credentials not fully configured!')
    console.warn('   Pass generation will fail without proper certificates.\n')
  }

  // Create default business
  defaultBusiness = createBusiness({
    name: process.env.LOYALTY_BUSINESS_NAME || 'SBC Coffee',
    programName: process.env.LOYALTY_PROGRAM_NAME || 'SBC Rewards',
    pointsLabel: process.env.LOYALTY_POINTS_LABEL || 'Points'
  })
  businesses.set(defaultBusiness.id, defaultBusiness)

  // Create default program with webServiceURL
  defaultProgram = await createLoyaltyProgram({
    businessId: defaultBusiness.id,
    site: process.env.LOYALTY_SITE || 'Downtown Branch',
    countryCode: process.env.LOYALTY_COUNTRY_CODE || 'IR',
    homepageUrl: process.env.LOYALTY_HOMEPAGE_URL || 'https://example.com',
    locations: [
      { latitude: 35.6892, longitude: 51.389 }
    ],
    metadata: {
      appleWallet: {
        backgroundColor: process.env.LOYALTY_BG || '#111827',
        foregroundColor: '#ffffff',
        labelColor: '#b4b4b4'
      }
    }
  })
  programs.set(defaultProgram.id, defaultProgram)

  console.log('✅ Business:', defaultBusiness.name)
  console.log('✅ Program:', defaultBusiness.programName)
  console.log('🌐 Public URL:', PUBLIC_URL)
  console.log('')
}

/**
 * Generate a secure auth token for a pass
 */
function generateAuthToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Create a new customer and issue a loyalty card with webServiceURL
 */
async function createCustomerCard(customerName) {
  const customer = createCustomerAccount({
    businessId: defaultBusiness.id,
    fullName: customerName
  })
  customers.set(customer.id, customer)

  // Generate auth token for this pass
  const authToken = generateAuthToken()

  // Only add webServiceURL if it's a real public URL (not localhost)
  // localhost URLs cause iOS to reject the pass
  const isPublicUrl = PUBLIC_URL && !PUBLIC_URL.includes('localhost') && !PUBLIC_URL.includes('127.0.0.1')

  const cardConfig = {
    businessId: defaultBusiness.id,
    customerId: customer.id,
    initialPoints: 10
  }

  // Only add real-time update metadata if we have a public URL
  if (isPublicUrl) {
    cardConfig.metadata = {
      appleWallet: {
        passOverrides: {
          webServiceURL: PUBLIC_URL,
          authenticationToken: authToken
        }
      }
    }
  }

  const card = await issueLoyaltyCard(cardConfig)
  cards.set(card.id, card)
  
  // Store auth token
  passAuthTokens.set(card.id, authToken)
  passUpdateTimes.set(card.id, Date.now())

  return { customer, card, authToken }
}

/**
 * Send push notification to all devices registered for a pass via APNs
 * Apple requires an empty push notification to trigger pass refresh
 * 
 * Note: If APNs is not reachable (network/firewall issues), the pass will still
 * be updated when the user manually refreshes or opens the Wallet app.
 */
async function sendPushNotification(serialNumber) {
  const registrations = deviceRegistrations.get(serialNumber)
  if (!registrations || registrations.size === 0) {
    console.log(`📱 No devices registered for pass ${serialNumber}`)
    return
  }

  // Check if APNs key is configured
  if (!apnsKey) {
    console.log(`📱 APNs not configured - pass updated, Wallet will sync on next refresh`)
    return
  }

  console.log(`📱 Sending push notification to ${registrations.size} device(s) for pass ${serialNumber}`)
  
  for (const reg of registrations) {
    if (!reg.pushToken) {
      console.log(`   ⚠️ No push token for device ${reg.deviceLibraryId.substring(0, 8)}...`)
      continue
    }
    
    try {
      await sendApnsPush(reg.pushToken)
      console.log(`   ✅ Push sent to device ${reg.deviceLibraryId.substring(0, 8)}...`)
    } catch (err) {
      // Log but don't fail - pass is still updated server-side
      console.log(`   ⚠️ Push skipped (${err.code || 'network issue'}) - Wallet will sync on next refresh`)
    }
  }
}

/**
 * Validate auth token from request
 */
function validateAuthToken(req, serialNumber) {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('ApplePass ')) {
    return false
  }
  
  const token = authHeader.substring(10) // Remove "ApplePass " prefix
  const expectedToken = passAuthTokens.get(serialNumber)
  
  return token === expectedToken
}

/**
 * Generate HTML page with form to create new passes
 */
function generateHtmlPage(baseUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🍎 Apple Wallet - Real-Time Updates</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      font-size: 2rem;
      margin-bottom: 10px;
    }
    .subtitle {
      text-align: center;
      color: #a0a0a0;
      margin-bottom: 30px;
    }
    .badge {
      display: inline-block;
      background: #22c55e;
      color: black;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: bold;
      margin-left: 8px;
    }
    .card {
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 20px;
      backdrop-filter: blur(10px);
    }
    .card h2 {
      margin-top: 0;
      font-size: 1.25rem;
      color: #4ade80;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: #d0d0d0;
    }
    input[type="text"], input[type="number"] {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(0,0,0,0.3);
      color: white;
      font-size: 1rem;
      margin-bottom: 16px;
    }
    input:focus {
      outline: none;
      border-color: #4ade80;
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #4ade80, #22c55e);
      border: none;
      border-radius: 8px;
      color: black;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }
    button:hover {
      transform: scale(1.02);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .pass-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .pass-item-expanded {
      background: rgba(0,0,0,0.2);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .pass-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .pass-info h3 {
      margin: 0 0 4px 0;
      font-size: 1.1rem;
    }
    .pass-info p {
      margin: 0;
      color: #a0a0a0;
      font-size: 0.85rem;
    }
    .points-display {
      background: linear-gradient(135deg, #4ade80, #22c55e);
      color: black;
      padding: 12px 20px;
      border-radius: 25px;
      font-weight: bold;
      font-size: 1.3rem;
      min-width: 100px;
      text-align: center;
    }
    .points-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .points-btn {
      flex: 1;
      min-width: 50px;
      padding: 12px 8px;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: transform 0.1s, opacity 0.2s;
    }
    .points-btn:hover:not(:disabled) {
      transform: scale(1.05);
    }
    .points-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .points-btn.add {
      background: #22c55e;
      color: white;
    }
    .points-btn.subtract {
      background: #ef4444;
      color: white;
    }
    .points-btn.custom {
      background: #3b82f6;
      color: white;
    }
    .custom-points-input {
      display: none;
      margin-bottom: 12px;
      gap: 8px;
    }
    .custom-points-input.show {
      display: flex;
    }
    .custom-points-input input {
      flex: 1;
      margin-bottom: 0;
    }
    .custom-points-input button {
      width: auto;
      padding: 12px 24px;
    }
    .pass-actions {
      display: flex;
      gap: 8px;
    }
    .action-btn {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 0.9rem;
    }
    .action-btn.download {
      background: black;
      color: white;
    }
    .action-btn.download:hover {
      background: #333;
    }
    .realtime-notice {
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(34, 197, 94, 0.4);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 12px;
      font-size: 0.85rem;
      color: #4ade80;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .realtime-notice .icon {
      font-size: 1.2rem;
    }
    .status-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      margin-right: 6px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .devices-info {
      font-size: 0.8rem;
      color: #a0a0a0;
      margin-top: 8px;
    }
    .instructions {
      background: rgba(74, 222, 128, 0.1);
      border: 1px solid rgba(74, 222, 128, 0.3);
      border-radius: 12px;
      padding: 20px;
      font-size: 0.9rem;
    }
    .instructions h3 {
      margin: 0 0 16px 0;
      color: #4ade80;
    }
    .instructions ol {
      margin: 0;
      padding-left: 20px;
    }
    .instructions li {
      margin-bottom: 10px;
      color: #d0d0d0;
    }
    .empty-state {
      text-align: center;
      color: #a0a0a0;
      padding: 30px;
    }
    #passResult {
      display: none;
      margin-top: 16px;
    }
    #passResult.show {
      display: block;
    }
    .update-animation {
      animation: updatePulse 0.5s ease-out;
    }
    @keyframes updatePulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); background: #fbbf24; }
      100% { transform: scale(1); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🍎 Apple Wallet <span class="badge">Real-Time</span></h1>
    <p class="subtitle">${defaultBusiness?.programName || 'Loyalty Program'}</p>

    <div class="card">
      <h2>✨ Create New Pass</h2>
      <form id="createForm">
        <label for="customerName">Customer Name</label>
        <input type="text" id="customerName" name="customerName" placeholder="Enter your name" required>
        <button type="submit">Generate Pass</button>
      </form>
      <div id="passResult">
        <div class="realtime-notice">
          <span class="icon">🔄</span>
          <span>Pass created with real-time updates enabled!</span>
        </div>
        <div class="pass-item-expanded" id="newPassItem">
          <div class="pass-header">
            <div class="pass-info">
              <h3 id="newPassName"></h3>
              <p id="newPassInfo"></p>
            </div>
            <div class="points-display" id="newPassPoints">10 pts</div>
          </div>
          <div class="pass-actions">
            <a href="#" id="newPassDownload" class="action-btn download">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Add to Wallet
            </a>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>📋 Manage Passes</h2>
      <ul class="pass-list" id="passList">
        <li class="empty-state">No passes created yet</li>
      </ul>
    </div>

    <div class="instructions">
      <h3>🔄 Real-Time Updates</h3>
      <ol>
        <li><strong>Create a pass</strong> and add it to your Apple Wallet</li>
        <li><strong>Change points</strong> using the buttons below each pass</li>
        <li><strong>Watch your Wallet</strong> - the pass will update automatically!</li>
        <li>For local testing, use <code>ngrok http ${PORT}</code> and set PUBLIC_URL</li>
      </ol>
      <p style="margin-top: 16px; color: #fbbf24; font-size: 0.85rem;">
        ⚠️ Note: Real-time updates require HTTPS and APNs push notifications.
        For full functionality, deploy to a server with SSL certificate.
      </p>
    </div>
  </div>

  <script>
    const passes = []

    document.getElementById('createForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const name = document.getElementById('customerName').value.trim()
      if (!name) return

      const btn = e.target.querySelector('button')
      btn.textContent = 'Creating...'
      btn.disabled = true

      try {
        const res = await fetch('/api/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerName: name })
        })
        const data = await res.json()
        
        if (data.error) {
          alert('Error: ' + data.error)
          return
        }

        // Show result
        document.getElementById('newPassName').textContent = name
        document.getElementById('newPassInfo').textContent = 'ID: ' + data.cardId
        document.getElementById('newPassPoints').textContent = data.points + ' pts'
        document.getElementById('newPassDownload').href = '/pass/' + data.cardId
        document.getElementById('passResult').classList.add('show')

        // Add to list
        passes.unshift({ 
          name, 
          cardId: data.cardId, 
          points: data.points,
          devices: 0,
          updating: false
        })
        updatePassList()

        // Clear form
        document.getElementById('customerName').value = ''
      } catch (err) {
        alert('Error creating pass: ' + err.message)
      } finally {
        btn.textContent = 'Generate Pass'
        btn.disabled = false
      }
    })

    async function updatePoints(cardId, delta) {
      const pass = passes.find(p => p.cardId === cardId)
      if (!pass || pass.updating) return
      
      pass.updating = true
      updatePassList()

      try {
        const res = await fetch('/api/points/' + cardId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delta })
        })
        const data = await res.json()
        
        if (data.error) {
          alert('Error: ' + data.error)
          return
        }

        // Update local pass data
        pass.points = data.points
        pass.devices = data.registeredDevices || 0
        
        // Animate the points display
        const pointsEl = document.getElementById('points-' + cardId)
        if (pointsEl) {
          pointsEl.classList.add('update-animation')
          setTimeout(() => pointsEl.classList.remove('update-animation'), 500)
        }
        
        updatePassList()
      } catch (err) {
        alert('Error updating points: ' + err.message)
      } finally {
        pass.updating = false
        updatePassList()
      }
    }

    function showCustomInput(cardId) {
      const input = document.getElementById('custom-input-' + cardId)
      if (input) {
        input.classList.toggle('show')
      }
    }

    async function applyCustomPoints(cardId) {
      const input = document.getElementById('custom-value-' + cardId)
      if (!input) return
      
      const value = parseInt(input.value, 10)
      if (isNaN(value)) {
        alert('Please enter a valid number')
        return
      }
      
      await updatePoints(cardId, value)
      input.value = ''
      document.getElementById('custom-input-' + cardId).classList.remove('show')
    }

    function updatePassList() {
      const list = document.getElementById('passList')
      if (passes.length === 0) {
        list.innerHTML = '<li class="empty-state">No passes created yet</li>'
        return
      }
      list.innerHTML = passes.map(p => \`
        <li class="pass-item-expanded">
          <div class="pass-header">
            <div class="pass-info">
              <h3>\${p.name}</h3>
              <p>ID: \${p.cardId}</p>
            </div>
            <div class="points-display \${p.updating ? 'update-animation' : ''}" id="points-\${p.cardId}">
              \${p.updating ? '...' : p.points + ' pts'}
            </div>
          </div>
          
          <div class="realtime-notice">
            <span class="status-indicator"></span>
            <span>Real-time updates enabled</span>
            \${p.devices > 0 ? '<span style="margin-left: auto;">' + p.devices + ' device(s) synced</span>' : ''}
          </div>
          
          <div class="points-controls">
            <button class="points-btn subtract" onclick="updatePoints('\${p.cardId}', -10)" \${p.updating ? 'disabled' : ''}>-10</button>
            <button class="points-btn subtract" onclick="updatePoints('\${p.cardId}', -1)" \${p.updating ? 'disabled' : ''}>-1</button>
            <button class="points-btn add" onclick="updatePoints('\${p.cardId}', 1)" \${p.updating ? 'disabled' : ''}>+1</button>
            <button class="points-btn add" onclick="updatePoints('\${p.cardId}', 10)" \${p.updating ? 'disabled' : ''}>+10</button>
            <button class="points-btn add" onclick="updatePoints('\${p.cardId}', 50)" \${p.updating ? 'disabled' : ''}>+50</button>
            <button class="points-btn custom" onclick="showCustomInput('\${p.cardId}')" \${p.updating ? 'disabled' : ''}>±</button>
          </div>
          
          <div class="custom-points-input" id="custom-input-\${p.cardId}">
            <input type="number" id="custom-value-\${p.cardId}" placeholder="Enter points (e.g. 25 or -15)">
            <button onclick="applyCustomPoints('\${p.cardId}')" \${p.updating ? 'disabled' : ''}>Apply</button>
          </div>
          
          <div class="pass-actions">
            <a href="/pass/\${p.cardId}" class="action-btn download">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Add to Wallet
            </a>
          </div>
        </li>
      \`).join('')
    }
  </script>
</body>
</html>`
}

/**
 * HTTP Server with Apple PassKit Web Service endpoints
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    // ==========================================
    // Web UI Endpoints
    // ==========================================
    
    // Home page
    if (path === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(generateHtmlPage(`http://localhost:${PORT}`))
      return
    }

    // Direct download page (for Safari troubleshooting)
    if (path === '/download' && req.method === 'GET') {
      const cardsList = Array.from(cards.values())
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download Pass - Safari</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 20px; background: #1a1a2e; color: white; }
    a { display: block; padding: 15px; margin: 10px 0; background: #22c55e; color: black; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold; }
    a:hover { background: #16a34a; }
    .info { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>🍎 Download Pass (Safari)</h1>
  <div class="info">
    <p><strong>Tip:</strong> On iOS, tap the link to add to Wallet. On macOS, the file will download.</p>
  </div>
  ${cardsList.length === 0 ? '<p>No passes created. Go back and create one first.</p>' : ''}
  ${cardsList.map(c => '<a href="/pass/' + c.id + '">' + c.id + ' - Download .pkpass</a>').join('')}
  <br><a href="/" style="background: #3b82f6;">← Back to Main Page</a>
</body>
</html>`
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    // Create new pass
    if (path === '/api/create' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { customerName } = JSON.parse(body)

      if (!customerName) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'customerName is required' }))
        return
      }

      const { customer, card, authToken } = await createCustomerCard(customerName)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        customerId: customer.id,
        cardId: card.id,
        memberId: card.memberId,
        points: card.points,
        downloadUrl: `/pass/${card.id}`,
        webServiceURL: PUBLIC_URL,
        authToken: authToken
      }))
      return
    }

    // Download .pkpass file
    if (path.startsWith('/pass/') && req.method === 'GET') {
      const cardId = path.replace('/pass/', '')
      const card = cards.get(cardId)

      if (!card) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Card not found' }))
        return
      }

      try {
        // Only add webServiceURL if it's a real public URL (not localhost)
        // localhost URLs cause iOS to reject the pass
        const isPublicUrl = PUBLIC_URL && !PUBLIC_URL.includes('localhost') && !PUBLIC_URL.includes('127.0.0.1')
        
        if (isPublicUrl) {
          const authToken = passAuthTokens.get(cardId) || generateAuthToken()
          passAuthTokens.set(cardId, authToken)
          
          // Update card metadata with web service info
          card.metadata = card.metadata || {}
          card.metadata.appleWallet = card.metadata.appleWallet || {}
          card.metadata.appleWallet.passOverrides = {
            ...card.metadata.appleWallet.passOverrides,
            webServiceURL: PUBLIC_URL,
            authenticationToken: authToken
          }
        }

        const pkpassBuffer = await getPkpassBuffer('child', card)

        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `inline; filename="${cardId}.pkpass"`,
          'Content-Length': pkpassBuffer.length,
          'Last-Modified': new Date(passUpdateTimes.get(cardId) || Date.now()).toUTCString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        })
        res.end(pkpassBuffer)
      } catch (err) {
        console.error('Error generating .pkpass:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          error: 'Failed to generate pass',
          message: err.message
        }))
      }
      return
    }

    // Update points (from web UI)
    if (path.startsWith('/api/points/') && req.method === 'POST') {
      const cardId = path.replace('/api/points/', '')
      const card = cards.get(cardId)

      if (!card) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Card not found' }))
        return
      }

      let body = ''
      for await (const chunk of req) body += chunk
      const { delta } = JSON.parse(body)

      const updated = await updateLoyaltyPoints({
        cardId: card.id,
        delta: Number(delta) || 0
      })
      cards.set(card.id, updated)
      
      // Update the timestamp
      passUpdateTimes.set(cardId, Date.now())

      // Send push notification to registered devices
      await sendPushNotification(cardId)

      // Count registered devices
      const registrations = deviceRegistrations.get(cardId)
      const registeredDevices = registrations ? registrations.size : 0

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        cardId: updated.id,
        points: updated.points,
        downloadUrl: `/pass/${updated.id}`,
        registeredDevices,
        pushSent: registeredDevices > 0
      }))
      return
    }

    // List all cards
    if (path === '/api/cards' && req.method === 'GET') {
      const allCards = Array.from(cards.values()).map(c => ({
        id: c.id,
        memberId: c.memberId,
        points: c.points,
        downloadUrl: `/pass/${c.id}`
      }))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ cards: allCards }))
      return
    }

    // ==========================================
    // Apple PassKit Web Service Endpoints
    // https://developer.apple.com/documentation/walletpasses/adding_a_web_service_to_update_passes
    // ==========================================

    // Register device for push notifications
    // POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
    const registerMatch = path.match(/^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)\/([^/]+)$/)
    if (registerMatch && req.method === 'POST') {
      const [, deviceLibraryId, passTypeId, serialNumber] = registerMatch
      
      console.log(`📱 Device registration: ${deviceLibraryId.substring(0, 8)}... for pass ${serialNumber}`)

      // Validate auth token
      if (!validateAuthToken(req, serialNumber)) {
        console.log('   ❌ Invalid auth token')
        res.writeHead(401)
        res.end()
        return
      }

      // Read push token from body
      let body = ''
      for await (const chunk of req) body += chunk
      const { pushToken } = body ? JSON.parse(body) : {}

      // Store registration
      if (!deviceRegistrations.has(serialNumber)) {
        deviceRegistrations.set(serialNumber, new Set())
      }
      deviceRegistrations.get(serialNumber).add({ deviceLibraryId, pushToken })

      console.log(`   ✅ Registered. Push token: ${pushToken ? pushToken.substring(0, 16) + '...' : 'none'}`)

      // Return 201 for new registration, 200 for existing
      res.writeHead(201)
      res.end()
      return
    }

    // Unregister device
    // DELETE /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
    if (registerMatch && req.method === 'DELETE') {
      const [, deviceLibraryId, passTypeId, serialNumber] = registerMatch
      
      console.log(`📱 Device unregistration: ${deviceLibraryId.substring(0, 8)}... for pass ${serialNumber}`)

      // Validate auth token
      if (!validateAuthToken(req, serialNumber)) {
        res.writeHead(401)
        res.end()
        return
      }

      // Remove registration
      const registrations = deviceRegistrations.get(serialNumber)
      if (registrations) {
        for (const reg of registrations) {
          if (reg.deviceLibraryId === deviceLibraryId) {
            registrations.delete(reg)
            break
          }
        }
      }

      res.writeHead(200)
      res.end()
      return
    }

    // Get list of passes for device (for update check)
    // GET /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}?passesUpdatedSince={tag}
    const listPassesMatch = path.match(/^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)$/)
    if (listPassesMatch && req.method === 'GET') {
      const [, deviceLibraryId, passTypeId] = listPassesMatch
      const passesUpdatedSince = url.searchParams.get('passesUpdatedSince')
      
      console.log(`📱 List passes for device: ${deviceLibraryId.substring(0, 8)}... since ${passesUpdatedSince || 'beginning'}`)

      // Find all passes registered to this device that have been updated
      const updatedPasses = []
      const sinceTime = passesUpdatedSince ? parseInt(passesUpdatedSince, 10) : 0

      for (const [serialNumber, registrations] of deviceRegistrations) {
        for (const reg of registrations) {
          if (reg.deviceLibraryId === deviceLibraryId) {
            const updateTime = passUpdateTimes.get(serialNumber) || 0
            if (updateTime > sinceTime) {
              updatedPasses.push(serialNumber)
            }
          }
        }
      }

      if (updatedPasses.length === 0) {
        res.writeHead(204) // No content - no updates
        res.end()
        return
      }

      const lastUpdated = Math.max(...updatedPasses.map(sn => passUpdateTimes.get(sn) || 0))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        serialNumbers: updatedPasses,
        lastUpdated: String(lastUpdated)
      }))
      return
    }

    // Get latest version of a pass
    // GET /v1/passes/{passTypeIdentifier}/{serialNumber}
    const getPassMatch = path.match(/^\/v1\/passes\/([^/]+)\/([^/]+)$/)
    if (getPassMatch && req.method === 'GET') {
      const [, passTypeId, serialNumber] = getPassMatch
      
      console.log(`📱 Get pass: ${serialNumber}`)

      // Validate auth token
      if (!validateAuthToken(req, serialNumber)) {
        console.log('   ❌ Invalid auth token')
        res.writeHead(401)
        res.end()
        return
      }

      const card = cards.get(serialNumber)
      if (!card) {
        res.writeHead(404)
        res.end()
        return
      }

      // Check If-Modified-Since header
      const ifModifiedSince = req.headers['if-modified-since']
      const serverTime = passUpdateTimes.get(serialNumber) || Date.now()
      
      if (ifModifiedSince) {
        const clientTime = new Date(ifModifiedSince).getTime()
        console.log(`   📅 If-Modified-Since: ${ifModifiedSince} (${clientTime})`)
        console.log(`   📅 Server time: ${new Date(serverTime).toUTCString()} (${serverTime})`)
        
        // Only return 304 if server time is NOT newer than client time
        if (serverTime <= clientTime) {
          console.log('   ✅ Not modified (304)')
          res.writeHead(304) // Not modified
          res.end()
          return
        }
        console.log('   🔄 Pass has been modified, sending new version')
      }

      try {
        // Only add webServiceURL for real public URLs
        const isPublicUrl = PUBLIC_URL && !PUBLIC_URL.includes('localhost') && !PUBLIC_URL.includes('127.0.0.1')
        
        if (isPublicUrl) {
          const authToken = passAuthTokens.get(serialNumber)
          card.metadata = card.metadata || {}
          card.metadata.appleWallet = card.metadata.appleWallet || {}
          card.metadata.appleWallet.passOverrides = {
            ...card.metadata.appleWallet.passOverrides,
            webServiceURL: PUBLIC_URL,
            authenticationToken: authToken
          }
        }

        const pkpassBuffer = await getPkpassBuffer('child', card)

        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Length': pkpassBuffer.length,
          'Last-Modified': new Date(passUpdateTimes.get(serialNumber) || Date.now()).toUTCString(),
          'Cache-Control': 'no-cache'
        })
        res.end(pkpassBuffer)
        console.log('   ✅ Pass sent')
      } catch (err) {
        console.error('   ❌ Error generating pass:', err)
        res.writeHead(500)
        res.end()
      }
      return
    }

    // Log endpoint (for debugging)
    // POST /v1/log
    if (path === '/v1/log' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { logs } = JSON.parse(body)
      
      console.log('📱 Apple Wallet logs:')
      if (logs) {
        logs.forEach(log => console.log('   ', log))
      }

      res.writeHead(200)
      res.end()
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))

  } catch (err) {
    console.error('Server error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Internal server error', message: err.message }))
  }
})

// Start server
initDemo().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`)
    console.log(`\n📱 Apple PassKit Web Service endpoints:`)
    console.log(`   POST   /v1/devices/{deviceId}/registrations/{passTypeId}/{serialNumber}`)
    console.log(`   DELETE /v1/devices/{deviceId}/registrations/{passTypeId}/{serialNumber}`)
    console.log(`   GET    /v1/devices/{deviceId}/registrations/{passTypeId}`)
    console.log(`   GET    /v1/passes/{passTypeId}/{serialNumber}`)
    console.log(`   POST   /v1/log`)
    console.log(`\n🌐 For real-time updates, run: ngrok http ${PORT}`)
    console.log(`   Then set PUBLIC_URL=https://your-ngrok-url.ngrok.io`)
  })
}).catch(err => {
  console.error('Failed to initialize:', err)
  process.exit(1)
})
