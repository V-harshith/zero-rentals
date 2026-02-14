-- Row Level Security Policies for Properties Table

-- Enable RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active properties
CREATE POLICY "Anyone can view active properties"
ON properties FOR SELECT
USING (status = 'active' AND availability = 'Available');

-- Policy: Owners can view their own properties (any status)
CREATE POLICY "Owners can view own properties"
ON properties FOR SELECT
USING (auth.uid() = owner_id);

-- Policy: Owners can insert their own properties
CREATE POLICY "Owners can insert properties"
ON properties FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- Policy: Owners can update their own properties
CREATE POLICY "Owners can update own properties"
ON properties FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Policy: Owners can delete their own properties
CREATE POLICY "Owners can delete own properties"
ON properties FOR DELETE
USING (auth.uid() = owner_id);

-- Policy: Admins can view all properties
CREATE POLICY "Admins can view all properties"
ON properties FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Policy: Admins can update any property (for approval)
CREATE POLICY "Admins can update any property"
ON properties FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- RLS Policies for Favorites Table
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own favorites
CREATE POLICY "Users can view own favorites"
ON favorites FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can add to their favorites
CREATE POLICY "Users can add favorites"
ON favorites FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can remove from their favorites
CREATE POLICY "Users can delete own favorites"
ON favorites FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for Messages Table
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages they sent or received
CREATE POLICY "Users can view own messages"
ON messages FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Policy: Users can send messages
CREATE POLICY "Users can send messages"
ON messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- RLS Policies for Inquiries Table
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view inquiries they created or received
CREATE POLICY "Users can view related inquiries"
ON inquiries FOR SELECT
USING (auth.uid() = tenant_id OR auth.uid() = owner_id);

-- Policy: Tenants can create inquiries
CREATE POLICY "Tenants can create inquiries"
ON inquiries FOR INSERT
WITH CHECK (auth.uid() = tenant_id);

-- Policy: Owners can update inquiry status
CREATE POLICY "Owners can update inquiry status"
ON inquiries FOR UPDATE
USING (auth.uid() = owner_id);
