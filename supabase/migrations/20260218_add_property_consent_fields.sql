-- ============================================================================
-- Migration: Add property consent fields for legal compliance
-- ============================================================================
-- These fields track owner consent for:
-- 1. Publishing/displaying the property on the platform
-- 2. Image ownership and usage rights
-- 3. Contact permission via phone/SMS/WhatsApp/email
--
-- All three are REQUIRED for new property postings by owners
-- ============================================================================

-- Add consent columns to properties table
ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS consent_published BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS consent_images BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS consent_contact BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;

-- Add comment explaining the columns
COMMENT ON COLUMN properties.consent_published IS 'Owner consents to publish, display, and promote property on platform';
COMMENT ON COLUMN properties.consent_images IS 'Owner confirms image ownership/rights and authorizes display';
COMMENT ON COLUMN properties.consent_contact IS 'Owner agrees to be contacted via phone, SMS, WhatsApp, or email';
COMMENT ON COLUMN properties.consented_at IS 'Timestamp when consents were recorded';

-- Add index for compliance queries
CREATE INDEX IF NOT EXISTS idx_properties_consents
    ON properties(consent_published, consent_images, consent_contact)
    WHERE consent_published = TRUE OR consent_images = TRUE OR consent_contact = TRUE;

-- ============================================================================
-- Verification query (run manually to check):
--
-- SELECT
--     id,
--     title,
--     owner_id,
--     consent_published,
--     consent_images,
--     consent_contact,
--     consented_at
-- FROM properties
-- WHERE consent_published IS NOT NULL
-- LIMIT 10;
-- ============================================================================
