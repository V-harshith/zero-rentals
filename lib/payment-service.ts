import Razorpay from 'razorpay'
import crypto from 'crypto'

// Lazy initialization to prevent build-time errors and handle missing config
let razorpayInstance: Razorpay | null = null

const getRazorpayInstance = (): Razorpay | null => {
    if (razorpayInstance) return razorpayInstance

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET

    if (!keyId || !keySecret) {
        console.error('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not configured')
        return null
    }

    try {
        razorpayInstance = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        })
        return razorpayInstance
    } catch (error) {
        console.error('Failed to initialize Razorpay:', error)
        return null
    }
}

export async function createRazorpayOrder(
    amount: number,
    currency: string = 'INR',
    notes: Record<string, string> = {}
) {
    const razorpay = getRazorpayInstance()

    if (!razorpay) {
        return {
            order: null,
            error: new Error('Payment gateway not configured correctly. Please contact support.')
        }
    }

    const options = {
        amount: amount * 100, // Amount in paise
        currency,
        receipt: `receipt_${Date.now()}`,
        notes
    }

    try {
        const order = await razorpay.orders.create(options)
        return { order, error: null }
    } catch (error) {
        console.error('Razorpay Order Creation Error:', error)
        return { order: null, error }
    }
}

export function verifyRazorpaySignature(
    orderId: string,
    paymentId: string,
    signature: string
) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET

    if (!keySecret) {
        console.error('RAZORPAY_KEY_SECRET not configured')
        return false
    }

    const text = `${orderId}|${paymentId}`
    const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(text)
        .digest('hex')

    return expectedSignature === signature
}

export function validateWebhookSignature(
    payload: string,
    signature: string,
    secret: string
) {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')

    return expectedSignature === signature
}
