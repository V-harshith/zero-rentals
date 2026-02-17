-- Add function to increment property views safely
CREATE OR REPLACE FUNCTION increment_property_views(property_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE properties
    SET views = COALESCE(views, 0) + 1
    WHERE id = property_id;
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION increment_property_views(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_property_views(UUID) TO anon;
