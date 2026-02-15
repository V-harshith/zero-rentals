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

  const baseUrl = getBaseUrl()

  // SECURITY: Sanitize user input before inserting into HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; background: white; }
    .content h2 { color: #1f2937; font-size: 24px; margin: 0 0 20px 0; }
    .content p { color: #4b5563; margin: 0 0 15px 0; font-size: 16px; }
    .success-box { background: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .success-box h3 { color: #15803d; margin: 0 0 10px 0; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 5px 0; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${baseUrl}/zerorentals-logo.png" alt="ZeroRentals" style="width: 48px; height: 48px; margin-bottom: 10px;">
      <h1>ZeroRentals</h1>
    </div>
    <div class="content">
      <h2>Hi ${sanitizeHtml(property.ownerName)},</h2>
      <div class="success-box">
        <h3>🎉 Property Approved!</h3>
        <p>Your property <strong>${sanitizeHtml(property.propertyTitle)}</strong> has been approved and is now live on ZeroRentals.</p>
      </div>
      <p>Your property is now visible to thousands of potential tenants. You can manage your property from your owner dashboard.</p>
      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">Thank you for choosing ZeroRentals!</p>
    </div>
    <div class="footer">
      <p><strong>© 2026 ZeroRentals</strong></p>
      <p>Find your perfect home with zero hassle</p>
      <p style="margin-top: 15px;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: property.ownerEmail,
    subject: `✅ Property Approved: ${property.propertyTitle}`,
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

  const baseUrl = getBaseUrl()

  // SECURITY: Sanitize user input before inserting into HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; background: white; }
    .content h2 { color: #1f2937; font-size: 24px; margin: 0 0 20px 0; }
    .content p { color: #4b5563; margin: 0 0 15px 0; font-size: 16px; }
    .warning-box { background: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .warning-box h3 { color: #dc2626; margin: 0 0 10px 0; }
    .reason-box { background: #f9fafb; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 5px 0; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${baseUrl}/zerorentals-logo.png" alt="ZeroRentals" style="width: 48px; height: 48px; margin-bottom: 10px;">
      <h1>ZeroRentals</h1>
    </div>
    <div class="content">
      <h2>Hi ${sanitizeHtml(property.ownerName)},</h2>
      <div class="warning-box">
        <h3>❌ Property Not Approved</h3>
        <p>Unfortunately, your property <strong>${sanitizeHtml(property.propertyTitle)}</strong> could not be approved at this time.</p>
      </div>
      ${property.reason ? `
      <div class="reason-box">
        <p><strong>Reason:</strong> ${sanitizeHtml(property.reason)}</p>
      </div>
      ` : ''}
      <p>Please review your listing and make necessary changes before resubmitting. If you have any questions, please contact our support team.</p>
      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">We're here to help you succeed!</p>
    </div>
    <div class="footer">
      <p><strong>© 2026 ZeroRentals</strong></p>
      <p>Find your perfect home with zero hassle</p>
      <p style="margin-top: 15px;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: property.ownerEmail,
    subject: `❌ Property Not Approved: ${property.propertyTitle}`,
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

  const baseUrl = getBaseUrl()

  // SECURITY: Sanitize user input before inserting into HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; background: white; }
    .content h2 { color: #1f2937; font-size: 24px; margin: 0 0 20px 0; }
    .content p { color: #4b5563; margin: 0 0 15px 0; font-size: 16px; }
    .success-box { background: #f0fdfa; border: 1px solid #0d9488; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .success-box h3 { color: #0f766e; margin: 0 0 10px 0; }
    .details-box { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .details-box h3 { margin: 0 0 15px 0; color: #1f2937; }
    .details-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .details-row:last-child { border-bottom: none; }
    .button-container { text-align: center; margin: 30px 0; }
    .button { background: #0d9488; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 5px 0; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${baseUrl}/zerorentals-logo.png" alt="ZeroRentals" style="width: 48px; height: 48px; margin-bottom: 10px;">
      <h1>ZeroRentals</h1>
    </div>
    <div class="content">
      <h2>Hi ${sanitizeHtml(data.name)},</h2>
      <div class="success-box">
        <h3>✅ Payment Successful!</h3>
        <p>Thank you for subscribing to the <strong>${sanitizeHtml(data.planName)}</strong> plan.</p>
      </div>
      <div class="details-box">
        <h3>Transaction Details</h3>
        <div class="details-row"><span>Amount:</span><strong>₹${data.amount}</strong></div>
        <div class="details-row"><span>Plan:</span><strong>${sanitizeHtml(data.planName)}</strong></div>
        <div class="details-row"><span>Valid Until:</span><strong>${sanitizeHtml(data.endDate)}</strong></div>
        <div class="details-row"><span>Transaction ID:</span><strong>${sanitizeHtml(data.transactionId)}</strong></div>
      </div>
      <p style="text-align: center;">You can now list more properties and enjoy premium features!</p>
      <div class="button-container">
        <a href="${baseUrl}/dashboard/owner" class="button">Go to Dashboard</a>
      </div>
    </div>
    <div class="footer">
      <p><strong>© 2026 ZeroRentals</strong></p>
      <p>Find your perfect home with zero hassle</p>
      <p style="margin-top: 15px;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: data.email,
    subject: `✅ Payment Successful: ${data.planName} Plan`,
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

  const baseUrl = getBaseUrl()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; background: white; }
    .content h2 { color: #1f2937; font-size: 24px; margin: 0 0 20px 0; }
    .content p { color: #4b5563; margin: 0 0 15px 0; font-size: 16px; }
    .info-box { background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .info-box h3 { color: #0369a1; margin: 0 0 10px 0; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 5px 0; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${baseUrl}/zerorentals-logo.png" alt="ZeroRentals" style="width: 48px; height: 48px; margin-bottom: 10px;">
      <h1>ZeroRentals</h1>
    </div>
    <div class="content">
      <h2>Hi ${property.ownerName},</h2>
      <div class="info-box">
        <h3>📤 Property Submitted!</h3>
        <p>Your property <strong>${property.propertyTitle}</strong> has been successfully submitted for review.</p>
      </div>
      <p>Our team will verify the details and approve it shortly. You will receive another email once it's live on the platform.</p>
      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">Thank you for choosing ZeroRentals!</p>
    </div>
    <div class="footer">
      <p><strong>© 2026 ZeroRentals</strong></p>
      <p>Find your perfect home with zero hassle</p>
      <p style="margin-top: 15px;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: property.ownerEmail,
    subject: `📤 Property Submitted: ${property.propertyTitle}`,
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
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; background: white; }
    .content h2 { color: #1f2937; font-size: 24px; margin: 0 0 20px 0; }
    .content p { color: #4b5563; margin: 0 0 15px 0; font-size: 16px; }
    .warning-box { background: #fffbeb; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .warning-box h3 { color: #b45309; margin: 0 0 10px 0; }
    .button-container { text-align: center; margin: 30px 0; }
    .button { background: #4f46e5; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 5px 0; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${baseUrl}/zerorentals-logo.png" alt="ZeroRentals" style="width: 48px; height: 48px; margin-bottom: 10px;">
      <h1>ZeroRentals</h1>
    </div>
    <div class="content">
      <h2>Hi ${property.ownerName},</h2>
      <div class="warning-box">
        <h3>⚠️ Property Listing Expired</h3>
        <p>Your additional property listing <strong>${property.propertyTitle}</strong> has expired.</p>
      </div>
      <p>Your property is no longer visible to tenants. Renew your listing to keep it active and reach more potential tenants.</p>
      <div class="button-container">
        <a href="${renewUrl}" class="button">Renew Listing</a>
      </div>
      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">Keep your properties visible to maximize your reach!</p>
    </div>
    <div class="footer">
      <p><strong>© 2026 ZeroRentals</strong></p>
      <p>Find your perfect home with zero hassle</p>
      <p style="margin-top: 15px;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: property.to,
    subject: `⚠️ Listing Expired: ${property.propertyTitle}`,
    html,
  })

  if (error) console.error('Failed to send property expiry email:', error)
}

/**
 * Send subscription expiry notification to owner
 */
export async function sendSubscriptionExpiryEmail(data: {
  to: string
  ownerName: string
}) {
  const resend = getResend()

  if (!resend) {
    console.warn(`⚠️ Email service not configured - Subscription expiry email not sent`)
    return
  }

  const baseUrl = getBaseUrl()
  const pricingUrl = `${baseUrl}/pricing`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; background: white; }
    .content h2 { color: #1f2937; font-size: 24px; margin: 0 0 20px 0; }
    .content p { color: #4b5563; margin: 0 0 15px 0; font-size: 16px; }
    .warning-box { background: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .warning-box h3 { color: #dc2626; margin: 0 0 10px 0; }
    .button-container { text-align: center; margin: 30px 0; }
    .button { background: #4f46e5; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 5px 0; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${baseUrl}/zerorentals-logo.png" alt="ZeroRentals" style="width: 48px; height: 48px; margin-bottom: 10px;">
      <h1>ZeroRentals</h1>
    </div>
    <div class="content">
      <h2>Hi ${sanitizeHtml(data.ownerName)},</h2>
      <div class="warning-box">
        <h3>⚠️ Subscription Expired</h3>
        <p>Your subscription has expired and your properties are no longer visible to tenants.</p>
      </div>
      <p>Renew your subscription to:</p>
      <ul style="color: #4b5563; margin: 15px 0;">
        <li>Keep your properties visible to potential tenants</li>
        <li>Access premium features and analytics</li>
        <li>Get priority support</li>
      </ul>
      <div class="button-container">
        <a href="${pricingUrl}" class="button">Renew Subscription</a>
      </div>
      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">Don't miss out on potential tenants - renew today!</p>
    </div>
    <div class="footer">
      <p><strong>© 2026 ZeroRentals</strong></p>
      <p>Find your perfect home with zero hassle</p>
      <p style="margin-top: 15px;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `

  const { error } = await resend.emails.send({
    from: 'ZeroRentals <noreply@zerorentals.com>',
    to: data.to,
    subject: `⚠️ Subscription Expired - Renew to Keep Your Properties Visible`,
    html,
  })

  if (error) console.error('Failed to send subscription expiry email:', error)
}
