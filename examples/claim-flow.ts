import { createParentSchedule, createChildTicket, getPkpassBuffer, updatePassStatus } from '../src/index.js'
import { writeFile } from 'fs/promises'

/**
 * Example claim flow demonstrating the complete lifecycle of a
 * Program Entry Schedule (PES) and Transport Order (TO) in the logistics profile.
 */
async function runClaimFlow() {
  console.log('🚀 Starting sbcwallet Pass Claim Flow Example\n')

  try {
    // Step 1: Create Parent PES (Program Entry Schedule)
    console.log('1️⃣  Creating Parent PES...')
    const pes = await createParentSchedule({
      profile: 'logistics',
      programName: 'Morning Yard Veracruz',
      site: 'Patio Gate 3',
      window: {
        from: '2025-10-18T08:00:00-06:00',
        to: '2025-10-18T12:00:00-06:00',
        tz: 'America/Mexico_City'
      },
      capacity: 50
    })

    console.log(`✅ Parent PES created: ${pes.id}`)
    console.log(`   Program: ${pes.programName}`)
    console.log(`   Site: ${pes.site}`)
    console.log(`   Status: ${pes.status}`)
    console.log(`   Hash: ${pes.hash}`)
    console.log(`   Signature: ${pes.signature}\n`)

    // Step 2: Create Child TO (Transport Order)
    console.log('2️⃣  Creating Child TO...')
    const to = await createChildTicket({
      profile: 'logistics',
      parentId: pes.id,
      plate: 'ABC123A',
      carrier: 'Transportes Golfo',
      client: 'Cliente Y'
    })

    console.log(`✅ Child TO created: ${to.id}`)
    console.log(`   Plate: ${to.plate}`)
    console.log(`   Carrier: ${to.carrier}`)
    console.log(`   Client: ${to.client}`)
    console.log(`   Parent ID: ${to.parentId}`)
    console.log(`   Status: ${to.status}`)
    console.log(`   Hash: ${to.hash}`)
    console.log(`   Signature: ${to.signature}\n`)

    // Step 3: Simulate status transitions
    console.log('3️⃣  Simulating status transitions...')

    console.log('   → PRESENCE (vehicle arrives at gate)')
    const toPresence = await updatePassStatus(to.id, 'PRESENCE')
    console.log(`   ✓ Status: ${toPresence.status}`)

    console.log('   → SCALE (vehicle on scale)')
    const toScale = await updatePassStatus(to.id, 'SCALE')
    console.log(`   ✓ Status: ${toScale.status}`)

    console.log('   → OPS (operations in progress)')
    const toOps = await updatePassStatus(to.id, 'OPS')
    console.log(`   ✓ Status: ${toOps.status}`)

    console.log('   → EXITED (vehicle has exited)')
    const toExited = await updatePassStatus(to.id, 'EXITED')
    console.log(`   ✓ Status: ${toExited.status}`)
    console.log(`   ✓ New hash: ${toExited.hash}\n`)

    // Step 4: Generate Apple Wallet .pkpass (will fail without valid certs, but demonstrates API)
    console.log('4️⃣  Attempting to generate Apple Wallet .pkpass...')
    try {
      const pkpass = await getPkpassBuffer('child', toExited)
      await writeFile('ticket.pkpass', pkpass)
      console.log('✅ Saved pkpass: ticket.pkpass\n')
    } catch (error) {
      console.log('⚠️  Apple Wallet pass generation skipped (requires valid certificates)')
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}\n`)
    }

    // Summary
    console.log('📊 Summary:')
    console.log(`   Parent PES: ${pes.id}`)
    console.log(`   Child TO: ${to.id}`)
    console.log(`   Final Status: ${toExited.status}`)
    console.log(`   Status Flow: ISSUED → PRESENCE → SCALE → OPS → EXITED`)
    console.log('\n✨ Claim flow completed successfully!')

  } catch (error) {
    console.error('❌ Error during claim flow:')
    console.error(error)
    process.exit(1)
  }
}

/**
 * Healthcare example demonstrating appointment batch and patient visits
 */
async function runHealthcareFlow() {
  console.log('\n🏥 Starting Healthcare Flow Example\n')

  try {
    // Create appointment batch
    console.log('1️⃣  Creating Appointment Batch...')
    const batch = await createParentSchedule({
      profile: 'healthcare',
      programName: 'Cardiology Appointments - Dr. Smith',
      site: 'Main Hospital - Floor 3',
      window: {
        from: '2025-10-20T09:00:00Z',
        to: '2025-10-20T17:00:00Z'
      },
      capacity: 20
    })

    console.log(`✅ Appointment Batch created: ${batch.id}`)
    console.log(`   Program: ${batch.programName}`)
    console.log(`   Status: ${batch.status}\n`)

    // Create patient visit
    console.log('2️⃣  Creating Patient Visit...')
    const visit = await createChildTicket({
      profile: 'healthcare',
      parentId: batch.id,
      patientName: 'John Doe',
      doctor: 'Dr. Smith',
      procedure: 'Cardiac Consultation'
    })

    console.log(`✅ Patient Visit created: ${visit.id}`)
    console.log(`   Patient: ${visit.patientName}`)
    console.log(`   Doctor: ${visit.doctor}`)
    console.log(`   Procedure: ${visit.procedure}`)
    console.log(`   Status: ${visit.status}\n`)

    // Status transitions
    console.log('3️⃣  Processing patient visit...')
    await updatePassStatus(visit.id, 'CHECKIN')
    console.log('   ✓ CHECKIN')

    await updatePassStatus(visit.id, 'PROCEDURE')
    console.log('   ✓ PROCEDURE')

    const discharged = await updatePassStatus(visit.id, 'DISCHARGED')
    console.log('   ✓ DISCHARGED\n')

    console.log('✨ Healthcare flow completed!')

  } catch (error) {
    console.error('❌ Error during healthcare flow:')
    console.error(error)
  }
}

// Run both examples
runClaimFlow()
  .then(() => runHealthcareFlow())
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
