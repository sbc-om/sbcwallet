import { PKPass } from 'passkit-generator'
import type {
  ApplePassConfig,
  ApplePassType,
  WalletPassInput,
  BoardingPassInput,
  EventTicketInput,
  StoreCardInput,
  CouponInput,
  GiftCardInput,
  TransitPassInput,
  GenericPassInput,
  AppleTransitType
} from '../types.js'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Apple Wallet Adapter - Supports all Apple pass types:
 * - Boarding Pass (flights, trains, buses, boats)
 * - Event Ticket (concerts, sports, movies)
 * - Store Card (loyalty, membership, gift cards)
 * - Coupon (offers, discounts)
 * - Generic (anything else)
 */
export class AppleWalletMultiAdapter {
  private config: ApplePassConfig

  constructor(config?: Partial<ApplePassConfig>) {
    this.config = {
      teamId: config?.teamId || process.env.APPLE_TEAM_ID || '',
      passTypeId: config?.passTypeId || process.env.APPLE_PASS_TYPE_ID || '',
      certPath: config?.certPath || process.env.APPLE_CERT_PATH || '',
      certPassword: config?.certPassword || process.env.APPLE_CERT_PASSWORD || '',
      wwdrPath: config?.wwdrPath || process.env.APPLE_WWDR_PATH || ''
    }
  }

  /**
   * Generate a .pkpass file for any pass type
   */
  async generatePass(
    passId: string,
    input: WalletPassInput
  ): Promise<Buffer> {
    const passType = this.mapToApplePassType(input.passType)
    
    // Load base template
    const templatePath = join(__dirname, '..', 'templates', 'apple', `${passType}.json`)
    let baseTemplate: any
    
    try {
      const templateContent = await readFile(templatePath, 'utf-8')
      baseTemplate = JSON.parse(templateContent)
    } catch {
      // Fallback to generic template
      const genericPath = join(__dirname, '..', 'templates', 'apple', 'generic.json')
      const content = await readFile(genericPath, 'utf-8')
      baseTemplate = JSON.parse(content)
    }

    // Build pass based on type
    let passProps: any

    switch (input.passType) {
      case 'boardingPass':
        passProps = this.buildBoardingPass(passId, input as BoardingPassInput, baseTemplate)
        break
      case 'eventTicket':
        passProps = this.buildEventTicket(passId, input as EventTicketInput, baseTemplate)
        break
      case 'storeCard':
        passProps = this.buildStoreCard(passId, input as StoreCardInput, baseTemplate)
        break
      case 'coupon':
        passProps = this.buildCoupon(passId, input as CouponInput, baseTemplate)
        break
      case 'giftCard':
        // Apple uses storeCard for gift cards
        passProps = this.buildGiftCardAsStoreCard(passId, input as GiftCardInput, baseTemplate)
        break
      case 'transit':
        // Apple uses boardingPass for transit
        passProps = this.buildTransitAsBoardingPass(passId, input as TransitPassInput, baseTemplate)
        break
      case 'generic':
      default:
        passProps = this.buildGenericPass(passId, input as GenericPassInput, baseTemplate)
        break
    }

    // Create and sign pass
    const pass = new PKPass(
      {},
      {
        wwdr: this.config.wwdrPath,
        signerCert: this.config.certPath,
        signerKey: this.config.certPath,
        signerKeyPassphrase: this.config.certPassword
      },
      passProps
    )

    return await pass.getAsBuffer()
  }

  /**
   * Map input pass type to Apple pass type
   */
  private mapToApplePassType(passType: string): ApplePassType {
    const mapping: Record<string, ApplePassType> = {
      'boardingPass': 'boardingPass',
      'eventTicket': 'eventTicket',
      'storeCard': 'storeCard',
      'coupon': 'coupon',
      'generic': 'generic',
      // Google-specific types mapped to Apple equivalents
      'loyalty': 'storeCard',
      'giftCard': 'storeCard',
      'offer': 'coupon',
      'flight': 'boardingPass',
      'transit': 'boardingPass'
    }
    return mapping[passType] || 'generic'
  }

