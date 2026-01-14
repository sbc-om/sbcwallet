import { describe, it, expect, beforeEach } from 'vitest'
import {
  createParentSchedule,
  createChildTicket,
  updatePassStatus,
  getPass,
  listProfiles,
  getProfile
} from '../src/api/unified.js'
import type { ParentPassData, ChildPassData } from '../src/types.js'

describe('Unified API - Parent Schedule Creation', () => {
  it('should create a parent schedule with logistics profile', async () => {
    const input = {
      profile: 'logistics' as const,
      programName: 'Morning Yard Veracruz',
      site: 'Patio Gate 3',
      window: {
        from: '2025-10-18T08:00:00-06:00',
        to: '2025-10-18T12:00:00-06:00',
        tz: 'America/Mexico_City'
      },
      capacity: 50
    }

    const result = await createParentSchedule(input)

    expect(result).toBeDefined()
    expect(result.type).toBe('parent')
    expect(result.profile).toBe('logistics')
    expect(result.programName).toBe('Morning Yard Veracruz')
    expect(result.site).toBe('Patio Gate 3')
    expect(result.window).toEqual(input.window)
    expect(result.capacity).toBe(50)
    expect(result.status).toBe('ISSUED')
    expect(result.id).toMatch(/^PES-/)
    expect(result.hash).toBeDefined()
    expect(result.signature).toBeDefined()
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
  })

  it('should create a parent schedule with healthcare profile', async () => {
    const input = {
      profile: 'healthcare' as const,
      programName: 'Cardiology Appointments',
      site: 'Main Hospital',
      window: {
        from: '2025-10-20T09:00:00Z',
        to: '2025-10-20T17:00:00Z'
      }
    }

    const result = await createParentSchedule(input)

    expect(result).toBeDefined()
    expect(result.type).toBe('parent')
    expect(result.profile).toBe('healthcare')
    expect(result.programName).toBe('Cardiology Appointments')
    expect(result.status).toBe('SCHEDULED')
    expect(result.id).toMatch(/^APB-/)
  })

  it('should use default logistics profile when not specified', async () => {
    const input = {
      programName: 'Test Program'
    }

    const result = await createParentSchedule(input)

    expect(result.profile).toBe('logistics')
    expect(result.status).toBe('ISSUED')
  })

  it('should validate input with zod schema', async () => {
    const invalidInput = {
      // missing programName
      site: 'Test Site'
    } as any

    await expect(createParentSchedule(invalidInput)).rejects.toThrow()
  })

  it('should store parent pass for later retrieval', async () => {
    const input = {
      programName: 'Test Program',
      site: 'Test Site'
    }

    const created = await createParentSchedule(input)
    const retrieved = getPass(created.id)

    expect(retrieved).toEqual(created)
  })
})

describe('Unified API - Child Ticket Creation', () => {
  let parentId: string

  beforeEach(async () => {
    const parent = await createParentSchedule({
      programName: 'Test Parent',
      site: 'Test Site'
    })
    parentId = parent.id
  })

  it('should create a child ticket for logistics profile', async () => {
    const input = {
      profile: 'logistics' as const,
      parentId,
      plate: 'ABC123A',
      carrier: 'Transportes Golfo',
      client: 'Cliente Y'
    }

    const result = await createChildTicket(input)

    expect(result).toBeDefined()
    expect(result.type).toBe('child')
    expect(result.profile).toBe('logistics')
    expect(result.parentId).toBe(parentId)
    expect(result.plate).toBe('ABC123A')
    expect(result.carrier).toBe('Transportes Golfo')
    expect(result.client).toBe('Cliente Y')
    expect(result.status).toBe('ISSUED')
    expect(result.id).toMatch(/^TO-/)
    expect(result.hash).toBeDefined()
    expect(result.signature).toBeDefined()
  })

  it('should create a child ticket for healthcare profile', async () => {
    const healthcareParent = await createParentSchedule({
      profile: 'healthcare',
      programName: 'Healthcare Batch'
    })

    const input = {
      profile: 'healthcare' as const,
      parentId: healthcareParent.id,
      patientName: 'John Doe',
      doctor: 'Dr. Smith',
      procedure: 'Checkup'
    }

    const result = await createChildTicket(input)

    expect(result).toBeDefined()
    expect(result.type).toBe('child')
    expect(result.profile).toBe('healthcare')
    expect(result.patientName).toBe('John Doe')
    expect(result.doctor).toBe('Dr. Smith')
    expect(result.procedure).toBe('Checkup')
    expect(result.status).toBe('SCHEDULED')
    expect(result.id).toMatch(/^PV-/)
  })

  it('should fail when parent does not exist', async () => {
    const input = {
      parentId: 'NONEXISTENT-ID',
      plate: 'ABC123'
    }

    await expect(createChildTicket(input)).rejects.toThrow('Parent pass not found')
  })

  it('should store child pass for later retrieval', async () => {
    const input = {
      parentId,
      plate: 'XYZ789',
      carrier: 'Test Carrier'
    }

    const created = await createChildTicket(input)
    const retrieved = getPass(created.id)

    expect(retrieved).toEqual(created)
  })

  it('should link child to parent via parentId', async () => {
    const input = {
      parentId,
      plate: 'TEST123'
    }

    const child = await createChildTicket(input)
    const parent = getPass(parentId)

    expect(child.parentId).toBe(parent?.id)
  })
})

