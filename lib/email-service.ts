import { Resend } from 'resend'
import { VerificationEmailTemplate } from './email-templates/verification-email'
import { PasswordResetEmailTemplate } from './email-templates/password-reset-email'
import { sanitizeHtml } from './security-utils'

// Lazy initialization to avoid client-side errors
let resendInstance: Resend | null = null

function getResend() {
  // Check if we're on the server side
  if (typeof window !== 'undefined') {
    throw new Error('Email service can only be used on the server side')
  }

  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn('RESEND_API_KEY is not configured - email sending will be skipped')
      return null
    }
    resendInstance = new Resend(apiKey)
  }
  return resendInstance
}

/**
 * Get base URL with proper priority for email links
 * Priority: NEXT_PUBLIC_APP_URL > Vercel Production > Localhost
 */
function getBaseUrl(): string {
  // 1. Explicit production URL (highest priority - set in Vercel env vars)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  
  // 2. Vercel production deployment only (not preview)
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  
  // 3. Fallback for preview/development (with warning)
  if (process.env.VERCEL_URL) {
    console.warn('⚠️ Using Vercel preview URL for emails - set NEXT_PUBLIC_APP_URL in production!')
    return `https://${process.env.VERCEL_URL}`
  }
  
  // 4. Local development
  return 'http://localhost:3000'
}

/**
 * Send verification email to user
 */
export async function sendVerificationEmail(
  email: string,
  name: string,
  token: string,
  role: 'owner' | 'tenant' | 'admin' = 'tenant'
): Promise<void> {
  const baseUrl = getBaseUrl()
  const verificationUrl = `${baseUrl}/api/verify-email?token=${token}`

  try {
    const resend = getResend()

    // If Resend is not configured, throw error
    if (!resend) {
      throw new Error('Email service not configured - RESEND_API_KEY missing')
    }

    const { data, error } = await resend.emails.send({
      from: 'ZeroRentals <noreply@zerorentals.com>',
      to: email,
      subject: '✉️ Verify your ZeroRentals account',
      html: VerificationEmailTemplate({
        name,
        verificationUrl,
        role,
        logoUrl: `${baseUrl}/zerorentals-logo.png`
      }),
    })

    if (error) {
      throw new Error(`Resend API error: ${error.message || 'Unknown error'}`)
    }
  } catch (error: any) {
    console.error('[EMAIL] Verification email failed:', error.message || error)
    // For signup, we allow continuation even if email fails - user can resend
    // But we still throw so caller knows it failed
    throw error
  }
}

/**
 * Send password reset email
 */
