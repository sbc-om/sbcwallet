import { createCanvas } from 'canvas'

export type LogisticsStatus = 'ISSUED' | 'PRESENCE' | 'SCALE' | 'OPS' | 'EXITED'
export type HealthcareStatus = 'SCHEDULED' | 'CHECKIN' | 'PROCEDURE' | 'DISCHARGED'

const LOGISTICS_STEPS = ['ISSUED', 'PRESENCE', 'SCALE', 'OPS', 'EXITED']
const HEALTHCARE_STEPS = ['SCHEDULED', 'CHECKIN', 'PROCEDURE', 'DISCHARGED']

const STATUS_COLORS = {
  ISSUED: { bg: '#4A90E2', text: '#FFFFFF', bar: '#2E5C8A' },
  PRESENCE: { bg: '#F5A623', text: '#FFFFFF', bar: '#C47F1A' },
  SCALE: { bg: '#7B68EE', text: '#FFFFFF', bar: '#5B4BB8' },
  OPS: { bg: '#50E3C2', text: '#1A1A1A', bar: '#3AB89E' },
  EXITED: { bg: '#7ED321', text: '#FFFFFF', bar: '#5FA519' },
  SCHEDULED: { bg: '#4A90E2', text: '#FFFFFF', bar: '#2E5C8A' },
  CHECKIN: { bg: '#F5A623', text: '#FFFFFF', bar: '#C47F1A' },
  PROCEDURE: { bg: '#E94B3C', text: '#FFFFFF', bar: '#B93A2E' },
  DISCHARGED: { bg: '#7ED321', text: '#FFFFFF', bar: '#5FA519' }
}

interface ProgressImageOptions {
  width?: number
  height?: number
  status: LogisticsStatus | HealthcareStatus
  steps: string[]
  title?: string
}

/**
 * Generates a progress bar image for Google Wallet hero image
 * Dimensions: 1032×336 px (3:1 ratio) as recommended by Google
 */
export async function generateProgressImage(options: ProgressImageOptions): Promise<Buffer> {
  const {
    width = 1032,
    height = 336,
    status,
    steps,
    title = 'Progress'
  } = options

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  const colors = STATUS_COLORS[status as keyof typeof STATUS_COLORS]
  const currentIndex = steps.indexOf(status)
  const progress = (currentIndex + 1) / steps.length

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, colors.bg)
  gradient.addColorStop(1, colors.bar)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Title
  ctx.fillStyle = colors.text
  ctx.font = 'bold 48px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(title, width / 2, 70)

  // Current status
  ctx.font = 'bold 64px Arial, sans-serif'
  ctx.fillText(status, width / 2, 150)

  // Progress bar background
  const barWidth = width * 0.8
  const barHeight = 40
  const barX = (width - barWidth) / 2
  const barY = height - 120

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.roundRect(barX, barY, barWidth, barHeight, 20)
  ctx.fill()

  // Progress bar fill
  ctx.fillStyle = colors.text
  ctx.roundRect(barX, barY, barWidth * progress, barHeight, 20)
  ctx.fill()

  // Step indicators
  const stepWidth = barWidth / steps.length
  ctx.font = 'bold 20px Arial, sans-serif'
  ctx.textAlign = 'center'

  steps.forEach((step, index) => {
    const x = barX + stepWidth * index + stepWidth / 2
    const y = barY - 20

    // Step dot
    ctx.beginPath()
    ctx.arc(x, barY + barHeight / 2, 12, 0, Math.PI * 2)
    ctx.fillStyle = index <= currentIndex ? colors.text : 'rgba(255, 255, 255, 0.5)'
    ctx.fill()

    // Step label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillText(step, x, y)
  })

  // Progress percentage
  ctx.font = 'bold 28px Arial, sans-serif'
  ctx.fillStyle = colors.text
  ctx.textAlign = 'center'
  ctx.fillText(`${Math.round(progress * 100)}% Complete`, width / 2, height - 40)

  return canvas.toBuffer('image/png')
}

/**
 * Generate hero image for logistics passes
 */
export async function generateLogisticsHeroImage(status: LogisticsStatus): Promise<Buffer> {
  return generateProgressImage({
    status,
    steps: LOGISTICS_STEPS,
    title: 'Transport Order Progress'
  })
}

/**
 * Generate hero image for healthcare passes
 */
export async function generateHealthcareHeroImage(status: HealthcareStatus): Promise<Buffer> {
  return generateProgressImage({
    status,
    steps: HEALTHCARE_STEPS,
    title: 'Patient Visit Progress'
  })
}
