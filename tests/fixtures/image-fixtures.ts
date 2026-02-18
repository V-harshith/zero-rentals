/**
 * Image generation utilities for bulk import testing
 */

import { createCanvas } from 'canvas'

/**
 * Generate a simple test image buffer
 */
export async function generateTestImage(
  width: number = 800,
  height: number = 600,
  color: string = '#4CAF50',
  text: string = 'Test Image'
): Promise<Buffer> {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Fill background
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)

  // Add text
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 48px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, height / 2)

  // Add border
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 10
  ctx.strokeRect(10, 10, width - 20, height - 20)

  return canvas.toBuffer('image/jpeg', { quality: 0.9 })
}

/**
 * Generate a set of test images for a PSN folder
 */
export async function generateImagesForPSN(
  psn: string,
  count: number = 3
): Promise<{ filename: string; buffer: Buffer }[]> {
  const images: { filename: string; buffer: Buffer }[] = []

  for (let i = 0; i < count; i++) {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336']
    const color = colors[i % colors.length]
    const buffer = await generateTestImage(
      800,
      600,
      color,
      `PSN ${psn} - Image ${i + 1}`
    )
    images.push({
      filename: `image${i + 1}.jpg`,
      buffer,
    })
  }

  return images
}

/**
 * Generate a large test image (>2MB to test compression)
 */
export async function generateLargeImage(): Promise<Buffer> {
  // Create a 3000x3000 image which should be >2MB
  const canvas = createCanvas(3000, 3000)
  const ctx = canvas.getContext('2d')

  // Create a pattern
  for (let x = 0; x < 3000; x += 100) {
    for (let y = 0; y < 3000; y += 100) {
      ctx.fillStyle = `hsl(${(x + y) % 360}, 70%, 50%)`
      ctx.fillRect(x, y, 100, 100)
    }
  }

  // Add text
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 200px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('LARGE TEST IMAGE', 1500, 1500)

  return canvas.toBuffer('image/jpeg', { quality: 0.95 })
}

/**
 * Generate an invalid image file (not actually an image)
 */
export function generateInvalidImageFile(): Buffer {
  return Buffer.from('This is not an image file, just text content')
}

/**
 * Generate images with various formats
 */
export async function generateMultiFormatImages(): Promise<{ filename: string; buffer: Buffer; type: string }[]> {
  const images: { filename: string; buffer: Buffer; type: string }[] = []
  const canvas = createCanvas(400, 300)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#4CAF50'
  ctx.fillRect(0, 0, 400, 300)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 24px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('Format Test', 200, 150)

  // JPEG
  images.push({
    filename: 'test.jpg',
    buffer: canvas.toBuffer('image/jpeg'),
    type: 'image/jpeg',
  })

  // PNG
  images.push({
    filename: 'test.png',
    buffer: canvas.toBuffer('image/png'),
    type: 'image/png',
  })

  return images
}

/**
 * Generate many images for a single PSN (to test >10 image warning)
 */
export async function generateManyImagesForPSN(
  psn: string,
  count: number = 12
): Promise<{ filename: string; buffer: Buffer }[]> {
  return generateImagesForPSN(psn, count)
}

/**
 * Create a mock File object from buffer for testing
 */
export function createMockFile(
  buffer: Buffer,
  filename: string,
  type: string = 'image/jpeg'
): File {
  return new File([buffer], filename, { type })
}
