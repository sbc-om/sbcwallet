/**
 * Apple Wallet Pass Server
 * 
 * A simple HTTP server that generates and serves Apple Wallet (.pkpass) files.
 * Users can scan a QR code or click a link to download passes to their iPhone/iPad.
 * 
 * Usage:
 *   node examples/loyalty-apple-server.js
 * 
 * Environment Variables:
 *   APPLE_TEAM_ID       - Your Apple Developer Team ID
 *   APPLE_PASS_TYPE_ID  - Pass Type Identifier (e.g., pass.com.yourcompany.loyalty)
 *   APPLE_CERT_PATH     - Path to .p12 or .pem certificate
 *   APPLE_CERT_PASSWORD - Certificate password
 *   APPLE_WWDR_PATH     - Path to Apple WWDR certificate
 *   PORT                - Server port (default: 3001)
 */

import 'dotenv/config'
import http from 'http'
import { URL } from 'url'

import {
  createBusiness,
  createCustomerAccount,
  createLoyaltyProgram,
  issueLoyaltyCard,
  updateLoyaltyPoints,
  getPkpassBuffer
} from '../dist/index.js'

const PORT = process.env.PORT || 3001

// In-memory storage for demo
const businesses = new Map()
const customers = new Map()
const programs = new Map()
const cards = new Map()

// Initialize default business/program
let defaultBusiness = null
let defaultProgram = null

async function initDemo() {
  console.log('🍎 Initializing Apple Wallet Demo...\n')

  // Check credentials
  const hasAppleCreds = Boolean(
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_PASS_TYPE_ID &&
    process.env.APPLE_CERT_PATH &&
    process.env.APPLE_WWDR_PATH
  )

  if (!hasAppleCreds) {
    console.warn('⚠️  Apple Wallet credentials not fully configured!')
    console.warn('   Pass generation will fail without:')
    console.warn('   - APPLE_TEAM_ID')
    console.warn('   - APPLE_PASS_TYPE_ID')
    console.warn('   - APPLE_CERT_PATH')
    console.warn('   - APPLE_WWDR_PATH')
    console.warn('')
  }

  // Create default business
  defaultBusiness = createBusiness({
    name: process.env.LOYALTY_BUSINESS_NAME || 'SBC Coffee',
    programName: process.env.LOYALTY_PROGRAM_NAME || 'SBC Rewards',
    pointsLabel: process.env.LOYALTY_POINTS_LABEL || 'Points'
  })
  businesses.set(defaultBusiness.id, defaultBusiness)

  // Create default program
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
  console.log('')
}

/**
 * Create a new customer and issue a loyalty card
 */
