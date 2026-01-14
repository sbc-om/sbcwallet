import { describe, it, expect } from 'vitest'
import {
  createBusiness,
  createCustomerAccount,
  createLoyaltyProgram,
  issueLoyaltyCard,
  updateLoyaltyPoints,
  getGoogleObject
} from '../src/index.js'

describe('Loyalty - multi-tenant issuance', () => {
  it('issues a loyalty card with memberId QR and updates points', async () => {
    const biz = createBusiness({ name: 'Biz A', pointsLabel: 'Points' })
    const program = await createLoyaltyProgram({ businessId: biz.id })

    const customer = createCustomerAccount({ businessId: biz.id, fullName: 'Alice' })

    const card = await issueLoyaltyCard({
      businessId: biz.id,
      customerId: customer.id,
      initialPoints: 5
    })

    expect(program.profile).toBe('loyalty')
    expect(card.profile).toBe('loyalty')
    expect(card.customerName).toBe('Alice')
    expect(card.memberId).toBeDefined()
    expect(card.points).toBe(5)

    const updated = await updateLoyaltyPoints({ cardId: card.id, delta: 7 })
    expect((updated as any).points).toBe(12)

    const { object } = await getGoogleObject('child', updated as any)
    expect(object.barcode?.value).toBe(customer.memberId)

    const pointsModule = object.textModulesData?.find((m: { id?: string; body?: string }) => m.id === 'points')
    expect(pointsModule?.body).toBe('12')
  })
})
