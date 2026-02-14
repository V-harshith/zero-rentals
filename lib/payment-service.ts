import Razorpay from 'razorpay'
import crypto from 'crypto'

const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function createRazorpayOrder(
    amount: number,
    currency: string = 'INR',
    notes: Record<string, string> = {}
) {
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
    const text = `${orderId}|${paymentId}`
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
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
