import type {
  GooglePassConfig,
  GooglePassType,
  WalletPassInput,
  BoardingPassInput,
  EventTicketInput,
  StoreCardInput,
  CouponInput,
  GiftCardInput,
  TransitPassInput,
  GenericPassInput,
  GeoLocation
} from '../types.js'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { GoogleAuth } from 'google-auth-library'
import { logDebug, logWarn, logError } from '../utils/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Google Wallet Adapter - Supports all Google pass types:
 * - Loyalty (loyalty cards, membership)
 * - Gift Card (store credit, prepaid)
 * - Offer (coupons, discounts)
 * - Event Ticket (concerts, sports, movies)
 * - Flight (boarding passes)
 * - Transit (trains, buses, ferries)
 * - Generic (anything else)
 */
export class GoogleWalletMultiAdapter {
  private config: GooglePassConfig
  private auth: GoogleAuth | null = null

  constructor(config?: Partial<GooglePassConfig>) {
    this.config = {
      issuerId: config?.issuerId || process.env.GOOGLE_ISSUER_ID || 'test-issuer',
      serviceAccountPath: config?.serviceAccountPath || process.env.GOOGLE_SA_JSON
    }

    if (this.config.serviceAccountPath) {
      this.auth = new GoogleAuth({
        keyFile: this.config.serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
      })
    }
  }

  /**
   * Generate a Google Wallet pass for any pass type
   */
  async generatePass(
    passId: string,
    input: WalletPassInput,
    options?: { createClass?: boolean; classId?: string }
  ): Promise<{ object: any; saveUrl: string; classId?: string }> {
    const passType = this.mapToGooglePassType(input.passType)
    const classId = options?.classId || `${this.config.issuerId}.${passType}_class_${Date.now()}`
    const objectId = `${this.config.issuerId}.${passId}`

    // Build class and object based on type
    let classPayload: any = null
    let objectPayload: any

    switch (input.passType) {
      case 'boardingPass':
        const result = this.buildFlight(objectId, classId, input as BoardingPassInput)
        classPayload = result.class
        objectPayload = result.object
        break
      case 'eventTicket':
        const eventResult = this.buildEventTicket(objectId, classId, input as EventTicketInput)
        classPayload = eventResult.class
        objectPayload = eventResult.object
        break
      case 'storeCard':
        const loyaltyResult = this.buildLoyalty(objectId, classId, input as StoreCardInput)
        classPayload = loyaltyResult.class
        objectPayload = loyaltyResult.object
        break
      case 'coupon':
        const offerResult = this.buildOffer(objectId, classId, input as CouponInput)
        classPayload = offerResult.class
        objectPayload = offerResult.object
        break
      case 'giftCard':
        const giftResult = this.buildGiftCard(objectId, classId, input as GiftCardInput)
        classPayload = giftResult.class
        objectPayload = giftResult.object
        break
      case 'transit':
        const transitResult = this.buildTransit(objectId, classId, input as TransitPassInput)
        classPayload = transitResult.class
        objectPayload = transitResult.object
        break
      // Handle Google-specific pass types that may come from mapToGooglePassType
      case 'loyalty' as any:
        const storeResult = this.buildLoyalty(objectId, classId, input as unknown as StoreCardInput)
        classPayload = storeResult.class
        objectPayload = storeResult.object
        break
      case 'offer' as any:
        const couponResult = this.buildOffer(objectId, classId, input as unknown as CouponInput)
        classPayload = couponResult.class
        objectPayload = couponResult.object
        break
      case 'flight' as any:
        const flightResult = this.buildFlight(objectId, classId, input as unknown as BoardingPassInput)
        classPayload = flightResult.class
        objectPayload = flightResult.object
        break
      case 'generic':
      default:
        const genericResult = this.buildGeneric(objectId, classId, input as GenericPassInput)
        classPayload = genericResult.class
        objectPayload = genericResult.object
        break
    }

    // Create class if needed
    if (options?.createClass && classPayload && this.auth) {
      try {
        await this.upsertInAPI(this.getClassResourceType(passType), classPayload)
        logDebug(`✅ Created ${passType} class: ${classId}`)
      } catch (error) {
        logWarn(`Failed to create class: ${error}`)
      }
    }

    // Create object in API
    if (this.auth) {
      try {
        await this.upsertInAPI(this.getObjectResourceType(passType), objectPayload)
        logDebug(`✅ Created ${passType} object: ${objectId}`)
      } catch (error) {
        logWarn(`Failed to create object: ${error}`)
      }
    }

    // Generate save URL
    const saveUrl = await this.generateSaveUrl(objectPayload, this.getObjectPayloadKey(passType))

    return {
      object: objectPayload,
      saveUrl,
      classId
    }
  }

