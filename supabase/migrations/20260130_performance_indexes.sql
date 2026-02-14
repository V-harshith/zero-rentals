-- Performance Optimization Migration
-- Adds critical indexes to improve query performance

-- 1. Properties table indexes
CREATE INDEX IF NOT EXISTS idx_properties_owner_id 
  ON properties(owner_id);

CREATE INDEX IF NOT EXISTS idx_properties_status_availability 
  ON properties(status, availability);

CREATE INDEX IF NOT EXISTS idx_properties_location 
  ON properties(city, area);

CREATE INDEX IF NOT EXISTS idx_properties_created_at 
  ON properties(created_at DESC);

-- 2. Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_role 
  ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_email 
  ON users(email);

-- 3. Inquiries table indexes
CREATE INDEX IF NOT EXISTS idx_inquiries_owner_id 
  ON inquiries(owner_id);

CREATE INDEX IF NOT EXISTS idx_inquiries_tenant_id 
  ON inquiries(tenant_id);

CREATE INDEX IF NOT EXISTS idx_inquiries_status 
  ON inquiries(status);

-- 4. Favorites table indexes
CREATE INDEX IF NOT EXISTS idx_favorites_user_id 
  ON favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_property_id 
  ON favorites(property_id);

-- 5. Notifications table indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
  ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_read 
  ON notifications(read);
