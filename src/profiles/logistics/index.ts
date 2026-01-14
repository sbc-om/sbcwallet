import type { ProfileConfig, ProfileFieldMap, LogisticsStatus } from '../../types.js'

export const statusFlow: LogisticsStatus[] = [
  'ISSUED',
  'PRESENCE',
  'SCALE',
  'OPS',
  'EXITED'
]

export const fieldMap: ProfileFieldMap = {
  parent: {
    programName: { label: 'Program', key: 'programName' },
    site: { label: 'Site', key: 'site' },
    windowFrom: { label: 'Window Start', key: 'window.from' },
    windowTo: { label: 'Window End', key: 'window.to' },
    capacity: { label: 'Capacity', key: 'capacity' }
  },
  child: {
    plate: { label: 'Plate', key: 'plate' },
    carrier: { label: 'Carrier', key: 'carrier' },
    client: { label: 'Client', key: 'client' },
    status: { label: 'Status', key: 'status' },
    parentId: { label: 'Schedule ID', key: 'parentId' }
  }
}

export const defaultTemplates = {
  apple: {
    parent: {
      formatVersion: 1,
      organizationName: 'sbcwallet Logistics',
      description: 'Program Entry Schedule',
      backgroundColor: 'rgb(34, 139, 230)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(200, 230, 255)',
      logoText: 'sbcwallet',
      generic: {
        primaryFields: [
          {
            key: 'programName',
            label: 'Program',
            value: ''
          }
        ],
        secondaryFields: [
          {
            key: 'site',
            label: 'Site',
            value: ''
          }
        ],
        auxiliaryFields: [
          {
            key: 'windowFrom',
            label: 'From',
            value: ''
          },
          {
            key: 'windowTo',
            label: 'To',
            value: ''
          }
        ],
        backFields: [
          {
            key: 'scheduleId',
            label: 'Schedule ID',
            value: ''
          },
          {
            key: 'capacity',
            label: 'Capacity',
            value: ''
          }
        ]
      }
    },
    child: {
      formatVersion: 1,
      organizationName: 'sbcwallet Logistics',
      description: 'Transport Order',
      backgroundColor: 'rgb(60, 179, 113)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(200, 255, 220)',
      logoText: 'sbcwallet',
      generic: {
        primaryFields: [
          {
            key: 'plate',
            label: 'Plate',
            value: ''
          }
        ],
        secondaryFields: [
          {
            key: 'carrier',
            label: 'Carrier',
            value: ''
          },
          {
            key: 'status',
            label: 'Status',
            value: 'ISSUED'
          }
        ],
        auxiliaryFields: [
          {
            key: 'client',
            label: 'Client',
            value: ''
          }
        ],
        backFields: [
          {
            key: 'orderId',
            label: 'Order ID',
            value: ''
          },
          {
            key: 'parentId',
            label: 'Schedule ID',
            value: ''
          }
        ]
      }
    }
  },
  google: {
    parentClass: {
      issuerName: 'sbcwallet Logistics',
      reviewStatus: 'UNDER_REVIEW'
    },
    parentObject: {
      state: 'ACTIVE',
      cardTitle: {
        header: 'Program Entry Schedule',
        body: ''
      }
    },
    childObject: {
      state: 'ACTIVE',
      cardTitle: {
        header: 'Transport Order',
        body: ''
      }
    }
  }
}

export const logisticsProfile: ProfileConfig = {
  name: 'logistics',
  fieldMap,
  statusFlow,
  defaultTemplates
}

export default logisticsProfile
