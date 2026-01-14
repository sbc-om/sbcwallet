import { createParentSchedule, createChildTicket, updatePassStatus, getGoogleObject } from '../dist/index.js'

async function main() {
  console.log('🧪 Smoke test: dist import')

  const parent = await createParentSchedule({
    profile: 'logistics',
    programName: 'Smoke Test Program',
    site: 'Smoke Test Site'
  })

  const child = await createChildTicket({
    profile: 'logistics',
    parentId: parent.id,
    plate: 'SMOKE123',
    carrier: 'Smoke Carrier',
    client: 'Smoke Client'
  })

  const updated = await updatePassStatus(child.id, 'PRESENCE')

  console.log('✅ Created parent:', parent.id)
  console.log('✅ Created child:', child.id)
  console.log('✅ Updated status:', updated.status)

  // This only returns a working Save URL if env vars are set.
  if (process.env.GOOGLE_ISSUER_ID) {
    const { saveUrl } = await getGoogleObject('child', updated)
    console.log('✅ Google Save URL generated')
    console.log(saveUrl)
  } else {
    console.log('ℹ️  GOOGLE_ISSUER_ID not set; skipping Save URL generation')
  }
}

main().catch(err => {
  console.error('❌ Smoke test failed:', err)
  process.exit(1)
})
