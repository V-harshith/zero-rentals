-- =============================================
-- Post Property Redesign - New Columns Migration
-- =============================================
-- Run this in Supabase SQL Editor

-- Add new columns for room amenities (per room type)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS room_amenities JSONB DEFAULT '{}';
-- Format: {"single": ["Cupboard", "AC"], "double": ["TV", "Bedding"], "triple": [], "four": []}

-- Add services columns
ALTER TABLE properties ADD COLUMN IF NOT EXISTS laundry BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS warden BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS room_cleaning BOOLEAN DEFAULT false;

-- Add parking column
ALTER TABLE properties ADD COLUMN IF NOT EXISTS parking TEXT DEFAULT 'None' CHECK (parking IN ('None', 'Car', 'Bike', 'Car & Bike'));

-- Add PG rules columns
ALTER TABLE properties ADD COLUMN IF NOT EXISTS gate_closing_time TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS no_smoking BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS no_guardian BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS no_non_veg BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS no_drinking BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS other_rules TEXT;

-- Add directions tip
ALTER TABLE properties ADD COLUMN IF NOT EXISTS directions_tip TEXT;

-- Add comment
COMMENT ON COLUMN properties.room_amenities IS 'Per-room amenities stored as JSON: {"single": ["Cupboard"], "double": ["TV"]}';
COMMENT ON COLUMN properties.directions_tip IS 'Directions to reach the property using landmarks';
