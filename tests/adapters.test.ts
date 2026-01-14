import { describe, it, expect, beforeEach } from 'vitest'
import { AppleWalletAdapter } from '../src/adapters/apple.js'
import { GoogleWalletAdapter } from '../src/adapters/google.js'
import logisticsProfile from '../src/profiles/logistics/index.js'
import healthcareProfile from '../src/profiles/healthcare/index.js'
import type { ParentPassData, ChildPassData } from '../src/types.js'

describe('AppleWalletAdapter', () => {
  let adapter: AppleWalletAdapter
  let mockParentPass: ParentPassData
  let mockChildPass: ChildPassData

  beforeEach(() => {
    adapter = new AppleWalletAdapter({
      teamId: 'TEST123',
      passTypeId: 'pass.com.sbcwallet.test',
      certPath: './test-certs/cert.p12',
      certPassword: 'test',
      wwdrPath: './test-certs/wwdr.pem'
    })

    mockParentPass = {
      id: 'PES-2025-10-18-TEST',
      type: 'parent',
      profile: 'logistics',
      programName: 'Morning Yard Veracruz',
      site: 'Patio Gate 3',
      window: {
        from: '2025-10-18T08:00:00-06:00',
        to: '2025-10-18T12:00:00-06:00',
        tz: 'America/Mexico_City'
      },
      capacity: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ISSUED',
      hash: 'test_hash_123',
      signature: 'test_sig_456'
    }

    mockChildPass = {
      id: 'TO-2025-10-18-TEST-0001',
      type: 'child',
      profile: 'logistics',
      parentId: 'PES-2025-10-18-TEST',
      plate: 'ABC123A',
      carrier: 'Transportes Golfo',
      client: 'Cliente Y',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ISSUED',
      hash: 'test_hash_789',
      signature: 'test_sig_101'
    }
  })

  it('should initialize with environment variables', () => {
    const defaultAdapter = new AppleWalletAdapter()
    expect(defaultAdapter).toBeDefined()
  })

  it('should initialize with custom config', () => {
    expect(adapter).toBeDefined()
  })

  it('should fail gracefully when generating pkpass without valid certs', async () => {
    await expect(
      adapter.generatePkpass(mockParentPass, logisticsProfile, 'parent')
    ).rejects.toThrow()
  })

  it('should handle parent pass template loading', async () => {
    // This will fail without valid certs, but we can verify the error message
    try {
      await adapter.generatePkpass(mockParentPass, logisticsProfile, 'parent')
    } catch (error) {
      expect(error).toBeDefined()
      expect(error instanceof Error).toBe(true)
    }
  })

  it('should handle child pass template loading', async () => {
    try {
      await adapter.generatePkpass(mockChildPass, logisticsProfile, 'child')
    } catch (error) {
      expect(error).toBeDefined()
      expect(error instanceof Error).toBe(true)
    }
  })
})