/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
): Promise<void> {
  try {
    const resend = getResend()

    if (!resend) {
      throw new Error('Email service not configured - RESEND_API_KEY missing')
    }

    const baseUrl = getBaseUrl()

    const { data, error } = await resend.emails.send({
      from: 'ZeroRentals <noreply@zerorentals.com>',
      to: email,
      subject: '🔒 Reset your ZeroRentals password',
      html: PasswordResetEmailTemplate({
        name,
        resetUrl,
        logoUrl: `${baseUrl}/zerorentals-logo.png`
      }),
    })

    if (error) {
      console.error('Resend API error:', error)
      throw new Error(`Failed to send password reset email: ${error.message}`)
    }

    console.log('✅ Password reset email sent successfully:', data?.id)
  } catch (error: any) {
    console.error('[EMAIL] Password reset email failed:', error.message || error)
    throw new Error(`Failed to send password reset email: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Send property approval notification to owner
 */
export async function sendPropertyApprovalNotification(property: {
  ownerEmail: string
  ownerName: string
  propertyTitle: string
}) {
  const resend = getResend()

  if (!resend) {
    console.warn(`⚠️ Email service not configured - Property approval email not sent`)
    return
  }

  // SECURITY: Sanitize user input before inserting into HTML
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #22c55e;">Property Approved!</h2>
      <p>Hi ${sanitizeHtml(property.ownerName)},</p>
      <p>Great news! Your property <strong>${sanitizeHtml(property.propertyTitle)}</strong> has been approved and is now live on ZeroRentals.</p>
      <p>Your property is now visible to thousands of potential tenants.</p>
      <p>Best regards,<br>ZeroRentals Team</p>
    </div>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: property.ownerEmail,
    subject: `Property Approved: ${property.propertyTitle}`,
    html,
  })

  if (error) console.error('Failed to send property approval email:', error)
}

/**
 * Send property rejection notification to owner
 */
export async function sendPropertyRejectionNotification(property: {
  ownerEmail: string
  ownerName: string
  propertyTitle: string
  reason?: string
}) {
  const resend = getResend()

  if (!resend) {
    console.warn(`⚠️ Email service not configured - Property rejection email not sent`)
    return
  }

  // SECURITY: Sanitize user input before inserting into HTML
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">Property Not Approved</h2>
      <p>Hi ${sanitizeHtml(property.ownerName)},</p>
      <p>Unfortunately, your property <strong>${sanitizeHtml(property.propertyTitle)}</strong> could not be approved at this time.</p>
      ${property.reason ? `<p><strong>Reason:</strong> ${sanitizeHtml(property.reason)}</p>` : ''}
      <p>Please review your listing and make necessary changes before resubmitting.</p>
      <p>Best regards,<br>ZeroRentals Team</p>
    </div>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: property.ownerEmail,
    subject: `Property Not Approved: ${property.propertyTitle}`,
    html,
  })

  if (error) console.error('Failed to send property rejection email:', error)
}

/**
 * Send payment success email
 */
export async function sendPaymentSuccessEmail(data: {
  email: string
  name: string
  planName: string
  amount: number
  transactionId: string
  endDate: string
}) {
  const resend = getResend()

  if (!resend) {
    console.warn(`⚠️ Email service not configured - Payment success email not sent`)
    return
  }

  // SECURITY: Sanitize user input before inserting into HTML
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0d9488;">Payment Successful!</h2>
      <p>Hi ${sanitizeHtml(data.name)},</p>
      <p>Thank you for subscribing to the <strong>${sanitizeHtml(data.planName)}</strong> plan.</p>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Transaction Details</h3>
        <p><strong>Amount:</strong> ₹${data.amount}</p>
        <p><strong>Plan Duration:</strong> ${sanitizeHtml(data.planName)}</p>
        <p><strong>Valid Until:</strong> ${sanitizeHtml(data.endDate)}</p>
        <p><strong>Transaction ID:</strong> ${sanitizeHtml(data.transactionId)}</p>
      </div>

      <p>You can now list more properties and enjoy premium features.</p>
      <p>Best regards,<br>ZeroRentals Team</p>
    </div>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: data.email,
    subject: `Payment Successful: ${data.planName} Plan`,
    html,
  })

  if (error) console.error('Failed to send payment success email:', error)
}

/**
 * Send notification to owner when they post a property
 */
export async function sendPropertyPostedEmail(property: {
  ownerEmail: string
  ownerName: string
  propertyTitle: string
}) {
  const resend = getResend()

  if (!resend) {
    console.warn(`⚠️ Email service not configured - Property posted email not sent`)
    return
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0d9488;">Property Posted Successfully!</h2>
      <p>Hi ${property.ownerName},</p>
      <p>Your property <strong>${property.propertyTitle}</strong> has been successfully submitted for review.</p>
      <p>Our team will verify the details and approve it shortly. You will receive another email once it's live.</p>
      <p>Best regards,<br>ZeroRentals Team</p>
    </div>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: property.ownerEmail,
    subject: `Property Submitted: ${property.propertyTitle}`,
    html,
  })

  if (error) console.error('Failed to send property posted email:', error)
}

/**
 * Send property expiry notification to owner
 */
export async function sendPropertyExpiryEmail(property: {
  to: string
  ownerName: string
  propertyTitle: string
  propertyId: string
}) {
  const resend = getResend()

  if (!resend) {
    console.warn(`⚠️ Email service not configured - Property expiry email not sent`)
    return
  }

  const baseUrl = getBaseUrl()
  const renewUrl = `${baseUrl}/post-property?renew=${property.propertyId}`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f59e0b;">⚠️ Property Listing Expired</h2>
      <p>Hi ${property.ownerName},</p>
      <p>Your additional property listing <strong>${property.propertyTitle}</strong> has expired.</p>
      
      <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 0;"><strong>What happens now?</strong></p>
        <p style="margin: 8px 0 0 0;">Your property is no longer visible to tenants. Renew your listing to keep it active and reach more potential tenants.</p>
      </div>
      
      <a href="${renewUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
        Renew Listing
      </a>
      
      <p style="margin-top: 20px;">Best regards,<br>ZeroRentals Team</p>
    </div>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: property.to,
    subject: `⚠️ Listing Expired: ${property.propertyTitle}`,
    html,
  })

  if (error) console.error('Failed to send property expiry email:', error)
}
