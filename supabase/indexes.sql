-- Performance Indexes for Properties Table
-- These indexes will significantly improve query performance

-- Index for city-based searches (most common filter)
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);

-- Index for area-based searches
CREATE INDEX IF NOT EXISTS idx_properties_area ON properties(area);

-- Index for property type filtering
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);

-- Index for status filtering (active, pending, rejected)
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);

-- Index for availability filtering
CREATE INDEX IF NOT EXISTS idx_properties_availability ON properties(availability);

-- Index for owner-based queries
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_properties_city_type_status 
ON properties(city, property_type, status);

-- Index for price range queries
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);

-- Index for created_at (for sorting by newest)
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at DESC);

-- Indexes for Favorites Table
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_property ON favorites(property_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_property ON favorites(user_id, property_id);

-- Indexes for Messages Table
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation 
ON messages(sender_id, receiver_id, created_at DESC);

-- Indexes for Inquiries Table
CREATE INDEX IF NOT EXISTS idx_inquiries_property ON inquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_user ON inquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);

-- Indexes for Users Table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_verified ON users(verified);

-- Full-text search index for property titles and descriptions (PostgreSQL specific)
CREATE INDEX IF NOT EXISTS idx_properties_search 
ON properties USING gin(to_tsvector('english', title || ' ' || description));

-- Analyze tables to update statistics for query planner
ANALYZE properties;
ANALYZE favorites;
ANALYZE messages;
ANALYZE inquiries;
ANALYZE users;
