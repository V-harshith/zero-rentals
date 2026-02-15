import Razorpay from 'razorpay'

// Define types locally or import from types file if available
export interface CreateOrderParams {
    amount: number // Amount in smallest currency unit (paise)
    currency?: string
    receipt?: string
    notes?: Record<string, string>
}

// Lazy initialization to prevent build-time errors
let razorpayInstance: any = null

const getRazorpay = () => {
    if (razorpayInstance) return razorpayInstance

    const key_id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const key_secret = process.env.RAZORPAY_KEY_SECRET

    if (!key_id || !key_secret) {
        console.warn('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set in environment variables')
        return null
    }

    try {
        razorpayInstance = new Razorpay({
            key_id: key_id,
            key_secret: key_secret,
        })
        return razorpayInstance
    } catch (error) {
        console.error('Failed to initialize Razorpay:', error)
        return null
    }
}

export const createRazorpayOrder = async (params: CreateOrderParams) => {
    try {
        const instance = getRazorpay()

        if (!instance) {
            throw new Error('Payment gateway not configured correctly')
        }

        const order = await instance.orders.create({
            amount: params.amount,
            currency: params.currency || 'INR',
            receipt: params.receipt,
            notes: params.notes,
        })
        return order
    } catch (error) {
        console.error('Error creating Razorpay order:', error)
        throw error
    }
}