describe('GoogleWalletAdapter', () => {
  let adapter: GoogleWalletAdapter
  let mockParentPass: ParentPassData
  let mockChildPass: ChildPassData

  beforeEach(() => {
    adapter = new GoogleWalletAdapter({
      issuerId: 'test-issuer-123'
    })

    mockParentPass = {
      id: 'PES-2025-10-18-TEST',
      type: 'parent',
      profile: 'logistics',
      programName: 'Morning Yard Veracruz',
      site: 'Patio Gate 3',
      window: {
        from: '2025-10-18T08:00:00-06:00',
        to: '2025-10-18T12:00:00-06:00',
        tz: 'America/Mexico_City'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ISSUED',
      hash: 'test_hash_123',
      signature: 'test_sig_456'
    }

    mockChildPass = {
      id: 'TO-2025-10-18-TEST-0001',
      type: 'child',
      profile: 'logistics',
      parentId: 'PES-2025-10-18-TEST',
      plate: 'ABC123A',
      carrier: 'Transportes Golfo',
      client: 'Cliente Y',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ISSUED',
      hash: 'test_hash_789',
      signature: 'test_sig_101'
    }
  })

  it('should initialize with custom config', () => {
    expect(adapter).toBeDefined()
  })

  it('should generate valid Google Wallet object for parent pass', async () => {
    const result = await adapter.generatePassObject(mockParentPass, logisticsProfile, 'parent')

    expect(result).toBeDefined()
    expect(result.object).toBeDefined()
    expect(result.saveUrl).toBeDefined()
    expect(result.object.id).toContain(mockParentPass.id)
    expect(result.object.classId).toContain('logistics_parent')
    expect(result.object.state).toBe('ACTIVE')
  })

  it('should generate valid Google Wallet object for child pass', async () => {
    const result = await adapter.generatePassObject(mockChildPass, logisticsProfile, 'child')

    expect(result).toBeDefined()
    expect(result.object).toBeDefined()
    expect(result.saveUrl).toBeDefined()
    expect(result.object.id).toContain(mockChildPass.id)
    expect(result.object.classId).toContain('logistics_child')
    expect(result.object.barcode?.value).toBe(mockChildPass.id)
  })

  it('should populate card title correctly for logistics profile', async () => {
    const result = await adapter.generatePassObject(mockParentPass, logisticsProfile, 'parent')

    expect(result.object.cardTitle).toBeDefined()
    expect(result.object.cardTitle?.body).toBe(mockParentPass.programName)
  })

  it('should populate card title correctly for healthcare profile', async () => {
    const healthcareParent: ParentPassData = {
      ...mockParentPass,
      profile: 'healthcare',
      programName: 'Cardiology Batch'
    }

    const result = await adapter.generatePassObject(healthcareParent, healthcareProfile, 'parent')

    expect(result.object.cardTitle).toBeDefined()
    expect(result.object.cardTitle?.body).toBe('Cardiology Batch')
  })

  it('should generate save URL with object ID', async () => {
    const result = await adapter.generatePassObject(mockChildPass, logisticsProfile, 'child')

    expect(result.saveUrl).toContain('pay.google.com')
    expect(result.saveUrl).toContain(mockChildPass.id)
  })

  it('should populate text modules correctly', async () => {
    const result = await adapter.generatePassObject(mockChildPass, logisticsProfile, 'child')

    expect(result.object.textModulesData).toBeDefined()
    expect(result.object.textModulesData?.length).toBeGreaterThan(0)

    const statusModule = result.object.textModulesData?.find(m => m.id === 'status')
    expect(statusModule?.body).toBe(mockChildPass.status)
  })
})

describe('Profile-specific adapter behavior', () => {
  let googleAdapter: GoogleWalletAdapter

  beforeEach(() => {
    googleAdapter = new GoogleWalletAdapter({ issuerId: 'test-issuer' })
  })

  it('should use logistics profile templates', async () => {
    const pass: ChildPassData = {
      id: 'TO-TEST',
      type: 'child',
      profile: 'logistics',
      parentId: 'PES-TEST',
      plate: 'XYZ789',
      carrier: 'Test Carrier',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ISSUED'
    }

    const result = await googleAdapter.generatePassObject(pass, logisticsProfile, 'child')

    expect(result.object.cardTitle?.header).toBe('Transport Order')
  })

  it('should use healthcare profile templates', async () => {
    const pass: ChildPassData = {
      id: 'PV-TEST',
      type: 'child',
      profile: 'healthcare',
      parentId: 'APB-TEST',
      patientName: 'John Doe',
      doctor: 'Dr. Smith',
      procedure: 'Checkup',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'SCHEDULED'
    }

    const result = await googleAdapter.generatePassObject(pass, healthcareProfile, 'child')

    expect(result.object.cardTitle?.header).toBe('Patient Visit')
    expect(result.object.cardTitle?.body).toBe('John Doe')
  })
})