  /**
   * Build Boarding Pass
   */
  private buildBoardingPass(passId: string, input: BoardingPassInput, template: any): any {
    const transitType = this.mapTransitType(input.transitType as string)
    
    return {
      serialNumber: passId,
      passTypeIdentifier: this.config.passTypeId,
      teamIdentifier: this.config.teamId,
      organizationName: input.carrier,
      description: `${input.carrier} ${input.flightNumber || input.tripNumber || 'Boarding Pass'}`,
      backgroundColor: template.backgroundColor || 'rgb(0, 82, 147)',
      foregroundColor: template.foregroundColor || 'rgb(255, 255, 255)',
      labelColor: template.labelColor || 'rgb(200, 220, 255)',
      logoText: input.carrier,
      boardingPass: {
        transitType,
        headerFields: [
          { key: 'gate', label: 'GATE', value: input.gate || '' }
        ],
        primaryFields: [
          { key: 'origin', label: input.originCode, value: input.originName || input.originCode },
          { key: 'destination', label: input.destinationCode, value: input.destinationName || input.destinationCode }
        ],
        secondaryFields: [
          { key: 'passenger', label: 'PASSENGER', value: input.passengerName },
          { key: 'class', label: 'CLASS', value: input.seatClass || 'Economy' }
        ],
        auxiliaryFields: [
          { key: 'flightNumber', label: 'FLIGHT', value: input.flightNumber || input.tripNumber || '' },
          { key: 'date', label: 'DATE', value: this.formatDate(input.departureDate) },
          { key: 'boardingTime', label: 'BOARDING', value: input.boardingTime || '' },
          { key: 'seat', label: 'SEAT', value: input.seat || '' }
        ],
        backFields: [
          { key: 'confirmationCode', label: 'Confirmation Code', value: input.confirmationCode },
          { key: 'boardingGroup', label: 'Boarding Group', value: input.boardingGroup || '' },
          { key: 'departureTerminal', label: 'Departure Terminal', value: input.departureTerminal || '' },
          { key: 'arrivalTerminal', label: 'Arrival Terminal', value: input.arrivalTerminal || '' }
        ]
      },
      barcodes: [
        {
          message: input.confirmationCode,
          format: 'PKBarcodeFormatQR',
          messageEncoding: 'iso-8859-1'
        }
      ],
      semantics: {
        airlineCode: input.carrierCode,
        flightNumber: input.flightNumber,
        departureAirportCode: input.originCode,
        arrivalAirportCode: input.destinationCode,
        departureGate: input.gate,
        boardingGroup: input.boardingGroup,
        seatNumber: input.seat,
        passengerName: {
          familyName: input.passengerLastName || '',
          givenName: input.passengerFirstName || input.passengerName
        }
      }
    }
  }

  /**
   * Build Event Ticket
   */
  private buildEventTicket(passId: string, input: EventTicketInput, template: any): any {
    return {
      serialNumber: passId,
      passTypeIdentifier: this.config.passTypeId,
      teamIdentifier: this.config.teamId,
      organizationName: input.venueName,
      description: input.eventName,
      backgroundColor: input.metadata?.backgroundColor || template.backgroundColor || 'rgb(128, 0, 128)',
      foregroundColor: template.foregroundColor || 'rgb(255, 255, 255)',
      labelColor: template.labelColor || 'rgb(220, 200, 255)',
      logoText: input.venueName,
      eventTicket: {
        headerFields: [
          { key: 'date', label: 'DATE', value: this.formatDate(input.eventDate) }
        ],
        primaryFields: [
          { key: 'eventName', label: 'EVENT', value: input.eventName }
        ],
        secondaryFields: [
          { key: 'venue', label: 'VENUE', value: input.venueName },
          { key: 'location', label: 'LOCATION', value: input.venueAddress || '' }
        ],
        auxiliaryFields: [
          { key: 'section', label: 'SEC', value: input.section || '' },
          { key: 'row', label: 'ROW', value: input.row || '' },
          { key: 'seat', label: 'SEAT', value: input.seat || '' },
          { key: 'doors', label: 'DOORS', value: input.doorsOpen || '' }
        ],
        backFields: [
          { key: 'ticketNumber', label: 'Ticket Number', value: input.ticketNumber },
          { key: 'purchaser', label: 'Purchaser', value: input.purchaserName || '' },
          { key: 'eventDetails', label: 'Event Details', value: input.eventDetails || '' },
          { key: 'terms', label: 'Terms & Conditions', value: input.terms || '' }
        ]
      },
      barcodes: [
        {
          message: input.ticketNumber,
          format: 'PKBarcodeFormatQR',
          messageEncoding: 'iso-8859-1'
        }
      ],
      semantics: {
        eventName: input.eventName,
        eventType: input.eventType,
        venueLocation: input.venueLatitude && input.venueLongitude ? {
          latitude: input.venueLatitude,
          longitude: input.venueLongitude
        } : undefined,
        venueAddress: input.venueAddress,
        venueName: input.venueName,
        doorTime: input.doorsOpen,
        eventStartDate: input.eventDate,
        eventEndDate: input.eventEndDate
      }
    }
  }

