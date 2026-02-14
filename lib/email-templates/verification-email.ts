interface VerificationEmailProps {
  name: string
  verificationUrl: string
  role: 'owner' | 'tenant' | 'admin'
  logoUrl: string
}

export const VerificationEmailTemplate = ({
  name,
  verificationUrl,
  role,
  logoUrl,
}: VerificationEmailProps) => {
  // Role-specific messaging
  const roleMessages = {
    owner: {
      title: 'Welcome to ZeroRentals - Property Owner',
      description: 'Start listing your properties and reach thousands of potential tenants.',
      action: 'list properties and manage your rental business'
    },
    tenant: {
      title: 'Welcome to ZeroRentals - Find Your Home',
      description: 'Start exploring amazing properties and find your perfect home.',
      action: 'browse properties and save your favorites'
    },
    admin: {
      title: 'Welcome to ZeroRentals - Admin Access',
      description: 'Access your admin dashboard and manage the platform.',
      action: 'manage properties, users, and platform settings'
    }
  }

  const message = roleMessages[role] || roleMessages.tenant

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6; 
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container { 
      max-width: 600px; 
      margin: 40px auto; 
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header { 
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
      color: white; 
      padding: 40px 30px; 
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content { 
      padding: 40px 30px;
      background: white;
    }
    .content h2 {
      color: #1f2937;
      font-size: 24px;
      margin: 0 0 20px 0;
    }
    .content p {
      color: #4b5563;
      margin: 0 0 15px 0;
      font-size: 16px;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .button { 
      background: #0ea5e9;
      color: white !important;
      padding: 16px 40px;
      text-decoration: none;
      border-radius: 6px;
      display: inline-block;
      font-weight: 600;
      font-size: 16px;
      transition: background 0.3s;
    }
    .button:hover {
      background: #0284c7;
    }
    .link-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 15px;
      margin: 20px 0;
      word-break: break-all;
    }
    .link-box p {
      margin: 0;
      font-size: 14px;
      color: #6b7280;
    }
    .link-box a {
      color: #0ea5e9;
      text-decoration: none;
    }
    .warning {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .warning p {
      margin: 0;
      color: #92400e;
      font-size: 14px;
    }
    .footer { 
      text-align: center; 
      padding: 30px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 5px 0;
      color: #6b7280;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="ZeroRentals" style="width: 48px; height: 48px; margin-bottom: 10px;">
      <h1>ZeroRentals</h1>
    </div>
    <div class="content">
      <h2>Hi ${name}!</h2>
      <p><strong>${message.title}</strong></p>
      <p>${message.description}</p>
      <p>Please verify your email address to activate your account and ${message.action}.</p>
      
      <div class="button-container">
        <a href="${verificationUrl}" class="button">Verify Email Address</a>
      </div>
      
      <p style="text-align: center; color: #6b7280; font-size: 14px;">
        Or copy and paste this link into your browser:
      </p>
      
      <div class="link-box">
        <a href="${verificationUrl}">${verificationUrl}</a>
      </div>
      
      <div class="warning">
        <p><strong>⏰ This link expires in 24 hours.</strong></p>
      </div>
      
      <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
        If you didn't create this account, please ignore this email. Your email address will not be used without verification.
      </p>
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
}
