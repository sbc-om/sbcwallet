import type { ProfileConfig, ProfileFieldMap, LoyaltyStatus } from '../../types.js'

export const statusFlow: LoyaltyStatus[] = ['ACTIVE', 'SUSPENDED']

export const fieldMap: ProfileFieldMap = {
  parent: {
    programName: { label: 'Program', key: 'programName' },
    site: { label: 'Location', key: 'site' }
  },
  child: {
    customerName: { label: 'Customer', key: 'customerName' },
    memberId: { label: 'Member ID', key: 'memberId' },
    points: { label: 'Points', key: 'points' },
    status: { label: 'Status', key: 'status' },
    parentId: { label: 'Program ID', key: 'parentId' }
  }
}

export const defaultTemplates = {
  apple: {
    parent: {
      formatVersion: 1,
      organizationName: 'sbcwallet Loyalty',
      description: 'Loyalty Program',
      backgroundColor: 'rgb(17, 24, 39)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(209, 213, 219)',
      logoText: 'sbcwallet',
      generic: {
        primaryFields: [{ key: 'programName', label: 'Program', value: '' }],
        secondaryFields: [{ key: 'site', label: 'Location', value: '' }],
        backFields: [{ key: 'scheduleId', label: 'Program ID', value: '' }]
      }
    },
    child: {
      formatVersion: 1,
      organizationName: 'sbcwallet Loyalty',
      description: 'Loyalty Card',
      backgroundColor: 'rgb(17, 24, 39)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(209, 213, 219)',
      logoText: 'sbcwallet',
      generic: {
        primaryFields: [{ key: 'customerName', label: 'Customer', value: '' }],
        secondaryFields: [
          { key: 'points', label: 'Points', value: '0' },
          { key: 'status', label: 'Status', value: 'ACTIVE' }
        ],
        backFields: [
          { key: 'memberId', label: 'Member ID', value: '' },
          { key: 'parentId', label: 'Program ID', value: '' }
        ]
      }
    }
  },
  google: {
    parentClass: {
      issuerName: 'sbcwallet Loyalty',
      reviewStatus: 'UNDER_REVIEW'
    },
    parentObject: {
      state: 'ACTIVE',
      cardTitle: { header: 'Loyalty Program', body: '' },
      textModulesData: [
        { id: 'site', header: 'Location', body: '' }
      ]
    },
    childObject: {
      state: 'ACTIVE',
      cardTitle: { header: 'Loyalty Card', body: '' },
      textModulesData: [
        { id: 'points', header: 'Points', body: '0' },
        { id: 'memberId', header: 'Member ID', body: '' },
        { id: 'status', header: 'Status', body: 'ACTIVE' }
      ]
    }
  }
}

export const loyaltyProfile: ProfileConfig = {
  name: 'loyalty',
  fieldMap,
  statusFlow,
  defaultTemplates
}

export default loyaltyProfile
