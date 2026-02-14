-- =============================================
-- ZeroRentals Database Schema for Supabase
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'tenant')),
  avatar_url TEXT,
  verified BOOLEAN DEFAULT false,
  city TEXT,
  address TEXT,
  business_name TEXT,
  gst_number TEXT,
  bank_name TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  account_holder_name TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- PROPERTIES TABLE
-- =============================================
CREATE TABLE properties (
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
  facilities TEXT[], -- Array of facilities
  amenities TEXT[], -- Array of amenities
  usp TEXT, -- Unique Selling Point
  rules TEXT[],
  nearby_places TEXT[],
  
  -- Media
  images TEXT[], -- Array of image URLs
  videos TEXT[],
  
  -- Status
  availability TEXT DEFAULT 'Available' CHECK (availability IN ('Available', 'Occupied', 'Under Maintenance')),
  featured BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'rejected')),
  
  -- Metadata
  views INTEGER DEFAULT 0,
  psn INTEGER, -- Property Serial Number from Excel
  source TEXT DEFAULT 'manual', -- manual, excel_import, api
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);

-- =============================================
-- SUBSCRIPTIONS TABLE
-- =============================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  plan_duration TEXT NOT NULL, -- '1_month', '3_months', '6_months', '1_year'
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
CREATE TABLE inquiries (
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
CREATE TABLE messages (
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
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE notifications (
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
CREATE TABLE payment_logs (
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
-- INDEXES
-- =============================================

-- Properties indexes
CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_properties_area ON properties(area);
CREATE INDEX idx_properties_type ON properties(property_type);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_featured ON properties(featured);
CREATE INDEX idx_properties_availability ON properties(availability);

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- Inquiries indexes
CREATE INDEX idx_inquiries_property ON inquiries(property_id);
CREATE INDEX idx_inquiries_tenant ON inquiries(tenant_id);
CREATE INDEX idx_inquiries_owner ON inquiries(owner_id);

-- Messages indexes
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_receiver ON messages(receiver_id);

-- Favorites indexes
CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_property ON favorites(property_id);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can create their profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Properties policies
CREATE POLICY "Anyone can view active properties" ON properties
  FOR SELECT USING (status = 'active' AND availability = 'Available');

CREATE POLICY "Owners can view their own properties" ON properties
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Owners can insert properties" ON properties
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their own properties" ON properties
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their own properties" ON properties
  FOR DELETE USING (owner_id = auth.uid());

-- Favorites policies
CREATE POLICY "Users can view their own favorites" ON favorites
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can add favorites" ON favorites
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove favorites" ON favorites
  FOR DELETE USING (user_id = auth.uid());

-- Messages policies
CREATE POLICY "Users can view their messages" ON messages
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inquiries_updated_at BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SEED DATA (Admin User)
-- =============================================

INSERT INTO users (email, name, role, verified, status)
VALUES 
  ('admin@zerorentals.com', 'Admin', 'admin', true, 'active'),
  ('owner@zerorentals.com', 'Demo Owner', 'owner', true, 'active'),
  ('tenant@zerorentals.com', 'Demo Tenant', 'tenant', true, 'active');
