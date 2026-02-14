-- Enable RLS on properties table if not already enabled
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow public read access to all properties
-- This allows anyone to view properties (required for property listings and details)
CREATE POLICY "Anyone can view properties" ON properties
  FOR SELECT
  USING (true);

-- Policy 2: Property owners can insert their own properties
CREATE POLICY "Owners can create properties" ON properties
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Policy 3: Property owners can update their own properties
CREATE POLICY "Owners can update own properties" ON properties
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Policy 4: Property owners can delete their own properties
CREATE POLICY "Owners can delete own properties" ON properties
  FOR DELETE
  USING (auth.uid() = owner_id);

-- Policy 5: Admins can manage all properties
CREATE POLICY "Admins can manage all properties" ON properties
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
