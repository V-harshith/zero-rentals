-- Alternative approach: Query all existing policies on favorites table
-- Run this FIRST to see what policies exist:

SELECT policyname 
FROM pg_policies 
WHERE tablename = 'favorites';