  /**
   * Map input pass type to Google pass type
   */
  private mapToGooglePassType(passType: string): GooglePassType {
    const mapping: Record<string, GooglePassType> = {
      'boardingPass': 'flight',
      'eventTicket': 'eventTicket',
      'storeCard': 'loyalty',
      'coupon': 'offer',
      'generic': 'generic',
      'loyalty': 'loyalty',
      'giftCard': 'giftCard',
      'offer': 'offer',
      'flight': 'flight',
      'transit': 'transit'
    }
    return mapping[passType] || 'generic'
  }

  /**
   * Build Flight (Boarding Pass)
   */
  private buildFlight(objectId: string, classId: string, input: BoardingPassInput): { class: any; object: any } {
    const flightClass = {
      id: classId,
      issuerName: input.carrier,
      reviewStatus: 'UNDER_REVIEW',
      localScheduledDepartureDateTime: `${input.departureDate}T${input.departureTime || '00:00'}`,
      localBoardingDateTime: input.boardingTime ? `${input.departureDate}T${input.boardingTime}` : undefined,
      localScheduledArrivalDateTime: input.arrivalDate && input.arrivalTime 
        ? `${input.arrivalDate}T${input.arrivalTime}` 
        : undefined,
      flightHeader: {
        carrier: {
          carrierIataCode: input.carrierCode || '',
          airlineName: {
            defaultValue: { language: 'en-US', value: input.carrier }
          }
        },
        flightNumber: input.flightNumber || input.tripNumber || '',
        operatingCarrier: input.operatingCarrier ? {
          carrierIataCode: input.operatingCarrier
        } : undefined,
        operatingFlightNumber: input.operatingFlightNumber
      },
      origin: {
        airportIataCode: input.originCode,
        terminal: input.departureTerminal,
        gate: input.gate
      },
      destination: {
        airportIataCode: input.destinationCode,
        terminal: input.arrivalTerminal
      },
      flightStatus: 'SCHEDULED',
      hexBackgroundColor: '#005293'
    }

    const flightObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      passengerName: input.passengerName,
      boardingAndSeatingInfo: {
        boardingGroup: input.boardingGroup,
        seatNumber: input.seat,
        seatClass: input.seatClass,
        boardingDoor: input.zone
      },
      reservationInfo: {
        confirmationCode: input.confirmationCode,
        eticketNumber: input.eTicketNumber,
        frequentFlyerInfo: input.frequentFlyerProgram ? {
          frequentFlyerProgramName: {
            defaultValue: { language: 'en-US', value: input.frequentFlyerProgram }
          },
          frequentFlyerNumber: input.frequentFlyerNumber
        } : undefined
      },
      barcode: {
        type: 'QR_CODE',
        value: input.confirmationCode
      },
      hexBackgroundColor: '#005293'
    }

