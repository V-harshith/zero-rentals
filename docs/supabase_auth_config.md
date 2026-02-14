# Supabase Authentication Configuration Guide

## Required Settings for Email Verification

### 1. Enable Email Confirmations

Navigate to your Supabase Dashboard and configure the following:

**Path**: `Authentication` → `Settings` → `Email Auth`

#### Required Settings:

1. **Enable email confirmations**: ✅ **MUST BE ENABLED**
   - This ensures users must verify their email before they can log in
   - Without this, accounts are auto-confirmed (security risk)

2. **Secure email change**: ✅ Recommended
   - Requires verification when users change their email address

3. **Double confirm email changes**: ✅ Recommended
   - Requires confirmation from both old and new email addresses

### 2. Email Templates

**Path**: `Authentication` → `Email Templates`

#### Confirm Signup Template

Ensure the "Confirm signup" template is configured:

```html
<h2>Confirm your signup</h2>

<p>Follow this link to confirm your account:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>

<p>If you didn't request this, you can safely ignore this email.</p>
```

**Important**: The `{{ .ConfirmationURL }}` variable must be present.

### 3. Redirect URLs

**Path**: `Authentication` → `URL Configuration`

Add the following redirect URLs to the allowlist:

#### Development:
- `http://localhost:3000/auth/confirmed`
- `http://localhost:3000/auth/verified`
- `http://localhost:3000/auth/verification-failed`

#### Production:
- `https://yourdomain.com/auth/confirmed`
- `https://yourdomain.com/auth/verified`
- `https://yourdomain.com/auth/verification-failed`

### 4. Email Rate Limiting

**Path**: `Authentication` → `Rate Limits`

Recommended settings:
- **Email sends per hour**: 4 (prevents abuse)
- **SMS sends per hour**: 4 (if using phone auth)

## Verification Flow

### 1. User Registration
```
User fills form → signUp() called → Supabase creates user (unconfirmed)
→ Verification email sent → User redirected to /auth/verify-email
```

### 2. Email Verification
```
User clicks link in email → Supabase confirms email → Redirect to /auth/confirmed
→ User can now log in
```

### 3. Login Attempt (Unverified)
```
User tries to log in → signIn() checks email_confirmed_at
→ If NULL: Sign out user + Show error → Redirect to resend verification
```

## Security Best Practices

### ✅ DO:
- Always check `email_confirmed_at` on login
- Block unverified users at both app and database level
- Use RLS policies to prevent data access by unverified users
- Set reasonable rate limits on verification emails
- Log verification attempts for security monitoring

### ❌ DON'T:
- Never trust client-side verification status
- Don't allow unverified users to access protected resources
- Don't expose sensitive data to unverified accounts
- Don't allow unlimited verification email resends

## Troubleshooting

### Users Not Receiving Verification Emails

1. **Check Supabase Email Settings**:
   - Go to `Project Settings` → `Auth` → `SMTP Settings`
   - Verify SMTP is configured (or using Supabase's default)

2. **Check Spam Folder**:
   - Verification emails may be flagged as spam
   - Consider setting up custom SMTP with proper SPF/DKIM

3. **Check Rate Limits**:
   - User may have exceeded email rate limit
   - Check `Authentication` → `Rate Limits`

### Verification Link Not Working

1. **Check Redirect URLs**:
   - Ensure the redirect URL is in the allowlist
   - Verify the URL matches exactly (including protocol)

2. **Check Token Expiry**:
   - Default token expiry is 24 hours
   - After expiry, user must request a new verification email

3. **Check Email Template**:
   - Ensure `{{ .ConfirmationURL }}` is present in the template
   - Verify no HTML encoding issues

### Users Already Logged In But Unverified

This indicates a configuration issue. To fix:

1. **Sign out all users**:
   ```typescript
   await supabase.auth.signOut()
   ```

2. **Update Supabase settings** to enable email confirmations

3. **Force re-verification**:
   - Users must verify their email on next login
   - Application code will block access until verified

## Database Schema

The `users` table should have these verification-related columns:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  verification_token TEXT,
  token_expires_at TIMESTAMPTZ,
  -- other columns...
);
```

## Monitoring

### Check Verification Status

```sql
-- Count unverified users
SELECT COUNT(*) 
FROM users 
WHERE email_verified_at IS NULL;

-- Recent signups without verification
SELECT email, created_at 
FROM users 
WHERE email_verified_at IS NULL 
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Verification rate
SELECT 
  COUNT(*) FILTER (WHERE email_verified_at IS NOT NULL) * 100.0 / COUNT(*) as verification_rate
FROM users;
```

## Next Steps

After configuring Supabase:

1. ✅ Verify "Enable email confirmations" is ON
2. ✅ Test signup flow with a new account
3. ✅ Confirm verification email is received
4. ✅ Test that unverified users cannot log in
5. ✅ Test verification link works correctly
6. ✅ Monitor verification rates and email delivery
