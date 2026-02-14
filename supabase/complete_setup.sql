-- =============================================
-- ZeroRentals - COMPLETE Database Setup
-- Run this ENTIRE file in Supabase SQL Editor
-- =============================================

-- =============================================
-- PART 1: BASE SCHEMA
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'tenant')),
  avatar_url TEXT,
  verified BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  -- Email verification fields
  verification_token TEXT,
  token_expires_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- PROPERTIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Basic Info
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL CHECK (property_type IN ('PG', 'Co-living', 'Rent')),
  room_type TEXT NOT NULL CHECK (room_type IN ('Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK')),
  
  -- Location
  country TEXT DEFAULT 'India',
  city TEXT NOT NULL,
  area TEXT NOT NULL,
  locality TEXT,
  address TEXT,
  landmark TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  google_maps_url TEXT,
  
  -- Owner Info
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL,
  owner_contact TEXT NOT NULL,
  owner_verified BOOLEAN DEFAULT false,
  
  -- Pricing
  private_room_price INTEGER,
  double_sharing_price INTEGER,
  triple_sharing_price INTEGER,
  four_sharing_price INTEGER,
  deposit INTEGER,
  maintenance INTEGER,
  
  -- Details
  furnishing TEXT CHECK (furnishing IN ('Fully Furnished', 'Semi Furnished', 'Unfurnished')),
  floor_number INTEGER,
  total_floors INTEGER,
  room_size INTEGER,
  preferred_tenant TEXT CHECK (preferred_tenant IN ('Male', 'Female', 'Any', 'Gents', 'Ladies')),
  
  -- Features
  facilities TEXT[],
  amenities TEXT[],
  usp TEXT,
  rules TEXT[],
  nearby_places TEXT[],
  
  -- Media
  images TEXT[],
  videos TEXT[],
  
  -- Status
  availability TEXT DEFAULT 'Available' CHECK (availability IN ('Available', 'Occupied', 'Under Maintenance')),
  featured BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'rejected')),
  
  -- Metadata
  views INTEGER DEFAULT 0,
  psn INTEGER,
  source TEXT DEFAULT 'manual',
  
  -- Post-property form additions
  room_amenities JSONB DEFAULT '{}',
  laundry BOOLEAN DEFAULT false,
  warden BOOLEAN DEFAULT false,
  room_cleaning BOOLEAN DEFAULT false,
  parking TEXT DEFAULT 'None' CHECK (parking IN ('None', 'Car', 'Bike', 'Car & Bike')),
  gate_closing_time TEXT,
  no_smoking BOOLEAN DEFAULT false,
  no_guardian BOOLEAN DEFAULT false,
  no_non_veg BOOLEAN DEFAULT false,
  no_drinking BOOLEAN DEFAULT false,
  other_rules TEXT,
  directions_tip TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);

-- =============================================
-- SUBSCRIPTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  plan_duration TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  properties_limit INTEGER NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INQUIRIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES users(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'responded', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- MESSAGES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- FAVORITES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('inquiry', 'message', 'payment', 'system')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  action_url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- PAYMENT_LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  payment_method TEXT,
  payment_gateway TEXT,
  transaction_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- PART 2: INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_area ON properties(area);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_featured ON properties(featured);
CREATE INDEX IF NOT EXISTS idx_properties_availability ON properties(availability);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_property ON inquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_tenant ON inquiries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_owner ON inquiries(owner_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_property ON favorites(property_id);

-- =============================================
-- PART 3: ENABLE RLS ON ALL TABLES
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PART 4: RLS POLICIES - USERS
-- =============================================

CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can create their profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admin special policies
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Admins can update any user" ON users
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- =============================================
-- PART 5: RLS POLICIES - PROPERTIES
-- =============================================

CREATE POLICY "Anyone can view active properties" ON properties
  FOR SELECT USING (status = 'active' AND availability IN ('Available', 'Occupied'));

CREATE POLICY "Owners can view their own properties" ON properties
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Owners can insert properties" ON properties
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their own properties" ON properties
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their own properties" ON properties
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "Admins can view all properties" ON properties
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Admins can update any property" ON properties
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- =============================================
-- PART 6: RLS POLICIES - FAVORITES
-- =============================================

CREATE POLICY "Users can view their own favorites" ON favorites
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can add favorites" ON favorites
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own favorites" ON favorites
  FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- PART 7: RLS POLICIES - MESSAGES
-- =============================================

CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can mark messages as read" ON messages
  FOR UPDATE USING (receiver_id = auth.uid());

-- =============================================
-- PART 8: RLS POLICIES - INQUIRIES
-- =============================================

CREATE POLICY "Users can view related inquiries" ON inquiries
  FOR SELECT USING (tenant_id = auth.uid() OR owner_id = auth.uid());

CREATE POLICY "Tenants can create inquiries" ON inquiries
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Owners can update inquiry status" ON inquiries
  FOR UPDATE USING (owner_id = auth.uid());

-- =============================================
-- PART 9: RLS POLICIES - NOTIFICATIONS
-- =============================================

CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can create notifications" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can mark notifications as read" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- =============================================
-- PART 10: FUNCTIONS & TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inquiries_updated_at ON inquiries;
CREATE TRIGGER update_inquiries_updated_at BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- PART 11: STORAGE BUCKET
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public Access" ON storage.objects 
  FOR SELECT USING (bucket_id = 'property-images');

CREATE POLICY "Authenticated users can upload images" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'property-images' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update own images" ON storage.objects 
  FOR UPDATE USING (bucket_id = 'property-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own images" ON storage.objects 
  FOR DELETE USING (bucket_id = 'property-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- PART 12: SEED DATA
-- =============================================

INSERT INTO users (email, name, role, verified, status, email_verified_at)
VALUES 
  ('admin@zerorentals.com', 'Admin', 'admin', true, 'active', NOW()),
  ('owner@zerorentals.com', 'Demo Owner', 'owner', true, 'active', NOW()),
  ('tenant@zerorentals.com', 'Demo Tenant', 'tenant', true, 'active', NOW())
ON CONFLICT (email) DO NOTHING;