    return { class: flightClass, object: flightObject }
  }

  /**
   * Build Event Ticket
   */
  private buildEventTicket(objectId: string, classId: string, input: EventTicketInput): { class: any; object: any } {
    const eventClass = {
      id: classId,
      issuerName: input.venueName,
      reviewStatus: 'UNDER_REVIEW',
      eventName: {
        defaultValue: { language: 'en-US', value: input.eventName }
      },
      venue: {
        name: { defaultValue: { language: 'en-US', value: input.venueName } },
        address: input.venueAddress ? { defaultValue: { language: 'en-US', value: input.venueAddress } } : undefined
      },
      dateTime: {
        start: input.eventDate,
        end: input.eventEndDate,
        doorsOpen: input.doorsOpen
      },
      hexBackgroundColor: input.metadata?.backgroundColor || '#800080'
    }

    const eventObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      ticketHolderName: input.ticketHolderName || '',
      ticketNumber: input.ticketNumber,
      seatInfo: {
        seat: input.seat ? { defaultValue: { language: 'en-US', value: input.seat } } : undefined,
        row: input.row ? { defaultValue: { language: 'en-US', value: input.row } } : undefined,
        section: input.section ? { defaultValue: { language: 'en-US', value: input.section } } : undefined,
        gate: input.gate ? { defaultValue: { language: 'en-US', value: input.gate } } : undefined
      },
      faceValue: input.price ? {
        currencyCode: input.currency || 'USD',
        micros: input.price * 1000000
      } : undefined,
      barcode: {
        type: 'QR_CODE',
        value: input.ticketNumber
      },
      hexBackgroundColor: input.metadata?.backgroundColor || '#800080',
      textModulesData: input.eventDetails ? [{
        id: 'eventDetails',
        header: 'Event Details',
        body: input.eventDetails
      }] : []
    }

    return { class: eventClass, object: eventObject }
  }

  /**
   * Build Loyalty (Store Card)
   */
  private buildLoyalty(objectId: string, classId: string, input: StoreCardInput): { class: any; object: any } {
    const loyaltyClass = {
      id: classId,
      issuerName: input.storeName || input.programName,
      reviewStatus: 'UNDER_REVIEW',
      programName: input.programName,
      hexBackgroundColor: input.backgroundColor || '#111827',
      homepageUri: input.website ? {
        uri: input.website,
        description: 'Website'
      } : undefined
    }

    const loyaltyObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      accountId: input.memberId,
      accountName: input.memberName,
      loyaltyPoints: {
        label: input.pointsLabel || 'Points',
        balance: { int: input.points || 0 }
      },
      secondaryLoyaltyPoints: input.secondaryPoints ? {
        label: input.secondaryPointsLabel || 'Bonus',
        balance: { int: input.secondaryPoints }
      } : undefined,
      barcode: {
        type: 'QR_CODE',
        value: input.memberId
      },
      textModulesData: [
        input.tier ? { id: 'tier', header: input.tierLabel || 'Status', body: input.tier } : null,
        input.availableRewards ? { id: 'rewards', header: 'Rewards', body: input.availableRewards } : null
      ].filter(Boolean)
    }

    return { class: loyaltyClass, object: loyaltyObject }
  }

  /**
   * Build Offer (Coupon)
   */
  private buildOffer(objectId: string, classId: string, input: CouponInput): { class: any; object: any } {
    const offerClass = {
      id: classId,
      issuerName: input.storeName,
      reviewStatus: 'UNDER_REVIEW',
      provider: input.storeName,
      title: input.discount,
      redemptionChannel: input.redemptionType || 'BOTH',
      hexBackgroundColor: input.backgroundColor || '#dc3545',
      localizedTitle: {
        defaultValue: { language: 'en-US', value: input.discount }
      },
      localizedProvider: {
        defaultValue: { language: 'en-US', value: input.storeName }
      },
      details: input.offerDescription,
      finePrint: input.finePrint || input.terms,
      helpUri: input.supportUrl ? {
        uri: input.supportUrl,
        description: 'Help'
      } : undefined
    }

    const offerObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      validTimeInterval: {
        start: { date: input.validFrom || new Date().toISOString().split('T')[0] },
        end: { date: input.validUntil }
      },
      barcode: {
        type: 'QR_CODE',
        value: input.promoCode || objectId
      },
      hexBackgroundColor: input.backgroundColor || '#dc3545',
      textModulesData: [
        { id: 'offer', header: 'Offer', body: input.offerTitle },
        input.terms ? { id: 'terms', header: 'Terms & Conditions', body: input.terms } : null,
        input.restrictions ? { id: 'restrictions', header: 'Restrictions', body: input.restrictions } : null
      ].filter(Boolean)
    }

    return { class: offerClass, object: offerObject }
  }

  /**
   * Build Gift Card
   */
  private buildGiftCard(objectId: string, classId: string, input: GiftCardInput): { class: any; object: any } {
    const giftCardClass = {
      id: classId,
      issuerName: input.merchantName,
      reviewStatus: 'UNDER_REVIEW',
      merchantName: input.merchantName,
      pinLabel: input.pin ? 'PIN' : undefined,
      hexBackgroundColor: input.backgroundColor || '#111827',
      homepageUri: input.balanceCheckUrl || input.website ? {
        uri: input.balanceCheckUrl || input.website,
        description: 'Check Balance'
      } : undefined,
      localizedMerchantName: {
        defaultValue: { language: 'en-US', value: input.merchantName }
      }
    }

    const giftCardObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      cardNumber: input.cardNumber,
      pin: input.pin,
      balance: {
        currencyCode: input.currency,
        micros: input.balance * 1000000
      },
      balanceUpdateTime: {
        date: new Date().toISOString()
      },
      eventNumber: input.eventNumber,
      barcode: {
        type: 'CODE_128',
        value: input.cardNumber
      },
      hexBackgroundColor: input.backgroundColor || '#111827',
      textModulesData: input.cardHolderName ? [{
        id: 'cardHolder',
        header: 'Card Holder',
        body: input.cardHolderName
      }] : []
    }

    return { class: giftCardClass, object: giftCardObject }
  }

  /**
   * Build Transit Pass
   */
  private buildTransit(objectId: string, classId: string, input: TransitPassInput): { class: any; object: any } {
    const firstLeg = input.ticketLegs[0]

    const transitClass = {
      id: classId,
      issuerName: input.operatorName || firstLeg.transitOperator || 'Transit',
      reviewStatus: 'UNDER_REVIEW',
      transitType: input.transitType,
      logo: input.logoUrl ? { sourceUri: { uri: input.logoUrl } } : undefined,
      transitOperatorName: {
        defaultValue: { language: 'en-US', value: input.operatorName || firstLeg.transitOperator || 'Transit' }
      },
      hexBackgroundColor: input.backgroundColor || '#1a73e8'
    }

    const transitObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      passengerType: input.passengerType === 'ADULT' ? 'SINGLE_PASSENGER' : 'SINGLE_PASSENGER',
      passengerNames: input.passengerName || '',
      tripType: input.tripType || 'ONE_WAY',
      ticketStatus: input.ticketStatus || 'ACTIVE',
      concessionCategory: input.passengerType || 'ADULT',
      ticketLegs: input.ticketLegs.map(leg => ({
        originStationCode: leg.originCode,
        originName: { defaultValue: { language: 'en-US', value: leg.originName } },
        destinationStationCode: leg.destinationCode,
        destinationName: { defaultValue: { language: 'en-US', value: leg.destinationName } },
        departureDateTime: leg.departureDateTime,
        arrivalDateTime: leg.arrivalDateTime,
        fareName: leg.fare ? { defaultValue: { language: 'en-US', value: leg.fare } } : undefined,
        carriage: leg.carriage,
        platform: leg.platform,
        zone: leg.zone,
        ticketSeat: leg.seat ? {
          seat: { defaultValue: { language: 'en-US', value: leg.seat } },
          coach: leg.coach
        } : undefined,
        transitOperatorName: leg.transitOperator ? {
          defaultValue: { language: 'en-US', value: leg.transitOperator }
        } : undefined
      })),
      barcode: {
        type: 'QR_CODE',
        value: input.ticketNumber || objectId
      },
      hexBackgroundColor: input.backgroundColor || '#1a73e8'
    }

    return { class: transitClass, object: transitObject }
  }

  /**
   * Build Generic Pass
   */
  private buildGeneric(objectId: string, classId: string, input: GenericPassInput): { class: any; object: any } {
    const genericClass = {
      id: classId,
      issuerName: input.cardTitle,
      reviewStatus: 'UNDER_REVIEW',
      hexBackgroundColor: input.backgroundColor || '#4a90e2'
    }

    const genericObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      cardTitle: {
        defaultValue: { language: 'en-US', value: input.cardTitle }
      },
      header: {
        defaultValue: { language: 'en-US', value: input.header }
      },
      subheader: input.subheader ? {
        defaultValue: { language: 'en-US', value: input.subheader }
      } : undefined,
      logo: input.logoUrl ? { sourceUri: { uri: input.logoUrl } } : undefined,
      heroImage: input.heroImageUrl ? { sourceUri: { uri: input.heroImageUrl } } : undefined,
      hexBackgroundColor: input.backgroundColor || '#4a90e2',
      barcode: input.barcodeValue ? {
        type: input.barcodeType || 'QR_CODE',
        value: input.barcodeValue
      } : undefined,
      textModulesData: (input.fields || []).map(f => ({
        id: f.key,
        header: f.label,
        body: f.value
      })),
      linksModuleData: input.links?.length ? {
        uris: input.links.map((link, idx) => ({
          id: String(idx + 1),
          uri: link.url,
          description: link.label
        }))
      } : undefined,
      locations: input.locations,
      validTimeInterval: input.validFrom || input.validUntil ? {
        start: input.validFrom ? { date: input.validFrom } : undefined,
        end: input.validUntil ? { date: input.validUntil } : undefined
      } : undefined
    }

    return { class: genericClass, object: genericObject }
  }

  /**
   * Get class resource type for API
   */
  private getClassResourceType(passType: GooglePassType): string {
    const map: Record<GooglePassType, string> = {
      'loyalty': 'loyaltyClass',
      'giftCard': 'giftCardClass',
      'offer': 'offerClass',
      'eventTicket': 'eventTicketClass',
      'flight': 'flightClass',
      'transit': 'transitClass',
      'generic': 'genericClass'
    }
    return map[passType] || 'genericClass'
  }

  /**
   * Get object resource type for API
   */
  private getObjectResourceType(passType: GooglePassType): string {
    const map: Record<GooglePassType, string> = {
      'loyalty': 'loyaltyObject',
      'giftCard': 'giftCardObject',
      'offer': 'offerObject',
      'eventTicket': 'eventTicketObject',
      'flight': 'flightObject',
      'transit': 'transitObject',
      'generic': 'genericObject'
    }
    return map[passType] || 'genericObject'
  }

  /**
   * Get object payload key for JWT
   */
  private getObjectPayloadKey(passType: GooglePassType): string {
    const map: Record<GooglePassType, string> = {
      'loyalty': 'loyaltyObjects',
      'giftCard': 'giftCardObjects',
      'offer': 'offerObjects',
      'eventTicket': 'eventTicketObjects',
      'flight': 'flightObjects',
      'transit': 'transitObjects',
      'generic': 'genericObjects'
    }
    return map[passType] || 'genericObjects'
  }

  /**
   * Generate Save URL with signed JWT
   */
  private async generateSaveUrl(passObject: any, payloadKey: string): Promise<string> {
    const baseUrl = 'https://pay.google.com/gp/v/save'

    if (!this.config.serviceAccountPath) {
      logWarn('No service account - returning unsigned URL')
      return `${baseUrl}/${encodeURIComponent(passObject.id)}`
    }

    try {
      const serviceAccount = JSON.parse(await readFile(this.config.serviceAccountPath, 'utf-8'))

      const claims = {
        iss: serviceAccount.client_email,
        aud: 'google',
        origins: [],
        typ: 'savetowallet',
        payload: {
          [payloadKey]: [passObject]
        }
      }

      const { default: jwt } = await import('jsonwebtoken')
      const token = jwt.sign(claims, serviceAccount.private_key, {
        algorithm: 'RS256'
      })

      return `${baseUrl}/${token}`
    } catch (error) {
      logError('Error generating signed JWT:', error)
      return `${baseUrl}/${encodeURIComponent(passObject.id)}`
    }
  }

  /**
   * Upsert resource in Google Wallet API
   */
  private async upsertInAPI(resourceType: string, payload: any): Promise<void> {
    if (!this.auth) {
      throw new Error('Google Auth not initialized')
    }

    const client = await this.auth.getClient()
    const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1'

    try {
      await client.request({
        url: `${baseUrl}/${resourceType}`,
        method: 'POST',
        data: payload
      })
      logDebug(`✅ ${resourceType} created`)
    } catch (error: any) {
      if (error.response?.status === 409) {
        // Already exists, update it
        logDebug(`ℹ️ ${resourceType} exists, updating...`)
        await client.request({
          url: `${baseUrl}/${resourceType}/${payload.id}`,
          method: 'PUT',
          data: payload
        })
        logDebug(`✅ ${resourceType} updated`)
      } else {
        throw error
      }
    }
  }

  /**
   * Update pass object in API
   */
  async updatePassObject(objectId: string, passType: GooglePassType, updates: Partial<any>): Promise<void> {
    if (!this.auth) {
      throw new Error('Google Auth not initialized')
    }

    const client = await this.auth.getClient()
    const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1'
    const resourceType = this.getObjectResourceType(passType)

    // Get current object
    const { data: currentObject } = await client.request<Record<string, any>>({
      url: `${baseUrl}/${resourceType}/${objectId}`,
      method: 'GET'
    })

    // Merge updates
    const updatedObject = { ...(currentObject as object), ...updates }

    // Update
    await client.request({
      url: `${baseUrl}/${resourceType}/${objectId}`,
      method: 'PUT',
      data: updatedObject
    })

    logDebug(`✅ ${resourceType} ${objectId} updated`)
  }

  /**
   * Add message to pass
   */
  async addMessage(
    objectId: string,
    passType: GooglePassType,
    message: { header: string; body: string; messageType?: string }
  ): Promise<void> {
    if (!this.auth) {
      throw new Error('Google Auth not initialized')
    }

    const client = await this.auth.getClient()
    const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1'
    const resourceType = this.getObjectResourceType(passType)

    await client.request({
      url: `${baseUrl}/${resourceType}/${encodeURIComponent(objectId)}/addMessage`,
      method: 'POST',
      data: {
        message: {
          header: message.header,
          body: message.body,
          messageType: message.messageType || 'TEXT_AND_NOTIFY'
        }
      }
    })

    logDebug(`✅ Message added to ${objectId}`)
  }
}

export default GoogleWalletMultiAdapter
