-- Migration: Add one_rk_price column for separate 1RK pricing
-- This separates 1RK pricing from 1BHK/Single room pricing

-- Add new column for 1RK pricing
ALTER TABLE properties ADD COLUMN IF NOT EXISTS one_rk_price INTEGER;

-- Update existing 1RK properties to use new column
-- Move their private_room_price to one_rk_price and clear private_room_price
UPDATE properties
SET one_rk_price = private_room_price,
    private_room_price = NULL
WHERE room_type = '1RK'
  AND private_room_price IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN properties.one_rk_price IS 'Price for 1RK room type (separate from 1BHK/Single room price)';