describe('Unified API - Status Updates', () => {
  let childId: string

  beforeEach(async () => {
    const parent = await createParentSchedule({
      programName: 'Test Parent'
    })

    const child = await createChildTicket({
      parentId: parent.id,
      plate: 'ABC123'
    })

    childId = child.id
  })

  it('should update pass status', async () => {
    const original = getPass(childId)

    // Small delay to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10))

    const updated = await updatePassStatus(childId, 'PRESENCE')

    expect(updated.status).toBe('PRESENCE')
    expect(updated.updatedAt).not.toBe(original?.createdAt)
  })

  it('should update hash and signature when status changes', async () => {
    // Update status - this should trigger rehashing
    const updated = await updatePassStatus(childId, 'SCALE')

    // Verify hash and signature exist and are updated
    expect(updated.hash).toBeDefined()
    expect(updated.signature).toBeDefined()
    expect(updated.hash).toContain('hash_')
    expect(updated.signature).toContain('sig_')
    expect(updated.status).toBe('SCALE')
  })

  it('should follow logistics status flow', async () => {
    await updatePassStatus(childId, 'PRESENCE')
    await updatePassStatus(childId, 'SCALE')
    await updatePassStatus(childId, 'OPS')
    const final = await updatePassStatus(childId, 'EXITED')

    expect(final.status).toBe('EXITED')
  })

  it('should reject invalid status for profile', async () => {
    await expect(updatePassStatus(childId, 'INVALID_STATUS' as any)).rejects.toThrow('Invalid status')
  })

  it('should fail when pass does not exist', async () => {
    await expect(updatePassStatus('NONEXISTENT-ID', 'PRESENCE')).rejects.toThrow('Pass not found')
  })

  it('should allow valid healthcare statuses for healthcare profile', async () => {
    const parent = await createParentSchedule({
      profile: 'healthcare',
      programName: 'Health Batch'
    })

    const child = await createChildTicket({
      profile: 'healthcare',
      parentId: parent.id,
      patientName: 'Jane Doe'
    })

    await updatePassStatus(child.id, 'CHECKIN')
    await updatePassStatus(child.id, 'PROCEDURE')
    const final = await updatePassStatus(child.id, 'DISCHARGED')

    expect(final.status).toBe('DISCHARGED')
  })
})

describe('Unified API - Profile Management', () => {
  it('should list all available profiles', () => {
    const profiles = listProfiles()

    expect(profiles).toBeDefined()
    expect(profiles).toContain('logistics')
    expect(profiles).toContain('healthcare')
    expect(profiles).toContain('loyalty')
    expect(profiles.length).toBe(3)
  })

  it('should get logistics profile config', () => {
    const profile = getProfile('logistics')

    expect(profile).toBeDefined()
    expect(profile.name).toBe('logistics')
    expect(profile.fieldMap).toBeDefined()
    expect(profile.statusFlow).toContain('ISSUED')
    expect(profile.statusFlow).toContain('PRESENCE')
    expect(profile.statusFlow).toContain('EXITED')
  })

  it('should get healthcare profile config', () => {
    const profile = getProfile('healthcare')

    expect(profile).toBeDefined()
    expect(profile.name).toBe('healthcare')
    expect(profile.fieldMap).toBeDefined()
    expect(profile.statusFlow).toContain('SCHEDULED')
    expect(profile.statusFlow).toContain('CHECKIN')
    expect(profile.statusFlow).toContain('DISCHARGED')
  })

  it('should provide field maps for parent and child', () => {
    const profile = getProfile('logistics')

    expect(profile.fieldMap.parent).toBeDefined()
    expect(profile.fieldMap.child).toBeDefined()
    expect(profile.fieldMap.parent.programName).toBeDefined()
    expect(profile.fieldMap.child.plate).toBeDefined()
  })

  it('should provide default templates', () => {
    const profile = getProfile('logistics')

    expect(profile.defaultTemplates).toBeDefined()
    expect(profile.defaultTemplates.apple).toBeDefined()
    expect(profile.defaultTemplates.google).toBeDefined()
    expect(profile.defaultTemplates.apple.parent).toBeDefined()
    expect(profile.defaultTemplates.apple.child).toBeDefined()
  })
})

describe('Unified API - Integration', () => {
  it('should handle complete parent-child workflow', async () => {
    // Create parent
    const parent = await createParentSchedule({
      profile: 'logistics',
      programName: 'Integration Test',
      site: 'Test Site',
      window: {
        from: '2025-10-18T08:00:00Z',
        to: '2025-10-18T12:00:00Z'
      }
    })

    expect(parent.id).toBeDefined()

    // Create child
    const child = await createChildTicket({
      profile: 'logistics',
      parentId: parent.id,
      plate: 'INT123',
      carrier: 'Integration Carrier'
    })

    expect(child.id).toBeDefined()
    expect(child.parentId).toBe(parent.id)

    // Update child status
    const updated = await updatePassStatus(child.id, 'PRESENCE')
    expect(updated.status).toBe('PRESENCE')

    // Retrieve passes
    const retrievedParent = getPass(parent.id)
    const retrievedChild = getPass(child.id)

    expect(retrievedParent).toBeDefined()
    expect(retrievedChild).toBeDefined()
    expect(retrievedChild?.status).toBe('PRESENCE')
  })

  it('should support multiple children for one parent', async () => {
    const parent = await createParentSchedule({
      programName: 'Multi-Child Test'
    })

    const child1 = await createChildTicket({
      parentId: parent.id,
      plate: 'CHILD1'
    })

    const child2 = await createChildTicket({
      parentId: parent.id,
      plate: 'CHILD2'
    })

    const child3 = await createChildTicket({
      parentId: parent.id,
      plate: 'CHILD3'
    })

    expect(child1.parentId).toBe(parent.id)
    expect(child2.parentId).toBe(parent.id)
    expect(child3.parentId).toBe(parent.id)
    expect(child1.id).not.toBe(child2.id)
    expect(child2.id).not.toBe(child3.id)
  })
})