  /**
   * Build Store Card (Loyalty)
   */
  private buildStoreCard(passId: string, input: StoreCardInput, template: any): any {
    return {
      serialNumber: passId,
      passTypeIdentifier: this.config.passTypeId,
      teamIdentifier: this.config.teamId,
      organizationName: input.storeName || input.programName,
      description: input.programName,
      backgroundColor: input.backgroundColor || template.backgroundColor || 'rgb(17, 24, 39)',
      foregroundColor: input.foregroundColor || template.foregroundColor || 'rgb(255, 255, 255)',
      labelColor: template.labelColor || 'rgb(180, 180, 180)',
      logoText: input.storeName || input.programName,
      storeCard: {
        headerFields: [
          { key: 'balance', label: input.pointsLabel || 'POINTS', value: String(input.points || 0) }
        ],
        primaryFields: [
          { key: 'memberName', label: 'MEMBER', value: input.memberName }
        ],
        secondaryFields: [
          { key: 'tier', label: input.tierLabel || 'STATUS', value: input.tier || '' },
          { key: 'memberId', label: 'MEMBER ID', value: input.memberId }
        ],
        auxiliaryFields: [
          { key: 'rewards', label: 'REWARDS', value: input.availableRewards || '' },
          { key: 'expiration', label: 'EXPIRES', value: input.expirationDate ? this.formatDate(input.expirationDate) : '' }
        ],
        backFields: [
          { key: 'programName', label: 'Program', value: input.programName },
          { key: 'website', label: 'Website', value: input.website || '' },
          { key: 'terms', label: 'Terms & Conditions', value: input.terms || '' },
          { key: 'support', label: 'Support', value: input.supportEmail || input.supportPhone || '' }
        ]
      },
      barcodes: [
        {
          message: input.memberId,
          format: 'PKBarcodeFormatQR',
          messageEncoding: 'iso-8859-1'
        }
      ]
    }
  }

  /**
   * Build Coupon
   */
  private buildCoupon(passId: string, input: CouponInput, template: any): any {
    return {
      serialNumber: passId,
      passTypeIdentifier: this.config.passTypeId,
      teamIdentifier: this.config.teamId,
      organizationName: input.storeName,
      description: input.offerTitle,
      backgroundColor: input.backgroundColor || template.backgroundColor || 'rgb(220, 53, 69)',
      foregroundColor: template.foregroundColor || 'rgb(255, 255, 255)',
      labelColor: template.labelColor || 'rgb(255, 220, 220)',
      logoText: input.storeName,
      coupon: {
        headerFields: [
          { key: 'discount', label: 'OFF', value: input.discount }
        ],
        primaryFields: [
          { key: 'offerTitle', label: 'OFFER', value: input.offerTitle }
        ],
        secondaryFields: [
          { key: 'storeName', label: 'STORE', value: input.storeName },
          { key: 'promoCode', label: 'CODE', value: input.promoCode || '' }
        ],
        auxiliaryFields: [
          { key: 'validFrom', label: 'VALID FROM', value: input.validFrom ? this.formatDate(input.validFrom) : '' },
          { key: 'expires', label: 'EXPIRES', value: this.formatDate(input.validUntil) }
        ],
        backFields: [
          { key: 'terms', label: 'Terms & Conditions', value: input.terms || '' },
          { key: 'restrictions', label: 'Restrictions', value: input.restrictions || '' },
          { key: 'support', label: 'Support', value: input.supportUrl || '' },
          { key: 'website', label: 'Website', value: input.website || '' }
        ]
      },
      barcodes: [
        {
          message: input.promoCode || passId,
          format: 'PKBarcodeFormatQR',
          messageEncoding: 'iso-8859-1'
        }
      ],
      expirationDate: input.validUntil
    }
  }

