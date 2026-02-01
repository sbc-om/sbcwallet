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
 *   APNS_RELAY_URL        - Cloudflare Worker URL for APNs relay (recommended for restricted networks)
 *   APNS_RELAY_SECRET     - Secret for relay authentication
 *   APNS_SOCKS5_HOST      - SOCKS5 proxy host (e.g., 127.0.0.1)
 *   APNS_SOCKS5_PORT      - SOCKS5 proxy port (e.g., 10808 for V2Ray)
 */

import 'dotenv/config'
import http from 'http'
import https from 'https'
import http2 from 'http2'
import tls from 'tls'
import net from 'net'
import { URL } from 'url'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { SocksClient } from 'socks'

// Proxy/Relay configuration for APNs (to bypass network restrictions)
// Option 1: APNS_SOCKS5 - Use SOCKS5 proxy (V2Ray, Clash, etc.) - RECOMMENDED
// Option 2: APNS_RELAY_URL - Use Cloudflare Worker relay
// Option 3: APNS_PROXY - Use HTTP proxy with CONNECT tunnel
const APNS_SOCKS5_HOST = process.env.APNS_SOCKS5_HOST || ''
const APNS_SOCKS5_PORT = parseInt(process.env.APNS_SOCKS5_PORT || '10808')
const APNS_RELAY_URL = process.env.APNS_RELAY_URL
const APNS_RELAY_SECRET = process.env.APNS_RELAY_SECRET || ''
const APNS_PROXY = process.env.APNS_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy

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
const APNS_PRIORITY = process.env.APNS_PRIORITY || '10'

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
  if (APNS_SOCKS5_HOST) {
    console.log(`   🧦 SOCKS5: ${APNS_SOCKS5_HOST}:${APNS_SOCKS5_PORT}`)
  } else if (APNS_RELAY_URL) {
    console.log(`   🌐 Relay: ${APNS_RELAY_URL}`)
  } else if (APNS_PROXY) {
    console.log(`   🌐 Proxy: ${APNS_PROXY}`)
  }
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
 * Connect to APNs through HTTP proxy using CONNECT tunnel
 */
