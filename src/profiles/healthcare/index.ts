import type { ProfileConfig, ProfileFieldMap, HealthcareStatus } from '../../types.js'

export const statusFlow: HealthcareStatus[] = [
  'SCHEDULED',
  'CHECKIN',
  'PROCEDURE',
  'DISCHARGED'
]

export const fieldMap: ProfileFieldMap = {
  parent: {
    programName: { label: 'Appointment Batch', key: 'programName' },
    site: { label: 'Location', key: 'site' },
    windowFrom: { label: 'Date Start', key: 'window.from' },
    windowTo: { label: 'Date End', key: 'window.to' },
    capacity: { label: 'Total Slots', key: 'capacity' }
  },
  child: {
    patientName: { label: 'Patient', key: 'patientName' },
    doctor: { label: 'Doctor', key: 'doctor' },
    procedure: { label: 'Procedure', key: 'procedure' },
    status: { label: 'Status', key: 'status' },
    parentId: { label: 'Batch ID', key: 'parentId' }
  }
}

export const defaultTemplates = {
  apple: {
    parent: {
      formatVersion: 1,
      organizationName: 'sbcwallet Healthcare',
      description: 'Appointment Batch',
      backgroundColor: 'rgb(100, 149, 237)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(220, 230, 255)',
      logoText: 'Health',
      generic: {
        primaryFields: [
          {
            key: 'programName',
            label: 'Appointment Batch',
            value: ''
          }
        ],
        secondaryFields: [
          {
            key: 'site',
            label: 'Location',
            value: ''
          }
        ],
        auxiliaryFields: [
          {
            key: 'windowFrom',
            label: 'Start Date',
            value: ''
          },
          {
            key: 'windowTo',
            label: 'End Date',
            value: ''
          }
        ],
        backFields: [
          {
            key: 'batchId',
            label: 'Batch ID',
            value: ''
          },
          {
            key: 'capacity',
            label: 'Total Slots',
            value: ''
          }
        ]
      }
    },
    child: {
      formatVersion: 1,
      organizationName: 'sbcwallet Healthcare',
      description: 'Patient Visit',
      backgroundColor: 'rgb(72, 201, 176)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(200, 255, 240)',
      logoText: 'Health',
      generic: {
        primaryFields: [
          {
            key: 'patientName',
            label: 'Patient',
            value: ''
          }
        ],
        secondaryFields: [
          {
            key: 'doctor',
            label: 'Doctor',
            value: ''
          },
          {
            key: 'status',
            label: 'Status',
            value: 'SCHEDULED'
          }
        ],
        auxiliaryFields: [
          {
            key: 'procedure',
            label: 'Procedure',
            value: ''
          }
        ],
        backFields: [
          {
            key: 'visitId',
            label: 'Visit ID',
            value: ''
          },
          {
            key: 'parentId',
            label: 'Batch ID',
            value: ''
          }
        ]
      }
    }
  },
  google: {
    parentClass: {
      issuerName: 'sbcwallet Healthcare',
      reviewStatus: 'UNDER_REVIEW'
    },
    parentObject: {
      state: 'ACTIVE',
      cardTitle: {
        header: 'Appointment Batch',
        body: ''
      }
    },
    childObject: {
      state: 'ACTIVE',
      cardTitle: {
        header: 'Patient Visit',
        body: ''
      }
    }
  }
}

export const healthcareProfile: ProfileConfig = {
  name: 'healthcare',
  fieldMap,
  statusFlow,
  defaultTemplates
}

export default healthcareProfile
