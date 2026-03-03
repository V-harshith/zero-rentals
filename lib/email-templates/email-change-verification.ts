/**
 * Email template for email change verification
 */

import { sanitizeHtml } from '@/lib/security-utils'

export interface EmailChangeVerificationData {
  name: string;
  newEmail: string;
  verificationUrl: string;
  expiresIn: string;
}

export function getEmailChangeVerificationHtml(data: EmailChangeVerificationData): string {
  const { name, newEmail, verificationUrl, expiresIn } = data;

  const safeName = sanitizeHtml(name);
  const safeNewEmail = sanitizeHtml(newEmail);
  const safeVerificationUrl = sanitizeHtml(verificationUrl);
  const safeExpiresIn = sanitizeHtml(expiresIn);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email Change</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .logo {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo h1 {
      color: #2563eb;
      margin: 0;
      font-size: 28px;
    }
    .heading {
      color: #1f2937;
      font-size: 24px;
      margin-bottom: 20px;
      text-align: center;
    }
    .message {
      color: #4b5563;
      font-size: 16px;
      margin-bottom: 25px;
      text-align: center;
    }
    .email-highlight {
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 12px;
      margin: 20px 0;
      text-align: center;
      font-weight: 600;
      color: #1e40af;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .button {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
    }
    .button:hover {
      background-color: #1d4ed8;
    }
    .link-fallback {
      margin-top: 20px;
      padding: 15px;
      background-color: #f9fafb;
      border-radius: 6px;
      word-break: break-all;
      font-size: 14px;
      color: #6b7280;
    }
    .expiry {
      text-align: center;
      color: #dc2626;
      font-size: 14px;
      margin-top: 25px;
      font-weight: 500;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: 14px;
    }
    .security-notice {
      background-color: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      padding: 15px;
      margin-top: 25px;
      font-size: 14px;
      color: #92400e;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>Zero Rentals</h1>
    </div>

    <h2 class="heading">Verify Your Email Change</h2>

    <p class="message">
      Hi ${safeName},
    </p>

    <p class="message">
      You recently requested to change your admin email address. To complete this change, please verify your new email address by clicking the button below.
    </p>

    <div class="email-highlight">
      New Email: ${safeNewEmail}
    </div>

    <div class="button-container">
      <a href="${safeVerificationUrl}" class="button">Verify Email Change</a>
    </div>

    <p class="link-fallback">
      If the button doesn't work, copy and paste this link into your browser:<br>
      ${safeVerificationUrl}
    </p>

    <p class="expiry">
      This link expires in ${safeExpiresIn}
    </p>

    <div class="security-notice">
      <strong>Security Notice:</strong> If you didn't request this email change, please ignore this email or contact support immediately. Your account security is important to us.
    </div>

    <div class="footer">
      <p>This is an automated email from Zero Rentals. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `;
}

export function getEmailChangeVerificationText(data: EmailChangeVerificationData): string {
  const safeName = sanitizeHtml(data.name);
  const safeNewEmail = sanitizeHtml(data.newEmail);
  const safeVerificationUrl = sanitizeHtml(data.verificationUrl);
  const safeExpiresIn = sanitizeHtml(data.expiresIn);

  return `
Hi ${safeName},

You recently requested to change your admin email address to: ${safeNewEmail}

To complete this change, please verify your new email address by clicking the link below:

${safeVerificationUrl}

This link expires in ${safeExpiresIn}.

SECURITY NOTICE: If you didn't request this email change, please ignore this email or contact support immediately.

---
This is an automated email from Zero Rentals. Please do not reply to this email.
  `.trim();
}
