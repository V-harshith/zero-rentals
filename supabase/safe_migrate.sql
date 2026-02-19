-- =============================================
-- ZeroRentals - SAFE Migration / Fix Script
-- Run this if you get "already exists" errors
-- =============================================

-- 1. DROP POLICY ERRORS
-- Policies must be dropped before recreation to avoid "already exists" errors
DROP POLICY IF EXISTS "Users can view their own data" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Users can create their profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update any user" ON users;

DROP POLICY IF EXISTS "Anyone can view active properties" ON properties;
DROP POLICY IF EXISTS "Owners can view their own properties" ON properties;
DROP POLICY IF EXISTS "Owners can insert properties" ON properties;
DROP POLICY IF EXISTS "Owners can update their own properties" ON properties;
DROP POLICY IF EXISTS "Owners can delete their own properties" ON properties;
DROP POLICY IF EXISTS "Admins can view all properties" ON properties;
DROP POLICY IF EXISTS "Admins can update any property" ON properties;

DROP POLICY IF EXISTS "Users can view their own favorites" ON favorites;
DROP POLICY IF EXISTS "Users can add favorites" ON favorites;
DROP POLICY IF EXISTS "Users can delete own favorites" ON favorites;

DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;
DROP POLICY IF EXISTS "Users can mark messages as read" ON messages;

DROP POLICY IF EXISTS "Users can view related inquiries" ON inquiries;
DROP POLICY IF EXISTS "Tenants can create inquiries" ON inquiries;
DROP POLICY IF EXISTS "Owners can update inquiry status" ON inquiries;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can mark notifications as read" ON notifications;

-- 2. ENSURE TABLES EXIST (Safe Create)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'tenant')),
  avatar_url TEXT,
  verified BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  verification_token TEXT,
  token_expires_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL,
  room_type TEXT NOT NULL,
  country TEXT DEFAULT 'India',
  city TEXT NOT NULL,
  area TEXT NOT NULL,
  locality TEXT,
  address TEXT,
  landmark TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  google_maps_url TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL,
  owner_contact TEXT NOT NULL,
  owner_verified BOOLEAN DEFAULT false,
  private_room_price INTEGER,
  double_sharing_price INTEGER,
  triple_sharing_price INTEGER,
  four_sharing_price INTEGER,
  deposit INTEGER,
  maintenance INTEGER,
  furnishing TEXT,
  floor_number INTEGER,
  total_floors INTEGER,
  room_size INTEGER,
  preferred_tenant TEXT,
  facilities TEXT[],
  amenities TEXT[],
  usp TEXT,
  rules TEXT[],
  nearby_places TEXT[],
  images TEXT[],
  videos TEXT[],
  availability TEXT DEFAULT 'Available',
  featured BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  views INTEGER DEFAULT 0,
  psn INTEGER,
  source TEXT DEFAULT 'manual',
  room_amenities JSONB DEFAULT '{}',
  laundry BOOLEAN DEFAULT false,
  warden BOOLEAN DEFAULT false,
  room_cleaning BOOLEAN DEFAULT false,
  parking TEXT DEFAULT 'None',
  gate_closing_time TEXT,
  no_smoking BOOLEAN DEFAULT false,
  no_guardian BOOLEAN DEFAULT false,
  no_non_veg BOOLEAN DEFAULT false,
  no_drinking BOOLEAN DEFAULT false,
  other_rules TEXT,
  directions_tip TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  plan_duration TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  properties_limit INTEGER NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES users(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  action_url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  payment_method TEXT,
  payment_gateway TEXT,
  plan_name TEXT,
  transaction_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook events table (for idempotency and event sequencing)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload JSONB NOT NULL,
  sequence_number INTEGER DEFAULT 999,
  entity_id TEXT,
  error TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook events indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_entity_status ON webhook_events(entity_id, status, sequence_number) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_events_entity_pending ON webhook_events(entity_id, sequence_number) WHERE status IN ('pending', 'processing', 'failed');
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created ON webhook_events(status, created_at);

-- 3. APPLY RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- 4. RECREATE POLICIES (Now safe because we dropped them)

-- Users
CREATE POLICY "Users can view their own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own data" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can create their profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Admins
CREATE POLICY "Admins can view all users" ON users FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "Admins can update any user" ON users FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Properties
CREATE POLICY "Anyone can view active properties" ON properties FOR SELECT USING (status = 'active' AND availability IN ('Available', 'Occupied'));
CREATE POLICY "Owners can view their own properties" ON properties FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Owners can insert properties" ON properties FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can update their own properties" ON properties FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Owners can delete their own properties" ON properties FOR DELETE USING (owner_id = auth.uid());
CREATE POLICY "Admins can view all properties" ON properties FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "Admins can update any property" ON properties FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Favorites
CREATE POLICY "Users can view their own favorites" ON favorites FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can add favorites" ON favorites FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own favorites" ON favorites FOR DELETE USING (user_id = auth.uid());

-- Messages
CREATE POLICY "Users can view own messages" ON messages FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Users can mark messages as read" ON messages FOR UPDATE USING (receiver_id = auth.uid());

-- Inquiries
CREATE POLICY "Users can view related inquiries" ON inquiries FOR SELECT USING (tenant_id = auth.uid() OR owner_id = auth.uid());
CREATE POLICY "Tenants can create inquiries" ON inquiries FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "Owners can update inquiry status" ON inquiries FOR UPDATE USING (owner_id = auth.uid());

-- Notifications
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "System can create notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can mark notifications as read" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- Webhook events (service role only)
CREATE POLICY "Service role can manage webhook events" ON webhook_events USING (true) WITH CHECK (true);

-- 5. FUNCTION & TRIGGER (Safe Drop/Create)
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inquiries_updated_at ON inquiries;
CREATE TRIGGER update_inquiries_updated_at BEFORE UPDATE ON inquiries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