  /**
   * Build Gift Card (as Store Card)
   */
  private buildGiftCardAsStoreCard(passId: string, input: GiftCardInput, template: any): any {
    const currencyFormatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: input.currency
    })

    return {
      serialNumber: passId,
      passTypeIdentifier: this.config.passTypeId,
      teamIdentifier: this.config.teamId,
      organizationName: input.merchantName,
      description: `${input.merchantName} Gift Card`,
      backgroundColor: input.backgroundColor || template.backgroundColor || 'rgb(17, 24, 39)',
      foregroundColor: template.foregroundColor || 'rgb(255, 255, 255)',
      labelColor: template.labelColor || 'rgb(180, 180, 180)',
      logoText: input.merchantName,
      storeCard: {
        headerFields: [
          { key: 'balance', label: 'BALANCE', value: currencyFormatter.format(input.balance) }
        ],
        primaryFields: [
          { key: 'cardNumber', label: 'CARD NUMBER', value: this.maskCardNumber(input.cardNumber) }
        ],
        secondaryFields: [
          { key: 'holder', label: 'HOLDER', value: input.cardHolderName || '' },
          { key: 'pin', label: 'PIN', value: input.pin ? '****' : '' }
        ],
        auxiliaryFields: [
          { key: 'expires', label: 'EXPIRES', value: input.expirationDate ? this.formatDate(input.expirationDate) : 'Never' }
        ],
        backFields: [
          { key: 'fullCardNumber', label: 'Card Number', value: input.cardNumber },
          { key: 'pin', label: 'PIN', value: input.pin || '' },
          { key: 'checkBalance', label: 'Check Balance', value: input.balanceCheckUrl || input.website || '' }
        ]
      },
      barcodes: [
        {
          message: input.cardNumber,
          format: 'PKBarcodeFormatCode128',
          messageEncoding: 'iso-8859-1'
        }
      ]
    }
  }

  /**
   * Build Transit Pass (as Boarding Pass)
   */
  private buildTransitAsBoardingPass(passId: string, input: TransitPassInput, template: any): any {
    const firstLeg = input.ticketLegs[0]
    const lastLeg = input.ticketLegs[input.ticketLegs.length - 1]

    const transitTypeMap: Record<string, AppleTransitType> = {
      'BUS': 'PKTransitTypeBus',
      'RAIL': 'PKTransitTypeTrain',
      'TRAM': 'PKTransitTypeTrain',
      'FERRY': 'PKTransitTypeBoat',
      'OTHER': 'PKTransitTypeGeneric'
    }

    return {
      serialNumber: passId,
      passTypeIdentifier: this.config.passTypeId,
      teamIdentifier: this.config.teamId,
      organizationName: input.operatorName || firstLeg.transitOperator || 'Transit',
      description: `${firstLeg.originName} → ${lastLeg.destinationName}`,
      backgroundColor: input.backgroundColor || template.backgroundColor || 'rgb(26, 115, 232)',
      foregroundColor: template.foregroundColor || 'rgb(255, 255, 255)',
      labelColor: template.labelColor || 'rgb(200, 220, 255)',
      logoText: input.operatorName || firstLeg.transitOperator || '',
      boardingPass: {
        transitType: transitTypeMap[input.transitType] || 'PKTransitTypeGeneric',
        headerFields: [
          { key: 'platform', label: 'PLATFORM', value: firstLeg.platform || '' }
        ],
        primaryFields: [
          { key: 'origin', label: firstLeg.originCode || 'FROM', value: firstLeg.originName },
          { key: 'destination', label: lastLeg.destinationCode || 'TO', value: lastLeg.destinationName }
        ],
        secondaryFields: [
          { key: 'passenger', label: 'PASSENGER', value: input.passengerName || '' },
          { key: 'type', label: 'TYPE', value: input.passengerType || 'ADULT' }
        ],
        auxiliaryFields: [
          { key: 'departure', label: 'DEPARTS', value: firstLeg.departureDateTime },
          { key: 'arrival', label: 'ARRIVES', value: lastLeg.arrivalDateTime || '' },
          { key: 'carriage', label: 'COACH', value: firstLeg.coach || firstLeg.carriage || '' },
          { key: 'seat', label: 'SEAT', value: firstLeg.seat || '' }
        ],
        backFields: [
          { key: 'ticketNumber', label: 'Ticket Number', value: input.ticketNumber || passId },
          { key: 'tripType', label: 'Trip Type', value: input.tripType || 'ONE_WAY' },
          { key: 'validUntil', label: 'Valid Until', value: input.validUntil || '' },
          { key: 'zones', label: 'Zones', value: firstLeg.zone || '' }
        ]
      },
      barcodes: [
        {
          message: input.ticketNumber || passId,
          format: 'PKBarcodeFormatQR',
          messageEncoding: 'iso-8859-1'
        }
      ]
    }
  }

  /**
   * Build Generic Pass
   */
  private buildGenericPass(passId: string, input: GenericPassInput, template: any): any {
    // Build secondary fields from custom fields
    const secondaryFields: any[] = []
    const auxiliaryFields: any[] = []
    
    if (input.fields) {
      input.fields.forEach((field, idx) => {
        const fieldObj = { key: field.key, label: field.label, value: field.value }
        if (idx < 2) {
          secondaryFields.push(fieldObj)
        } else {
          auxiliaryFields.push(fieldObj)
        }
      })
    }

    // Build back fields
    const backFields = (input.backFields || []).map(f => ({
      key: f.key,
      label: f.label,
      value: f.value
    }))

    // Add links to back fields
    if (input.links) {
      input.links.forEach((link, idx) => {
        backFields.push({
          key: `link_${idx}`,
          label: link.label,
          value: link.url
        })
      })
    }

    return {
      serialNumber: passId,
      passTypeIdentifier: this.config.passTypeId,
      teamIdentifier: this.config.teamId,
      organizationName: input.cardTitle,
      description: input.header,
      backgroundColor: input.backgroundColor || template.backgroundColor || 'rgb(74, 144, 226)',
      foregroundColor: input.foregroundColor || template.foregroundColor || 'rgb(255, 255, 255)',
      labelColor: template.labelColor || 'rgb(200, 220, 255)',
      logoText: input.cardTitle,
      generic: {
        headerFields: [
          { key: 'type', label: 'TYPE', value: input.subheader || '' }
        ],
        primaryFields: [
          { key: 'title', label: input.primaryLabel || '', value: input.primaryValue || input.header }
        ],
        secondaryFields,
        auxiliaryFields,
        backFields
      },
      barcodes: input.barcodeValue ? [
        {
          message: input.barcodeValue,
          format: this.mapBarcodeFormat(input.barcodeType || 'QR_CODE'),
          messageEncoding: 'iso-8859-1'
        }
      ] : [],
      locations: input.locations?.map(loc => ({
        latitude: loc.latitude,
        longitude: loc.longitude
      })),
      expirationDate: input.validUntil
    }
  }

  /**
   * Map transit type to Apple format
   */
  private mapTransitType(type: string): AppleTransitType {
    const map: Record<string, AppleTransitType> = {
      'PKTransitTypeAir': 'PKTransitTypeAir',
      'PKTransitTypeBoat': 'PKTransitTypeBoat',
      'PKTransitTypeBus': 'PKTransitTypeBus',
      'PKTransitTypeTrain': 'PKTransitTypeTrain',
      'PKTransitTypeGeneric': 'PKTransitTypeGeneric',
      // Google types
      'AIR': 'PKTransitTypeAir',
      'BUS': 'PKTransitTypeBus',
      'RAIL': 'PKTransitTypeTrain',
      'TRAM': 'PKTransitTypeTrain',
      'FERRY': 'PKTransitTypeBoat',
      'OTHER': 'PKTransitTypeGeneric'
    }
    return map[type] || 'PKTransitTypeGeneric'
  }

  /**
   * Map barcode format
   */
  private mapBarcodeFormat(type: string): string {
    const map: Record<string, string> = {
      'QR_CODE': 'PKBarcodeFormatQR',
      'CODE_128': 'PKBarcodeFormatCode128',
      'CODE_39': 'PKBarcodeFormatCode39',
      'AZTEC': 'PKBarcodeFormatAztec',
      'PDF_417': 'PKBarcodeFormatPDF417'
    }
    return map[type] || 'PKBarcodeFormatQR'
  }

  /**
   * Format date for display
   */
  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  /**
   * Mask card number for display
   */
  private maskCardNumber(cardNumber: string): string {
    if (cardNumber.length <= 4) return cardNumber
    return '****' + cardNumber.slice(-4)
  }
}

export default AppleWalletMultiAdapter