function connectThroughProxy(proxyUrl, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl)
    const proxyHost = proxy.hostname
    const proxyPort = parseInt(proxy.port) || 80
    
    console.log(`   🔗 Connecting through proxy ${proxyHost}:${proxyPort}...`)
    
    const socket = net.connect(proxyPort, proxyHost, () => {
      socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`)
      socket.write(`Host: ${targetHost}:${targetPort}\r\n`)
      socket.write(`\r\n`)
    })
    
    socket.once('data', (data) => {
      const response = data.toString()
      if (response.includes('200')) {
        console.log(`   ✅ Proxy tunnel established`)
        // Upgrade to TLS
        const tlsSocket = tls.connect({
          socket: socket,
          servername: targetHost,
          ALPNProtocols: ['h2']
        }, () => {
          resolve(tlsSocket)
        })
        tlsSocket.on('error', reject)
      } else {
        reject(new Error(`Proxy CONNECT failed: ${response.split('\r\n')[0]}`))
      }
    })
    
    socket.on('error', reject)
    socket.setTimeout(10000, () => {
      socket.destroy()
      reject(new Error('Proxy connection timeout'))
    })
  })
}

/**
 * Send APNs push via Cloudflare Worker relay
 * This is the recommended method for networks with restricted access to Apple servers
 */
async function sendApnsPushViaRelay(pushToken) {
  const jwt = getApnsJwtToken()
  
  console.log(`   🌐 Sending via relay: ${APNS_RELAY_URL}`)
  
  const response = await fetch(APNS_RELAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Relay-Secret': APNS_RELAY_SECRET
    },
    body: JSON.stringify({
      pushToken,
      jwt,
      topic: PASS_TYPE_ID,
      sandbox: USE_SANDBOX,
      priority: parseInt(APNS_PRIORITY)
    })
  })
  
  const result = await response.json()
  
  if (result.success) {
    console.log(`   ✅ Push sent via relay (status: ${result.status})`)
    return { status: result.status, success: true }
  } else {
    throw new Error(`Relay error: ${result.error || result.apnsResponse || 'Unknown error'}`)
  }
}

/**
 * Connect to APNs through SOCKS5 proxy (V2Ray, Clash, etc.)
 */
async function connectThroughSocks5(targetHost, targetPort) {
  console.log(`   🧦 Connecting via SOCKS5 ${APNS_SOCKS5_HOST}:${APNS_SOCKS5_PORT}...`)
  
  const { socket } = await SocksClient.createConnection({
    proxy: {
      host: APNS_SOCKS5_HOST,
      port: APNS_SOCKS5_PORT,
      type: 5
    },
    command: 'connect',
    destination: {
      host: targetHost,
      port: targetPort
    },
    timeout: 10000
  })
  
  console.log(`   ✅ SOCKS5 tunnel established`)
  
  // Upgrade to TLS with ALPN for HTTP/2
  const tlsSocket = tls.connect({
    socket: socket,
    servername: targetHost,
    ALPNProtocols: ['h2']
  })
  
  return new Promise((resolve, reject) => {
    tlsSocket.on('secureConnect', () => {
      console.log(`   ✅ TLS handshake complete (ALPN: ${tlsSocket.alpnProtocol})`)
      resolve(tlsSocket)
    })
    tlsSocket.on('error', reject)
  })
}

/**
 * Send APNs push via SOCKS5 proxy (V2Ray, Clash, etc.)
 */
async function sendApnsPushViaSocks5(pushToken) {
  const jwt = getApnsJwtToken()
  
  try {
    const tlsSocket = await connectThroughSocks5(APNS_HOST, APNS_PORT)
    
    return new Promise((resolve, reject) => {
      const client = http2.connect(`https://${APNS_HOST}:${APNS_PORT}`, {
        createConnection: () => tlsSocket,
        peerMaxConcurrentStreams: 1
      })
      
      client.on('error', (err) => {
        console.log(`   ❌ HTTP/2 error: ${err.message}`)
        reject(err)
      })
      
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${pushToken}`,
        'authorization': `bearer ${jwt}`,
        'apns-topic': PASS_TYPE_ID,
        'apns-push-type': 'background',
        'apns-priority': APNS_PRIORITY
      })
      
      let responseData = ''
      
      req.on('response', (headers) => {
        const status = headers[':status']
        console.log(`   📡 APNs response status: ${status}`)
        
        if (status === 200) {
          client.close()
          resolve({ status, success: true })
        }
      })
      
      req.on('data', (chunk) => {
        responseData += chunk
      })
      
      req.on('end', () => {
        if (responseData) {
          console.log(`   📡 APNs response: ${responseData}`)
        }
        client.close()
      })
      
      req.on('error', (err) => {
        console.log(`   ❌ Request error: ${err.message}`)
        client.close()
        reject(err)
      })
      
      req.end(JSON.stringify({}))
    })
  } catch (err) {
    console.log(`   ❌ SOCKS5 error: ${err.message}`)
    throw err
  }
}

/**
 * Send APNs push notification using HTTP/2 with JWT authentication
 * For PassKit, we send an empty push to trigger the device to fetch the updated pass
 * Supports: 1) SOCKS5 proxy (V2Ray), 2) Cloudflare Worker relay, 3) HTTP proxy, 4) Direct connection
 */
async function sendApnsPush(pushToken) {
  if (!apnsKey) {
    throw new Error('APNs Auth Key not configured')
  }

  // Method 1: Use SOCKS5 proxy (V2Ray, Clash, etc.) - BEST for restricted networks
  if (APNS_SOCKS5_HOST) {
    return sendApnsPushViaSocks5(pushToken)
  }

  // Method 2: Use Cloudflare Worker relay
  if (APNS_RELAY_URL) {
    return sendApnsPushViaRelay(pushToken)
  }

  // Method 3 & 4: Direct or via HTTP proxy
  return new Promise(async (resolve, reject) => {
    console.log(`   🔌 Connecting to APNs (${APNS_HOST})...`)
    if (APNS_PROXY) {
      console.log(`   🌐 Using proxy: ${APNS_PROXY}`)
    }
    
    let settled = false
    
    // Set a shorter timeout for initial connection
    const connectionTimeout = setTimeout(() => {
      if (!settled) {
        settled = true
        console.log('   ❌ APNs connection timeout (10s)')
        reject(new Error('APNs connection timeout'))
      }
    }, 10000)
    
    let client
    
    try {
      if (APNS_PROXY) {
        // Connect through proxy
        const tlsSocket = await connectThroughProxy(APNS_PROXY, APNS_HOST, APNS_PORT)
        client = http2.connect(`https://${APNS_HOST}:${APNS_PORT}`, {
          createConnection: () => tlsSocket,
          peerMaxConcurrentStreams: 1
        })
      } else {
        // Direct connection
        client = http2.connect(`https://${APNS_HOST}:${APNS_PORT}`, {
          peerMaxConcurrentStreams: 1
        })
      }
    } catch (err) {
      clearTimeout(connectionTimeout)
      console.log(`   ❌ Connection setup error: ${err.message}`)
      reject(err)
      return
    }
    
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
        'apns-priority': APNS_PRIORITY
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
  <title>🍎 Apple Wallet - Pass Management</title>
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
    .container { max-width: 900px; margin: 0 auto; }
    h1 { text-align: center; font-size: 2rem; margin-bottom: 10px; }
    .subtitle { text-align: center; color: #a0a0a0; margin-bottom: 30px; }
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
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      padding-bottom: 10px;
    }
    .tab {
      padding: 10px 20px;
      background: rgba(255,255,255,0.05);
      border: none;
      border-radius: 8px 8px 0 0;
      color: #a0a0a0;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    .tab.active { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
    .tab:hover { background: rgba(255,255,255,0.1); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .card {
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 20px;
      backdrop-filter: blur(10px);
    }
    .card h2 { margin-top: 0; font-size: 1.25rem; color: #4ade80; }
    .card h3 { margin-top: 0; font-size: 1rem; color: #60a5fa; margin-bottom: 16px; }
    label { display: block; margin-bottom: 6px; color: #d0d0d0; font-size: 0.85rem; }
    input[type="text"], input[type="number"], input[type="color"], select, textarea {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(0,0,0,0.3);
      color: white;
      font-size: 0.95rem;
      margin-bottom: 12px;
    }
    input[type="color"] { height: 45px; padding: 4px; cursor: pointer; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #4ade80; }
    textarea { resize: vertical; min-height: 80px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .back-field-item { 
      background: rgba(0,0,0,0.15); 
      padding: 12px; 
      border-radius: 8px; 
      margin-bottom: 10px;
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 10px;
      align-items: start;
    }
    .back-field-item input { margin: 0; }
    .back-field-item textarea { margin: 0; min-height: 50px; }
    .back-field-row {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 10px;
      margin-bottom: 8px;
      background: rgba(0,0,0,0.1);
      padding: 8px 12px;
      border-radius: 6px;
    }
    .back-label-input { font-size: 0.85rem; padding: 8px; }
    .back-value-input { font-size: 0.85rem; padding: 8px; min-height: 40px; resize: vertical; }
    #backFieldsContainer { max-height: 400px; overflow-y: auto; padding-right: 8px; }
    button, .btn {
      padding: 12px 20px;
      background: linear-gradient(135deg, #4ade80, #22c55e);
      border: none;
      border-radius: 8px;
      color: black;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
      text-decoration: none;
      display: inline-block;
      text-align: center;
    }
    button:hover, .btn:hover { transform: scale(1.02); }
    button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-secondary { background: linear-gradient(135deg, #60a5fa, #3b82f6); }
    .btn-danger { background: linear-gradient(135deg, #f87171, #ef4444); }
    .btn-small { padding: 8px 14px; font-size: 0.85rem; }
    .pass-list { list-style: none; padding: 0; margin: 0; }
    .pass-card {
      background: rgba(0,0,0,0.2);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .pass-preview {
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      position: relative;
      min-height: 200px;
    }
    .pass-preview-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
    }
    .pass-preview-logo {
      width: 50px;
      height: 50px;
      border-radius: 10px;
      object-fit: cover;
      background: rgba(255,255,255,0.2);
    }
    .pass-preview-name { font-size: 0.85rem; opacity: 0.9; }
    .pass-preview-member { font-size: 0.75rem; opacity: 0.7; }
    .pass-preview-points {
      font-size: 2.5rem;
      font-weight: bold;
      text-align: center;
      margin: 20px 0;
    }
    .pass-preview-label { font-size: 0.7rem; opacity: 0.6; text-transform: uppercase; }
    .pass-preview-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .pass-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .pass-info h4 { margin: 0 0 4px 0; font-size: 1.1rem; }
    .pass-info p { margin: 0; color: #a0a0a0; font-size: 0.85rem; }
    .points-display {
      background: linear-gradient(135deg, #4ade80, #22c55e);
      color: black;
      padding: 10px 18px;
      border-radius: 25px;
      font-weight: bold;
      font-size: 1.2rem;
    }
    .points-controls {
      display: flex;
      gap: 6px;
      margin: 12px 0;
      flex-wrap: wrap;
    }
    .points-btn {
      flex: 1;
      min-width: 45px;
      padding: 10px 6px;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .points-btn.add { background: #22c55e; color: white; }
    .points-btn.subtract { background: #ef4444; color: white; }
    .points-btn.custom { background: #3b82f6; color: white; }
    .points-btn:disabled { opacity: 0.5; }
    .actions-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(34, 197, 94, 0.2);
      color: #4ade80;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .update-animation { animation: updatePulse 0.5s ease-out; }
    @keyframes updatePulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); background: #fbbf24; }
      100% { transform: scale(1); }
    }
    .color-preview {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }
    .color-swatch {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      border: 2px solid rgba(255,255,255,0.3);
    }
    .empty-state {
      text-align: center;
      color: #a0a0a0;
      padding: 40px;
    }
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .modal-overlay.show { display: flex; }
    .modal {
      background: #1e293b;
      border-radius: 16px;
      padding: 24px;
      max-width: 500px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
    }
    .modal h3 { margin-top: 0; color: #4ade80; }
    .modal-actions { display: flex; gap: 10px; margin-top: 20px; }
    .modal-actions button { flex: 1; }
    #passResult { display: none; margin-top: 16px; }
    #passResult.show { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🍎 Apple Wallet <span class="badge">Real-Time</span></h1>
    <p class="subtitle">\${defaultBusiness?.programName || 'Loyalty Program'} - Pass Management</p>

    <div class="tabs">
      <button class="tab active" onclick="showTab('passes')">📋 Passes</button>
      <button class="tab" onclick="showTab('create')">✨ Create New</button>
      <button class="tab" onclick="showTab('messages')">📨 Messages</button>
      <button class="tab" onclick="showTab('settings')">⚙️ Settings</button>
    </div>

    <!-- Passes Tab -->
    <div id="tab-passes" class="tab-content active">
      <div class="card">
        <h2>📋 Active Passes</h2>
        <ul class="pass-list" id="passList">
          <li class="empty-state">No passes created yet. Go to "Create New" tab.</li>
        </ul>
      </div>
    </div>

    <!-- Create Tab -->
    <div id="tab-create" class="tab-content">
      <div class="card">
        <h2>✨ Create New Pass</h2>
        <form id="createForm">
          <div class="form-row">
            <div>
              <label>Customer Name *</label>
              <input type="text" id="customerName" placeholder="Enter customer name" required>
            </div>
            <div>
              <label>Initial Points</label>
              <input type="number" id="initialPoints" value="10" min="0">
            </div>
          </div>
          
          <h3>🎨 Appearance</h3>
          <div class="form-row-3">
            <div>
              <label>Background Color</label>
              <input type="color" id="bgColor" value="#111827">
            </div>
            <div>
              <label>Text Color</label>
              <input type="color" id="fgColor" value="#ffffff">
            </div>
            <div>
              <label>Label Color</label>
              <input type="color" id="labelColor" value="#b4b4b4">
            </div>
          </div>
          
          <h3>🖼️ Logo & Icon</h3>
          <div class="form-row">
            <div>
              <label>Logo URL (160×50 PNG recommended)</label>
              <input type="text" id="logoUrl" placeholder="https://example.com/logo.png">
            </div>
            <div>
              <label>Icon URL (87×87 PNG recommended)</label>
              <input type="text" id="iconUrl" placeholder="https://example.com/icon.png">
            </div>
          </div>
          <div class="form-row">
            <div>
              <label>Strip Image URL (375×123 for header background)</label>
              <input type="text" id="stripUrl" placeholder="https://example.com/strip.png">
            </div>
            <div>
              <label>Thumbnail URL (90×90 for notifications)</label>
              <input type="text" id="thumbnailUrl" placeholder="https://example.com/thumb.png">
            </div>
          </div>
          <p style="font-size: 0.8rem; color: #a0a0a0; margin-top: 8px;">
            💡 Leave empty to use default images. Supports PNG, JPEG. For best results use @2x resolution.
          </p>

          <h3>📝 Pass Content</h3>
          <div class="form-row">
            <div>
              <label>Program Name</label>
              <input type="text" id="programName" value="\${defaultBusiness?.programName || 'Loyalty Program'}">
            </div>
            <div>
              <label>Points Label</label>
              <input type="text" id="pointsLabel" value="Points">
            </div>
          </div>
          
          <div class="form-row">
            <div>
              <label>Header Field (Top Left)</label>
              <input type="text" id="headerLabel" placeholder="e.g., MEMBER SINCE">
            </div>
            <div>
              <label>Header Value</label>
              <input type="text" id="headerValue" placeholder="e.g., 2024">
            </div>
          </div>

          <div class="form-row">
            <div>
              <label>Secondary Field Label</label>
              <input type="text" id="secondaryLabel" placeholder="e.g., Level">
            </div>
            <div>
              <label>Secondary Field Value</label>
              <input type="text" id="secondaryValue" placeholder="e.g., Gold">
            </div>
          </div>

          <h3>🆔 Member ID & QR Code</h3>
          <div class="form-row">
            <div>
              <label>Member ID (Custom)</label>
              <input type="text" id="customMemberId" placeholder="Leave empty for auto-generate (e.g., SBC-ABC-12345)">
            </div>
            <div>
              <label>Barcode Type</label>
              <select id="barcodeFormat">
                <option value="PKBarcodeFormatQR">QR Code</option>
                <option value="PKBarcodeFormatPDF417">PDF417</option>
                <option value="PKBarcodeFormatAztec">Aztec</option>
                <option value="PKBarcodeFormatCode128">Code 128</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div>
              <label>Barcode Data (what scanner reads)</label>
              <input type="text" id="barcodeMessage" placeholder="Leave empty to use Member ID">
            </div>
            <div>
              <label>Display Text (below barcode)</label>
              <input type="text" id="barcodeAltText" placeholder="Leave empty to use Member ID">
            </div>
          </div>
          <p style="font-size: 0.8rem; color: #a0a0a0; margin-top: 4px;">
            💡 Member ID: Unique identifier for this card. Barcode Data: what scanner reads. Display Text: shown to user.
          </p>

          <h3>📊 Auxiliary Fields (Below Points)</h3>
          <div class="form-row">
            <div>
              <label>Aux Field 1 Label</label>
              <input type="text" id="auxLabel1" placeholder="e.g., Valid Until">
            </div>
            <div>
              <label>Aux Field 1 Value</label>
              <input type="text" id="auxValue1" placeholder="e.g., Dec 2026">
            </div>
          </div>
          <div class="form-row">
            <div>
              <label>Aux Field 2 Label</label>
              <input type="text" id="auxLabel2" placeholder="e.g., Card Type">
            </div>
            <div>
              <label>Aux Field 2 Value</label>
              <input type="text" id="auxValue2" placeholder="e.g., Premium">
            </div>
          </div>

          <h3>📄 Back of Card (Detail Section) - 10 Fields</h3>
          <p style="font-size: 0.85rem; color: #a0a0a0; margin-bottom: 12px;">These fields appear when user taps "i" on the pass. Fill only what you need.</p>
          
          <div id="backFieldsContainer">
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel1" placeholder="Title 1 (e.g., Terms)">
              <textarea class="back-value-input" id="backValue1" placeholder="Content 1..."></textarea>
            </div>
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel2" placeholder="Title 2 (e.g., How to Earn)">
              <textarea class="back-value-input" id="backValue2" placeholder="Content 2..."></textarea>
            </div>
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel3" placeholder="Title 3 (e.g., Contact)">
              <textarea class="back-value-input" id="backValue3" placeholder="Content 3..."></textarea>
            </div>
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel4" placeholder="Title 4 (e.g., Website)">
              <textarea class="back-value-input" id="backValue4" placeholder="Content 4..."></textarea>
            </div>
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel5" placeholder="Title 5">
              <textarea class="back-value-input" id="backValue5" placeholder="Content 5..."></textarea>
            </div>
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel6" placeholder="Title 6">
              <textarea class="back-value-input" id="backValue6" placeholder="Content 6..."></textarea>
            </div>
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel7" placeholder="Title 7">
              <textarea class="back-value-input" id="backValue7" placeholder="Content 7..."></textarea>
            </div>
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel8" placeholder="Title 8">
              <textarea class="back-value-input" id="backValue8" placeholder="Content 8..."></textarea>
            </div>
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel9" placeholder="Title 9">
              <textarea class="back-value-input" id="backValue9" placeholder="Content 9..."></textarea>
            </div>
            <div class="back-field-row">
              <input type="text" class="back-label-input" id="backLabel10" placeholder="Title 10">
              <textarea class="back-value-input" id="backValue10" placeholder="Content 10..."></textarea>
            </div>
          </div>

          <div style="margin-top: 20px;">
            <button type="submit" style="width: 100%;">Generate Pass</button>
          </div>
        </form>
        
        <div id="passResult">
          <div class="status-badge" style="margin: 16px 0;">
            <span class="status-dot"></span>
            Pass created with real-time updates!
          </div>
          <div class="pass-card">
            <div class="pass-header">
              <div class="pass-info">
                <h4 id="newPassName"></h4>
                <p id="newPassInfo"></p>
              </div>
              <div class="points-display" id="newPassPoints">10 pts</div>
            </div>
            <div class="actions-row">
              <a href="#" id="newPassDownload" class="btn btn-secondary" style="flex: 1;">
                ⬇️ Download .pkpass
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Tab -->
    <div id="tab-settings" class="tab-content">
      <div class="card">
        <h2>⚙️ Default Settings</h2>
        <p style="color: #a0a0a0; margin-bottom: 20px;">These settings apply to new passes by default.</p>
        
        <h3>🏢 Business Info</h3>
        <div class="form-row">
          <div>
            <label>Business Name</label>
            <input type="text" id="settingBusinessName" value="\${defaultBusiness?.name || 'My Business'}">
          </div>
          <div>
            <label>Program Name</label>
            <input type="text" id="settingProgramName" value="\${defaultBusiness?.programName || 'Rewards'}">
          </div>
        </div>

        <h3>🎨 Default Colors</h3>
        <div class="form-row-3">
          <div>
            <label>Background</label>
            <input type="color" id="settingBgColor" value="#111827">
          </div>
          <div>
            <label>Foreground</label>
            <input type="color" id="settingFgColor" value="#ffffff">
          </div>
          <div>
            <label>Label</label>
            <input type="color" id="settingLabelColor" value="#b4b4b4">
          </div>
        </div>

        <h3>📍 Location</h3>
        <div class="form-row">
          <div>
            <label>Latitude</label>
            <input type="text" id="settingLat" value="35.6892">
          </div>
          <div>
            <label>Longitude</label>
            <input type="text" id="settingLng" value="51.389">
          </div>
        </div>

        <button onclick="saveSettings()" style="width: 100%; margin-top: 16px;">Save Settings</button>
      </div>
    </div>

    <!-- Messages Tab -->
    <div id="tab-messages" class="tab-content">
      <div class="card">
        <h2>📨 Push Notifications</h2>
        <p style="color: #a0a0a0; margin-bottom: 20px;">Send push notifications to update passes and show messages to users.</p>
        
        <h3>📢 Broadcast to All</h3>
        <form id="broadcastForm">
          <label>Message Type</label>
          <select id="broadcastType">
            <option value="points">🎁 Bonus Points</option>
            <option value="promo">🏷️ Promotion</option>
            <option value="update">🔄 Pass Update</option>
            <option value="custom">✏️ Custom Message</option>
          </select>
          
          <div id="broadcastPointsField">
            <label>Bonus Points</label>
            <input type="number" id="broadcastPoints" value="10" min="1">
          </div>
          
          <label>Notification Message</label>
          <input type="text" id="broadcastMessage" placeholder="e.g., You earned bonus points!">
          
          <label>Secondary Field Update (optional)</label>
          <div class="form-row">
            <div>
              <input type="text" id="broadcastSecLabel" placeholder="Label (e.g., Status)">
            </div>
            <div>
              <input type="text" id="broadcastSecValue" placeholder="Value (e.g., VIP)">
            </div>
          </div>
          
          <button type="submit" style="width: 100%; margin-top: 16px; background: linear-gradient(135deg, #f59e0b, #d97706);">📨 Send to All Passes</button>
        </form>
        
        <div id="broadcastResult" style="display: none; margin-top: 16px;">
          <div class="status-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">
            <span>📨</span>
            <span id="broadcastResultText"></span>
          </div>
        </div>
      </div>
      
      <div class="card">
        <h3>📜 Message History</h3>
        <ul class="pass-list" id="messageHistory">
          <li class="empty-state">No messages sent yet.</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Edit Modal -->
  <div class="modal-overlay" id="editModal">
    <div class="modal">
      <h3>✏️ Edit Pass</h3>
      <input type="hidden" id="editCardId">
      
      <label>Customer Name</label>
      <input type="text" id="editName">
      
      <label>Points</label>
      <input type="number" id="editPoints">
      
      <div class="form-row-3">
        <div>
          <label>Background</label>
          <input type="color" id="editBgColor">
        </div>
        <div>
          <label>Text</label>
          <input type="color" id="editFgColor">
        </div>
        <div>
          <label>Label</label>
          <input type="color" id="editLabelColor">
        </div>
      </div>

      <label>Secondary Label</label>
      <input type="text" id="editSecondaryLabel" placeholder="e.g., Level">
      
      <label>Secondary Value</label>
      <input type="text" id="editSecondaryValue" placeholder="e.g., Gold">

      <h4 style="color: #60a5fa; margin-top: 16px;">�️ Logo & Images</h4>
      <div class="form-row">
        <div>
          <label>Logo URL</label>
          <input type="text" id="editLogoUrl" placeholder="https://...">
        </div>
        <div>
          <label>Icon URL</label>
          <input type="text" id="editIconUrl" placeholder="https://...">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Strip Image URL</label>
          <input type="text" id="editStripUrl" placeholder="https://...">
        </div>
        <div>
          <label>Thumbnail URL</label>
          <input type="text" id="editThumbnailUrl" placeholder="https://...">
        </div>
      </div>

      <h4 style="color: #60a5fa; margin-top: 16px;">�📱 QR Code / Barcode</h4>
      <div class="form-row">
        <div>
          <label>Barcode Type</label>
          <select id="editBarcodeFormat">
            <option value="PKBarcodeFormatQR">QR Code</option>
            <option value="PKBarcodeFormatPDF417">PDF417</option>
            <option value="PKBarcodeFormatAztec">Aztec</option>
            <option value="PKBarcodeFormatCode128">Code 128</option>
          </select>
        </div>
        <div>
          <label>Barcode Data</label>
          <input type="text" id="editBarcodeMessage" placeholder="Data encoded in barcode">
        </div>
      </div>
      <label>Display Text (below barcode)</label>
      <input type="text" id="editBarcodeAltText" placeholder="Text shown under barcode">

      <h4 style="color: #60a5fa; margin-top: 16px;">📊 Auxiliary Fields</h4>
      <div class="form-row">
        <div>
          <label>Aux 1 Label</label>
          <input type="text" id="editAuxLabel1" placeholder="e.g., Valid Until">
        </div>
        <div>
          <label>Aux 1 Value</label>
          <input type="text" id="editAuxValue1" placeholder="e.g., Dec 2026">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Aux 2 Label</label>
          <input type="text" id="editAuxLabel2" placeholder="e.g., Card Type">
        </div>
        <div>
          <label>Aux 2 Value</label>
          <input type="text" id="editAuxValue2" placeholder="e.g., Premium">
        </div>
      </div>

      <h4 style="color: #60a5fa; margin-top: 16px;">📄 Back of Card (10 Details)</h4>
      <div id="editBackFields" style="max-height: 300px; overflow-y: auto;">
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 1">
          <textarea class="back-value" placeholder="Content 1" style="min-height: 40px;"></textarea>
        </div>
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 2">
          <textarea class="back-value" placeholder="Content 2" style="min-height: 40px;"></textarea>
        </div>
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 3">
          <textarea class="back-value" placeholder="Content 3" style="min-height: 40px;"></textarea>
        </div>
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 4">
          <textarea class="back-value" placeholder="Content 4" style="min-height: 40px;"></textarea>
        </div>
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 5">
          <textarea class="back-value" placeholder="Content 5" style="min-height: 40px;"></textarea>
        </div>
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 6">
          <textarea class="back-value" placeholder="Content 6" style="min-height: 40px;"></textarea>
        </div>
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 7">
          <textarea class="back-value" placeholder="Content 7" style="min-height: 40px;"></textarea>
        </div>
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 8">
          <textarea class="back-value" placeholder="Content 8" style="min-height: 40px;"></textarea>
        </div>
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 9">
          <textarea class="back-value" placeholder="Content 9" style="min-height: 40px;"></textarea>
        </div>
        <div class="back-field-item">
          <input type="text" class="back-label" placeholder="Title 10">
          <textarea class="back-value" placeholder="Content 10" style="min-height: 40px;"></textarea>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-danger" onclick="closeEditModal()">Cancel</button>
        <button onclick="savePassEdit()">Save & Update</button>
      </div>
    </div>
  </div>

  <script>
    const passes = []
    let defaultSettings = {
      bgColor: '#111827',
      fgColor: '#ffffff',
      labelColor: '#b4b4b4'
    }

    function showTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'))
      document.querySelector(\`[onclick="showTab('\${name}')"]\`).classList.add('active')
      document.getElementById('tab-' + name).classList.add('active')
    }

    document.getElementById('createForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = e.target.querySelector('button[type="submit"]')
      btn.textContent = 'Creating...'
      btn.disabled = true

      try {
        // Collect back fields (10 items)
        const backFields = []
        for (let i = 1; i <= 10; i++) {
          const label = document.getElementById('backLabel' + i)?.value
          const value = document.getElementById('backValue' + i)?.value
          if (label && value) {
            backFields.push({ label, value })
          }
        }

        const data = {
          customerName: document.getElementById('customerName').value.trim(),
          initialPoints: parseInt(document.getElementById('initialPoints').value) || 10,
          customMemberId: document.getElementById('customMemberId').value.trim(),
          bgColor: document.getElementById('bgColor').value,
          fgColor: document.getElementById('fgColor').value,
          labelColor: document.getElementById('labelColor').value,
          programName: document.getElementById('programName').value,
          pointsLabel: document.getElementById('pointsLabel').value,
          headerLabel: document.getElementById('headerLabel').value,
          headerValue: document.getElementById('headerValue').value,
          secondaryLabel: document.getElementById('secondaryLabel').value,
          secondaryValue: document.getElementById('secondaryValue').value,
          barcodeFormat: document.getElementById('barcodeFormat').value,
          barcodeMessage: document.getElementById('barcodeMessage').value,
          barcodeAltText: document.getElementById('barcodeAltText').value,
          logoUrl: document.getElementById('logoUrl').value,
          iconUrl: document.getElementById('iconUrl').value,
          stripUrl: document.getElementById('stripUrl').value,
          thumbnailUrl: document.getElementById('thumbnailUrl').value,
          // Auxiliary Fields
          auxLabel1: document.getElementById('auxLabel1').value,
          auxValue1: document.getElementById('auxValue1').value,
          auxLabel2: document.getElementById('auxLabel2').value,
          auxValue2: document.getElementById('auxValue2').value,
          // Back Fields (Detail Section) - 10 items
          backFields: backFields
        }

        const res = await fetch('/api/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        const result = await res.json()
        
        if (result.error) {
          alert('Error: ' + result.error)
          return
        }

        document.getElementById('newPassName').textContent = data.customerName
        document.getElementById('newPassInfo').textContent = 'ID: ' + result.cardId + (result.memberId ? ' | Member: ' + result.memberId : '')
        document.getElementById('newPassPoints').textContent = result.points + ' pts'
        document.getElementById('newPassDownload').href = '/pass/' + result.cardId
        document.getElementById('passResult').classList.add('show')

        passes.unshift({ 
          name: data.customerName, 
          cardId: result.cardId, 
          memberId: result.memberId,
          points: result.points,
          devices: 0,
          updating: false,
          customMemberId: data.customMemberId,
          bgColor: data.bgColor,
          fgColor: data.fgColor,
          labelColor: data.labelColor,
          secondaryLabel: data.secondaryLabel,
          secondaryValue: data.secondaryValue,
          barcodeFormat: data.barcodeFormat,
          barcodeMessage: data.barcodeMessage,
          barcodeAltText: data.barcodeAltText,
          logoUrl: data.logoUrl,
          iconUrl: data.iconUrl,
          stripUrl: data.stripUrl,
          thumbnailUrl: data.thumbnailUrl,
          auxLabel1: data.auxLabel1,
          auxValue1: data.auxValue1,
          auxLabel2: data.auxLabel2,
          auxValue2: data.auxValue2,
          backFields: data.backFields
        })
        updatePassList()
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

        pass.points = data.points
        pass.devices = data.registeredDevices || 0
        updatePassList()
      } catch (err) {
        alert('Error: ' + err.message)
      } finally {
        pass.updating = false
        updatePassList()
      }
    }

    function openEditModal(cardId) {
      const pass = passes.find(p => p.cardId === cardId)
      if (!pass) return

      document.getElementById('editCardId').value = cardId
      document.getElementById('editName').value = pass.name
      document.getElementById('editPoints').value = pass.points
      document.getElementById('editBgColor').value = pass.bgColor || '#111827'
      document.getElementById('editFgColor').value = pass.fgColor || '#ffffff'
      document.getElementById('editLabelColor').value = pass.labelColor || '#b4b4b4'
      document.getElementById('editSecondaryLabel').value = pass.secondaryLabel || ''
      document.getElementById('editSecondaryValue').value = pass.secondaryValue || ''
      document.getElementById('editBarcodeFormat').value = pass.barcodeFormat || 'PKBarcodeFormatQR'
      document.getElementById('editBarcodeMessage').value = pass.barcodeMessage || pass.cardId
      document.getElementById('editBarcodeAltText').value = pass.barcodeAltText || ''
      document.getElementById('editLogoUrl').value = pass.logoUrl || ''
      document.getElementById('editIconUrl').value = pass.iconUrl || ''
      document.getElementById('editStripUrl').value = pass.stripUrl || ''
      document.getElementById('editThumbnailUrl').value = pass.thumbnailUrl || ''
      
      // Auxiliary fields
      document.getElementById('editAuxLabel1').value = pass.auxLabel1 || ''
      document.getElementById('editAuxValue1').value = pass.auxValue1 || ''
      document.getElementById('editAuxLabel2').value = pass.auxLabel2 || ''
      document.getElementById('editAuxValue2').value = pass.auxValue2 || ''
      
      // Back fields (details)
      const backFieldItems = document.querySelectorAll('#editBackFields .back-field-item')
      const backFields = pass.backFields || []
      backFieldItems.forEach((item, i) => {
        const labelInput = item.querySelector('.back-label')
        const valueInput = item.querySelector('.back-value')
        if (backFields[i]) {
          labelInput.value = backFields[i].label || ''
          valueInput.value = backFields[i].value || ''
        } else {
          labelInput.value = ''
          valueInput.value = ''
        }
      })
      
      document.getElementById('editModal').classList.add('show')
    }

    function closeEditModal() {
      document.getElementById('editModal').classList.remove('show')
    }

    async function savePassEdit() {
      const cardId = document.getElementById('editCardId').value
      const pass = passes.find(p => p.cardId === cardId)
      if (!pass) return

      // Collect back fields
      const backFieldItems = document.querySelectorAll('#editBackFields .back-field-item')
      const backFields = []
      backFieldItems.forEach(item => {
        const label = item.querySelector('.back-label').value
        const value = item.querySelector('.back-value').value
        if (label && value) {
          backFields.push({ label, value })
        }
      })

      const updates = {
        name: document.getElementById('editName').value,
        points: parseInt(document.getElementById('editPoints').value),
        bgColor: document.getElementById('editBgColor').value,
        fgColor: document.getElementById('editFgColor').value,
        labelColor: document.getElementById('editLabelColor').value,
        secondaryLabel: document.getElementById('editSecondaryLabel').value,
        secondaryValue: document.getElementById('editSecondaryValue').value,
        barcodeFormat: document.getElementById('editBarcodeFormat').value,
        barcodeMessage: document.getElementById('editBarcodeMessage').value,
        barcodeAltText: document.getElementById('editBarcodeAltText').value,
        logoUrl: document.getElementById('editLogoUrl').value,
        iconUrl: document.getElementById('editIconUrl').value,
        stripUrl: document.getElementById('editStripUrl').value,
        thumbnailUrl: document.getElementById('editThumbnailUrl').value,
        auxLabel1: document.getElementById('editAuxLabel1').value,
        auxValue1: document.getElementById('editAuxValue1').value,
        auxLabel2: document.getElementById('editAuxLabel2').value,
        auxValue2: document.getElementById('editAuxValue2').value,
        backFields: backFields
      }

      try {
        const res = await fetch('/api/update/' + cardId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        })
        const data = await res.json()
        
        if (data.error) {
          alert('Error: ' + data.error)
          return
        }

        // Update local data
        Object.assign(pass, updates)
        pass.points = data.points
        
        closeEditModal()
        updatePassList()
        alert('Pass updated! Changes will appear in Wallet shortly.')
      } catch (err) {
        alert('Error: ' + err.message)
      }
    }

    function saveSettings() {
      defaultSettings = {
        bgColor: document.getElementById('settingBgColor').value,
        fgColor: document.getElementById('settingFgColor').value,
        labelColor: document.getElementById('settingLabelColor').value
      }
      alert('Settings saved!')
    }

    // Message functions
    const messageHistory = []

    function toggleMsgFields() {
      const type = document.getElementById('msgType').value
      document.getElementById('msgPointsField').style.display = type === 'points' ? 'block' : 'none'
    }

    function openMessageModal(cardId) {
      const pass = passes.find(p => p.cardId === cardId)
      if (!pass) return
      
      document.getElementById('msgCardId').value = cardId
      document.getElementById('msgCardName').textContent = pass.name
      document.getElementById('msgPoints').value = 10
      document.getElementById('msgText').value = ''
      document.getElementById('msgSecLabel').value = ''
      document.getElementById('msgSecValue').value = ''
      document.getElementById('msgType').value = 'points'
      toggleMsgFields()
      
      document.getElementById('messageModal').classList.add('show')
    }

    function closeMessageModal() {
      document.getElementById('messageModal').classList.remove('show')
    }

    async function sendMessage() {
      const cardId = document.getElementById('msgCardId').value
      const type = document.getElementById('msgType').value
      const message = document.getElementById('msgText').value
      const points = type === 'points' ? parseInt(document.getElementById('msgPoints').value) : 0
      const secLabel = document.getElementById('msgSecLabel').value
      const secValue = document.getElementById('msgSecValue').value
      
      try {
        const res = await fetch('/api/message/' + cardId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, message, points, secLabel, secValue })
        })
        const data = await res.json()
        
        if (data.error) {
          alert('Error: ' + data.error)
          return
        }
        
        // Update local pass data
        const pass = passes.find(p => p.cardId === cardId)
        if (pass && points) pass.points = data.points
        
        // Add to history
        messageHistory.unshift({
          time: new Date().toLocaleTimeString(),
          cardId,
          name: pass?.name,
          type,
          message,
          points
        })
        updateMessageHistory()
        
        closeMessageModal()
        updatePassList()
        alert('Message sent! ' + (data.pushSent ? 'Push notification delivered.' : 'No devices registered.'))
      } catch (err) {
        alert('Error: ' + err.message)
      }
    }

    // Broadcast form
    document.getElementById('broadcastForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = e.target.querySelector('button[type="submit"]')
      btn.textContent = 'Sending...'
      btn.disabled = true
      
      const type = document.getElementById('broadcastType').value
      const message = document.getElementById('broadcastMessage').value
      const points = type === 'points' ? parseInt(document.getElementById('broadcastPoints').value) : 0
      const secLabel = document.getElementById('broadcastSecLabel').value
      const secValue = document.getElementById('broadcastSecValue').value
      
      try {
        const res = await fetch('/api/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, message, points, secLabel, secValue })
        })
        const data = await res.json()
        
        if (data.error) {
          alert('Error: ' + data.error)
          return
        }
        
        // Update local passes
        if (points) {
          passes.forEach(p => p.points = (p.points || 0) + points)
        }
        
        // Show result
        document.getElementById('broadcastResultText').textContent = 
          \`Sent to \${data.totalPasses} passes, \${data.pushesSent} push notifications delivered.\`
        document.getElementById('broadcastResult').style.display = 'block'
        
        // Add to history
        messageHistory.unshift({
          time: new Date().toLocaleTimeString(),
          cardId: 'ALL',
          name: 'Broadcast',
          type,
          message,
          points,
          count: data.totalPasses
        })
        updateMessageHistory()
        updatePassList()
      } catch (err) {
        alert('Error: ' + err.message)
      } finally {
        btn.textContent = '📨 Send to All Passes'
        btn.disabled = false
      }
    })

    // Toggle broadcast points field
    document.getElementById('broadcastType')?.addEventListener('change', (e) => {
      document.getElementById('broadcastPointsField').style.display = e.target.value === 'points' ? 'block' : 'none'
    })

    function updateMessageHistory() {
      const list = document.getElementById('messageHistory')
      if (!list) return
      if (messageHistory.length === 0) {
        list.innerHTML = '<li class="empty-state">No messages sent yet.</li>'
        return
      }
      list.innerHTML = messageHistory.slice(0, 20).map(m => \`
        <li class="pass-card" style="padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>\${m.cardId === 'ALL' ? '📢 Broadcast' : '📨 ' + m.name}</strong>
              <span style="color: #a0a0a0; font-size: 0.8rem;"> • \${m.time}</span>
            </div>
            <span style="color: #fbbf24;">\${m.type === 'points' ? '+' + m.points + ' pts' : m.type}</span>
          </div>
          \${m.message ? '<p style="margin: 8px 0 0; color: #d0d0d0; font-size: 0.9rem;">"' + m.message + '"</p>' : ''}
          \${m.count ? '<p style="margin: 4px 0 0; color: #a0a0a0; font-size: 0.8rem;">Sent to ' + m.count + ' passes</p>' : ''}
        </li>
      \`).join('')
    }

    function updatePassList() {
      const list = document.getElementById('passList')
      if (passes.length === 0) {
        list.innerHTML = '<li class="empty-state">No passes created yet. Go to "Create New" tab.</li>'
        return
      }
      list.innerHTML = passes.map(p => \`
        <li class="pass-card">
          <div class="pass-header">
            <div class="pass-info">
              <h4>\${p.name}</h4>
              <p>ID: \${p.cardId}</p>
            </div>
            <div class="points-display \${p.updating ? 'update-animation' : ''}" id="points-\${p.cardId}">
              \${p.updating ? '...' : p.points + ' pts'}
            </div>
          </div>
          
          <div class="status-badge">
            <span class="status-dot"></span>
            Real-time enabled
            \${p.devices > 0 ? ' • ' + p.devices + ' device(s)' : ''}
          </div>
          
          <div class="points-controls">
            <button class="points-btn subtract" onclick="updatePoints('\${p.cardId}', -10)" \${p.updating ? 'disabled' : ''}>-10</button>
            <button class="points-btn subtract" onclick="updatePoints('\${p.cardId}', -1)" \${p.updating ? 'disabled' : ''}>-1</button>
            <button class="points-btn add" onclick="updatePoints('\${p.cardId}', 1)" \${p.updating ? 'disabled' : ''}>+1</button>
            <button class="points-btn add" onclick="updatePoints('\${p.cardId}', 10)" \${p.updating ? 'disabled' : ''}>+10</button>
            <button class="points-btn add" onclick="updatePoints('\${p.cardId}', 50)" \${p.updating ? 'disabled' : ''}>+50</button>
            <button class="points-btn custom" onclick="updatePoints('\${p.cardId}', parseInt(prompt('Enter points (+/-):')) || 0)">±</button>
          </div>
          
          <div class="actions-row">
            <button class="btn-secondary btn-small" onclick="openEditModal('\${p.cardId}')" style="flex: 1;">
              ✏️ Edit
            </button>
            <button class="btn-small" onclick="openMessageModal('\${p.cardId}')" style="flex: 1; background: linear-gradient(135deg, #f59e0b, #d97706);">
              📨 Message
            </button>
            <a href="/pass/\${p.cardId}" class="btn btn-small" style="flex: 1;">
              ⬇️ Download
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

    // Create new pass with customization
    if (path === '/api/create' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const data = JSON.parse(body)
      const { 
        customerName, 
        initialPoints = 10,
        customMemberId,
        bgColor = '#111827',
        fgColor = '#ffffff',
        labelColor = '#b4b4b4',
        programName,
        pointsLabel,
        headerLabel,
        headerValue,
        secondaryLabel,
        secondaryValue,
        barcodeFormat = 'PKBarcodeFormatQR',
        barcodeMessage,
        barcodeAltText,
        logoUrl,
        iconUrl,
        stripUrl,
        thumbnailUrl,
        // New fields
        auxLabel1,
        auxValue1,
        auxLabel2,
        auxValue2,
        backFields = []
      } = data

      if (!customerName) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'customerName is required' }))
        return
      }

      // Create customer and card with custom settings
      // Pass customMemberId to createCustomerAccount if provided
      const customer = createCustomerAccount({
        businessId: defaultBusiness.id,
        fullName: customerName,
        ...(customMemberId && { memberId: customMemberId })
      })
      customers.set(customer.id, customer)

      const authToken = generateAuthToken()
      const isPublicUrl = PUBLIC_URL && !PUBLIC_URL.includes('localhost') && !PUBLIC_URL.includes('127.0.0.1')

      // Determine final barcode message - use provided barcodeMessage, or fall back to memberId
      const finalMemberId = customer.memberId
      const finalBarcodeMessage = barcodeMessage || finalMemberId
      const finalBarcodeAltText = barcodeAltText || finalMemberId

      const cardConfig = {
        businessId: defaultBusiness.id,
        customerId: customer.id,
        initialPoints: parseInt(initialPoints) || 10,
        metadata: {
          appleWallet: {
            backgroundColor: bgColor,
            foregroundColor: fgColor,
            labelColor: labelColor,
            ...(programName && { logoText: programName }),
            passOverrides: isPublicUrl ? {
              webServiceURL: PUBLIC_URL,
              authenticationToken: authToken
            } : {}
          },
          // Store customization data for later use
          customization: {
            bgColor,
            fgColor,
            labelColor,
            programName: programName || defaultBusiness?.programName,
            pointsLabel: pointsLabel || 'Points',
            headerLabel,
            headerValue,
            secondaryLabel,
            secondaryValue,
            barcodeFormat,
            barcodeMessage,
            barcodeAltText,
            logoUrl,
            iconUrl,
            stripUrl,
            thumbnailUrl,
            auxLabel1,
            auxValue1,
            auxLabel2,
            auxValue2,
            backFields
          }
        }
      }

      // Add image URLs for pass generation
      if (logoUrl) cardConfig.metadata.appleWallet.logoUrl = logoUrl
      if (iconUrl) cardConfig.metadata.appleWallet.iconUrl = iconUrl
      if (stripUrl) cardConfig.metadata.appleWallet.stripUrl = stripUrl
      if (thumbnailUrl) cardConfig.metadata.appleWallet.thumbnailUrl = thumbnailUrl

      // Add barcode configuration - use finalBarcodeMessage computed earlier
      cardConfig.metadata.appleWallet.barcodes = [{
        format: barcodeFormat,
        message: finalBarcodeMessage,
        messageEncoding: 'iso-8859-1',
        altText: finalBarcodeAltText
      }]
      // Also set legacy barcode field for older iOS versions
      cardConfig.metadata.appleWallet.barcode = {
        format: barcodeFormat,
        message: finalBarcodeMessage,
        messageEncoding: 'iso-8859-1',
        altText: finalBarcodeAltText
      }

      // Add secondary fields if provided
      if (secondaryLabel || secondaryValue) {
        cardConfig.metadata.appleWallet.secondaryFields = [{
          key: 'secondary1',
          label: secondaryLabel || '',
          value: secondaryValue || ''
        }]
      }

      // Add header fields if provided
      if (headerLabel || headerValue) {
        cardConfig.metadata.appleWallet.headerFields = [{
          key: 'header1',
          label: headerLabel || '',
          value: headerValue || ''
        }]
      }

      // Add auxiliary fields if provided
      if (auxLabel1 || auxValue1 || auxLabel2 || auxValue2) {
        cardConfig.metadata.appleWallet.auxiliaryFields = []
        if (auxLabel1 || auxValue1) {
          cardConfig.metadata.appleWallet.auxiliaryFields.push({
            key: 'aux1',
            label: auxLabel1 || '',
            value: auxValue1 || ''
          })
        }
        if (auxLabel2 || auxValue2) {
          cardConfig.metadata.appleWallet.auxiliaryFields.push({
            key: 'aux2',
            label: auxLabel2 || '',
            value: auxValue2 || ''
          })
        }
      }

      // Add back fields (detail section) if provided
      if (backFields && backFields.length > 0) {
        cardConfig.metadata.appleWallet.backFields = backFields.map((field, i) => ({
          key: `back${i + 1}`,
          label: field.label,
          value: field.value
        }))
      }

      const card = await issueLoyaltyCard(cardConfig)
      cards.set(card.id, card)
      passAuthTokens.set(card.id, authToken)
      passUpdateTimes.set(card.id, Date.now())

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

    // Update pass (appearance, points, content)
    if (path.startsWith('/api/update/') && req.method === 'POST') {
      const cardId = path.replace('/api/update/', '')
      const card = cards.get(cardId)

      if (!card) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Card not found' }))
        return
      }

      let body = ''
      for await (const chunk of req) body += chunk
      const updates = JSON.parse(body)
      const { 
        name,
        points,
        bgColor,
        fgColor,
        labelColor,
        secondaryLabel,
        secondaryValue,
        programName,
        headerLabel,
        headerValue,
        barcodeFormat,
        barcodeMessage,
        barcodeAltText,
        logoUrl,
        iconUrl,
        stripUrl,
        thumbnailUrl,
        // New fields
        auxLabel1,
        auxValue1,
        auxLabel2,
        auxValue2,
        backFields
      } = updates

      // Update card data
      card.metadata = card.metadata || {}
      card.metadata.appleWallet = card.metadata.appleWallet || {}
      card.metadata.customization = card.metadata.customization || {}

      // Update colors
      if (bgColor) {
        card.metadata.appleWallet.backgroundColor = bgColor
        card.metadata.customization.bgColor = bgColor
      }
      if (fgColor) {
        card.metadata.appleWallet.foregroundColor = fgColor
        card.metadata.customization.fgColor = fgColor
      }
      if (labelColor) {
        card.metadata.appleWallet.labelColor = labelColor
        card.metadata.customization.labelColor = labelColor
      }

      // Update program name
      if (programName) {
        card.metadata.appleWallet.logoText = programName
        card.metadata.customization.programName = programName
      }

      // Update secondary fields
      if (secondaryLabel !== undefined || secondaryValue !== undefined) {
        card.metadata.appleWallet.secondaryFields = [{
          key: 'secondary1',
          label: secondaryLabel || '',
          value: secondaryValue || ''
        }]
        card.metadata.customization.secondaryLabel = secondaryLabel
        card.metadata.customization.secondaryValue = secondaryValue
      }

      // Update header fields
      if (headerLabel !== undefined || headerValue !== undefined) {
        card.metadata.appleWallet.headerFields = [{
          key: 'header1',
          label: headerLabel || '',
          value: headerValue || ''
        }]
        card.metadata.customization.headerLabel = headerLabel
        card.metadata.customization.headerValue = headerValue
      }

      // Update barcode
      if (barcodeFormat || barcodeMessage || barcodeAltText !== undefined) {
        const format = barcodeFormat || card.metadata.customization.barcodeFormat || 'PKBarcodeFormatQR'
        const message = barcodeMessage || card.metadata.customization.barcodeMessage || cardId
        const altText = barcodeAltText !== undefined ? barcodeAltText : (card.metadata.customization.barcodeAltText || message)
        
        card.metadata.appleWallet.barcodes = [{
          format: format,
          message: message,
          messageEncoding: 'iso-8859-1',
          altText: altText
        }]
        card.metadata.appleWallet.barcode = {
          format: format,
          message: message,
          messageEncoding: 'iso-8859-1',
          altText: altText
        }
        card.metadata.customization.barcodeFormat = format
        card.metadata.customization.barcodeMessage = message
        card.metadata.customization.barcodeAltText = altText
      }

      // Update images
      if (logoUrl !== undefined) {
        card.metadata.appleWallet.logoUrl = logoUrl || undefined
        card.metadata.customization.logoUrl = logoUrl
      }
      if (iconUrl !== undefined) {
        card.metadata.appleWallet.iconUrl = iconUrl || undefined
        card.metadata.customization.iconUrl = iconUrl
      }
      if (stripUrl !== undefined) {
        card.metadata.appleWallet.stripUrl = stripUrl || undefined
        card.metadata.customization.stripUrl = stripUrl
      }
      if (thumbnailUrl !== undefined) {
        card.metadata.appleWallet.thumbnailUrl = thumbnailUrl || undefined
        card.metadata.customization.thumbnailUrl = thumbnailUrl
      }

      // Update auxiliary fields
      if (auxLabel1 !== undefined || auxValue1 !== undefined || auxLabel2 !== undefined || auxValue2 !== undefined) {
        card.metadata.appleWallet.auxiliaryFields = []
        if (auxLabel1 || auxValue1) {
          card.metadata.appleWallet.auxiliaryFields.push({
            key: 'aux1',
            label: auxLabel1 || '',
            value: auxValue1 || ''
          })
        }
        if (auxLabel2 || auxValue2) {
          card.metadata.appleWallet.auxiliaryFields.push({
            key: 'aux2',
            label: auxLabel2 || '',
            value: auxValue2 || ''
          })
        }
        card.metadata.customization.auxLabel1 = auxLabel1
        card.metadata.customization.auxValue1 = auxValue1
        card.metadata.customization.auxLabel2 = auxLabel2
        card.metadata.customization.auxValue2 = auxValue2
      }

      // Update back fields (detail section)
      if (backFields !== undefined) {
        if (backFields && backFields.length > 0) {
          card.metadata.appleWallet.backFields = backFields.map((field, i) => ({
            key: `back${i + 1}`,
            label: field.label,
            value: field.value
          }))
        } else {
          card.metadata.appleWallet.backFields = []
        }
        card.metadata.customization.backFields = backFields
      }

      // Update points if changed
      if (points !== undefined && points !== card.points) {
        const delta = points - card.points
        const updated = await updateLoyaltyPoints({
          cardId: card.id,
          delta: delta
        })
        card.points = updated.points
      }

      // Update the timestamp
      passUpdateTimes.set(cardId, Date.now())
      cards.set(cardId, card)

      // Send push notification to registered devices
      await sendPushNotification(cardId)

      const registrations = deviceRegistrations.get(cardId)
      const registeredDevices = registrations ? registrations.size : 0

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        cardId: card.id,
        points: card.points,
        registeredDevices,
        pushSent: registeredDevices > 0
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

    // Send message to a single pass
    if (path.startsWith('/api/message/') && req.method === 'POST') {
      const cardId = path.replace('/api/message/', '')
      const card = cards.get(cardId)

      if (!card) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Card not found' }))
        return
      }

      let body = ''
      for await (const chunk of req) body += chunk
      const { type, message, points, secLabel, secValue } = JSON.parse(body)

      // Initialize metadata if needed
      card.metadata = card.metadata || {}
      card.metadata.appleWallet = card.metadata.appleWallet || {}
      card.metadata.customization = card.metadata.customization || {}

      // Add bonus points if specified
      if (type === 'points' && points > 0) {
        const updated = await updateLoyaltyPoints({
          cardId: card.id,
          delta: points
        })
        card.points = updated.points
      }

      // Update secondary field with change message for notification
      if (secLabel || secValue) {
        card.metadata.appleWallet.secondaryFields = [{
          key: 'secondary1',
          label: secLabel || card.metadata.customization.secondaryLabel || '',
          value: secValue || card.metadata.customization.secondaryValue || '',
          changeMessage: message || 'Your pass has been updated'
        }]
        card.metadata.customization.secondaryLabel = secLabel || card.metadata.customization.secondaryLabel
        card.metadata.customization.secondaryValue = secValue || card.metadata.customization.secondaryValue
      }

      // Add back field with message for notification display
      card.metadata.appleWallet.backFields = card.metadata.appleWallet.backFields || []
      card.metadata.appleWallet.backFields.unshift({
        key: `msg_${Date.now()}`,
        label: new Date().toLocaleString(),
        value: message || (type === 'points' ? `You earned ${points} bonus points!` : 'Your pass has been updated'),
        changeMessage: message || (type === 'points' ? `You earned ${points} bonus points!` : 'Your pass has been updated')
      })
      // Keep only last 10 messages
      card.metadata.appleWallet.backFields = card.metadata.appleWallet.backFields.slice(0, 10)

      // Update timestamp
      passUpdateTimes.set(cardId, Date.now())
      cards.set(cardId, card)

      // Send push notification
      await sendPushNotification(cardId)

      const registrations = deviceRegistrations.get(cardId)
      const registeredDevices = registrations ? registrations.size : 0

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        cardId: card.id,
        points: card.points,
        registeredDevices,
        pushSent: registeredDevices > 0
      }))
      return
    }

    // Broadcast message to all passes
    if (path === '/api/broadcast' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { type, message, points, secLabel, secValue } = JSON.parse(body)

      let totalPasses = 0
      let pushesSent = 0

      for (const [cardId, card] of cards) {
        totalPasses++

        // Initialize metadata if needed
        card.metadata = card.metadata || {}
        card.metadata.appleWallet = card.metadata.appleWallet || {}
        card.metadata.customization = card.metadata.customization || {}

        // Add bonus points if specified
        if (type === 'points' && points > 0) {
          const updated = await updateLoyaltyPoints({
            cardId: card.id,
            delta: points
          })
          card.points = updated.points
        }

        // Update secondary field with change message
        if (secLabel || secValue) {
          card.metadata.appleWallet.secondaryFields = [{
            key: 'secondary1',
            label: secLabel || card.metadata.customization.secondaryLabel || '',
            value: secValue || card.metadata.customization.secondaryValue || '',
            changeMessage: message || 'Your pass has been updated'
          }]
        }

        // Add back field with message
        card.metadata.appleWallet.backFields = card.metadata.appleWallet.backFields || []
        card.metadata.appleWallet.backFields.unshift({
          key: `msg_${Date.now()}`,
          label: new Date().toLocaleString(),
          value: message || (type === 'points' ? `You earned ${points} bonus points!` : 'Your pass has been updated'),
          changeMessage: message || (type === 'points' ? `You earned ${points} bonus points!` : 'Your pass has been updated')
        })
        card.metadata.appleWallet.backFields = card.metadata.appleWallet.backFields.slice(0, 10)

        // Update timestamp
        passUpdateTimes.set(cardId, Date.now())
        cards.set(cardId, card)

        // Send push notification
        const registrations = deviceRegistrations.get(cardId)
        if (registrations && registrations.size > 0) {
          try {
            await sendPushNotification(cardId)
            pushesSent++
          } catch (err) {
            console.log(`   ⚠️ Failed to push to ${cardId}: ${err.message}`)
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        totalPasses,
        pushesSent,
        message: `Broadcast sent to ${totalPasses} passes`
      }))
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
      const serverTime = passUpdateTimes.get(serialNumber) || 0
      
      if (ifModifiedSince) {
        const clientTime = new Date(ifModifiedSince).getTime()
        console.log(`   📅 If-Modified-Since: ${ifModifiedSince} (${clientTime})`)
        console.log(`   📅 Server time: ${new Date(serverTime).toUTCString()} (${serverTime})`)
        
        // Return 304 if server time is NOT newer than client time
        // Use 1 second tolerance since HTTP dates don't have milliseconds
        if (serverTime <= clientTime + 1000) {
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
