import { GoogleAuth } from 'google-auth-library'
import 'dotenv/config'

const ISSUER_ID = process.env.GOOGLE_ISSUER_ID!
const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_SA_JSON!

async function setupGoogleWalletClasses() {
  console.log('🔧 Setting up Google Wallet Classes\n')

  if (!ISSUER_ID || !SERVICE_ACCOUNT_FILE) {
    console.error('❌ Missing environment variables')
    console.log('Please ensure GOOGLE_ISSUER_ID and GOOGLE_SA_JSON are set in .env')
    process.exit(1)
  }

  const auth = new GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
  })

  const client = await auth.getClient()
  const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1'

  // Classes to create
  const classes = [
    {
      id: `${ISSUER_ID}.logistics_parent`,
      name: 'Logistics Parent (PES)',
      type: 'parent'
    },
    {
      id: `${ISSUER_ID}.logistics_child`,
      name: 'Logistics Child (Transport Order)',
      type: 'child'
    },
    {
      id: `${ISSUER_ID}.healthcare_parent`,
      name: 'Healthcare Parent (Appointment Batch)',
      type: 'parent'
    },
    {
      id: `${ISSUER_ID}.healthcare_child`,
      name: 'Healthcare Child (Patient Visit)',
      type: 'child'
    }
  ]

  for (const classInfo of classes) {
    const classPayload = {
      id: classInfo.id,
      issuerName: 'sbcwallet',
      reviewStatus: 'UNDER_REVIEW',
      classTemplateInfo: {
        cardTemplateOverride: {
          cardRowTemplateInfos: [
            {
              twoItems: {
                startItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.textModulesData['carrier']"
                      }
                    ]
                  }
                },
                endItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.textModulesData['status']"
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }

    try {
      const response = await client.request({
        url: `${baseUrl}/genericClass`,
        method: 'POST',
        data: classPayload
      })
      console.log(`✅ Created class: ${classInfo.name}`)
      console.log(`   ID: ${classInfo.id}`)
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log(`ℹ️  Class already exists: ${classInfo.name}`)
      } else {
        console.error(`❌ Error creating ${classInfo.name}:`)
        console.error(error.response?.data || error.message)
      }
    }
  }

  console.log('\n✅ Setup complete!')
  console.log('\nNow you can create pass objects using the API.')
}

setupGoogleWalletClasses().catch(console.error)