async function createCustomerCard(customerName) {
  const customer = createCustomerAccount({
    businessId: defaultBusiness.id,
    fullName: customerName
  })
  customers.set(customer.id, customer)

  const card = await issueLoyaltyCard({
    businessId: defaultBusiness.id,
    customerId: customer.id,
    initialPoints: 10
  })
  cards.set(card.id, card)

  return { customer, card }
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
  <title>🍎 Apple Wallet - Loyalty Pass</title>
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
    input[type="text"] {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(0,0,0,0.3);
      color: white;
      font-size: 1rem;
      margin-bottom: 16px;
    }
    input[type="text"]:focus {
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
    .pass-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .pass-item {
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pass-info h3 {
      margin: 0 0 4px 0;
      font-size: 1rem;
    }
    .pass-info p {
      margin: 0;
      color: #a0a0a0;
      font-size: 0.875rem;
    }
    .download-btn {
      background: black;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .download-btn:hover {
      background: #333;
    }
    .apple-logo {
      width: 16px;
      height: 16px;
    }
    .instructions {
      background: rgba(74, 222, 128, 0.1);
      border: 1px solid rgba(74, 222, 128, 0.3);
      border-radius: 8px;
      padding: 16px;
      font-size: 0.875rem;
    }
    .instructions h3 {
      margin: 0 0 12px 0;
      color: #4ade80;
    }
    .instructions ol {
      margin: 0;
      padding-left: 20px;
    }
    .instructions li {
      margin-bottom: 8px;
      color: #d0d0d0;
    }
    .empty-state {
      text-align: center;
      color: #a0a0a0;
      padding: 20px;
    }
    #passResult {
      display: none;
      margin-top: 16px;
    }
    #passResult.show {
      display: block;
    }
    .pass-item-expanded {
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .pass-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .pass-info h3 {
      margin: 0 0 4px 0;
      font-size: 1rem;
    }
    .pass-info p {
      margin: 0;
      color: #a0a0a0;
      font-size: 0.875rem;
    }
    .points-display {
      background: linear-gradient(135deg, #4ade80, #22c55e);
      color: black;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 1.1rem;
    }
    .points-controls {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    .points-btn {
      flex: 1;
      min-width: 60px;
      padding: 10px;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .points-btn:hover {
      transform: scale(1.05);
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
    .pass-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .action-btn {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .action-btn.download {
      background: black;
      color: white;
    }
    .action-btn.download:hover {
      background: #333;
    }
    .custom-points-input {
      display: none;
      margin-top: 12px;
      gap: 8px;
    }
    .custom-points-input.show {
      display: flex;
    }
    .custom-points-input input {
      flex: 1;
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      background: rgba(0,0,0,0.3);
      color: white;
      font-size: 1rem;
    }
    .custom-points-input button {
      width: auto;
      padding: 10px 20px;
    }
    .update-notice {
      background: rgba(251, 191, 36, 0.2);
      border: 1px solid rgba(251, 191, 36, 0.4);
      border-radius: 6px;
      padding: 8px 12px;
      margin-top: 12px;
      font-size: 0.8rem;
      color: #fbbf24;
      display: none;
    }
    .update-notice.show {
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🍎 Apple Wallet</h1>
    <p class="subtitle">${defaultBusiness?.programName || 'Loyalty Program'}</p>

    <div class="card">
      <h2>✨ Create New Pass</h2>
      <form id="createForm">
        <label for="customerName">Customer Name</label>
        <input type="text" id="customerName" name="customerName" placeholder="Enter your name" required>
        <button type="submit">Generate Pass</button>
      </form>
      <div id="passResult">
        <div class="pass-item" id="newPassItem">
          <div class="pass-info">
            <h3 id="newPassName"></h3>
            <p id="newPassInfo"></p>
          </div>
          <a href="#" id="newPassDownload" class="download-btn">
            <svg class="apple-logo" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Add to Wallet
          </a>
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
      <h3>📱 How to use</h3>
      <ol>
        <li>Enter your name and click "Generate Pass"</li>
        <li>Click "Add to Wallet" to download the .pkpass file</li>
        <li>Use the +/- buttons to update points</li>
        <li>After updating points, re-download the pass to see changes in Wallet</li>
        <li>On iPhone/iPad: Delete old pass and add the new one</li>
      </ol>
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
        document.getElementById('newPassInfo').textContent = \`ID: \${data.cardId} • \${data.points} points\`
        document.getElementById('newPassDownload').href = '/pass/' + data.cardId
        document.getElementById('passResult').classList.add('show')

        // Add to list
        passes.unshift({ name, cardId: data.cardId, points: data.points, needsUpdate: false })
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
      try {
        const res = await fetch(\`/api/points/\${cardId}\`, {
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
        const pass = passes.find(p => p.cardId === cardId)
        if (pass) {
          pass.points = data.points
          pass.needsUpdate = true
        }
        updatePassList()
      } catch (err) {
        alert('Error updating points: ' + err.message)
      }
    }

    function showCustomInput(cardId) {
      const input = document.getElementById(\`custom-input-\${cardId}\`)
      if (input) {
        input.classList.toggle('show')
      }
    }

    async function applyCustomPoints(cardId) {
      const input = document.getElementById(\`custom-value-\${cardId}\`)
      if (!input) return
      
      const value = parseInt(input.value, 10)
      if (isNaN(value)) {
        alert('Please enter a valid number')
        return
      }
      
      await updatePoints(cardId, value)
      input.value = ''
      document.getElementById(\`custom-input-\${cardId}\`).classList.remove('show')
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
            <div class="points-display" id="points-\${p.cardId}">\${p.points} pts</div>
          </div>
          
          <div class="points-controls">
            <button class="points-btn subtract" onclick="updatePoints('\${p.cardId}', -10)">-10</button>
            <button class="points-btn subtract" onclick="updatePoints('\${p.cardId}', -1)">-1</button>
            <button class="points-btn add" onclick="updatePoints('\${p.cardId}', 1)">+1</button>
            <button class="points-btn add" onclick="updatePoints('\${p.cardId}', 10)">+10</button>
            <button class="points-btn add" onclick="updatePoints('\${p.cardId}', 50)">+50</button>
            <button class="points-btn custom" onclick="showCustomInput('\${p.cardId}')">±</button>
          </div>
          
          <div class="custom-points-input" id="custom-input-\${p.cardId}">
            <input type="number" id="custom-value-\${p.cardId}" placeholder="Enter points (e.g. 25 or -15)">
            <button onclick="applyCustomPoints('\${p.cardId}')">Apply</button>
          </div>
          
          <div class="update-notice \${p.needsUpdate ? 'show' : ''}" id="notice-\${p.cardId}">
            ⚠️ Points updated! Download new pass to update your Wallet.
          </div>
          
          <div class="pass-actions">
            <a href="/pass/\${p.cardId}" class="action-btn download" onclick="markDownloaded('\${p.cardId}')">
              <svg class="apple-logo" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              \${p.needsUpdate ? 'Download Updated Pass' : 'Add to Wallet'}
            </a>
          </div>
        </li>
      \`).join('')
    }

    function markDownloaded(cardId) {
      const pass = passes.find(p => p.cardId === cardId)
      if (pass) {
        pass.needsUpdate = false
        // Update UI after a short delay (after download starts)
        setTimeout(() => updatePassList(), 500)
      }
    }
  </script>
</body>
</html>`
}

/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    // Home page
    if (path === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(generateHtmlPage(`http://localhost:${PORT}`))
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

      const { customer, card } = await createCustomerCard(customerName)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        customerId: customer.id,
        cardId: card.id,
        memberId: card.memberId,
        points: card.points,
        downloadUrl: `/pass/${card.id}`
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
        const pkpassBuffer = await getPkpassBuffer('child', card)

        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="${cardId}.pkpass"`,
          'Content-Length': pkpassBuffer.length
        })
        res.end(pkpassBuffer)
      } catch (err) {
        console.error('Error generating .pkpass:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          error: 'Failed to generate pass',
          message: err.message,
          hint: 'Make sure Apple Wallet credentials are configured correctly'
        }))
      }
      return
    }

    // Update points
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

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        cardId: updated.id,
        points: updated.points,
        downloadUrl: `/pass/${updated.id}`
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
    console.log(`\n📱 Open in browser to create passes`)
    console.log(`   Or use the API:`)
    console.log(`   POST /api/create        - Create new pass`)
    console.log(`   GET  /pass/:cardId      - Download .pkpass file`)
    console.log(`   POST /api/points/:cardId - Update points`)
    console.log(`   GET  /api/cards         - List all cards`)
  })
}).catch(err => {
  console.error('Failed to initialize:', err)
  process.exit(1)
})
