-- =============================================-- COMPLETE RLS POLICIES FOR ALL TABLES-- Run this in Supabase SQL Editor to ensure all tables have proper RLS-- =============================================

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================-- USERS TABLE POLICIES-- =============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile" ON users FOR SELECT
    USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Admins can view all users'
  ) THEN
    CREATE POLICY "Admins can view all users" ON users FOR SELECT
    USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Admins can update any user'
  ) THEN
    CREATE POLICY "Admins can update any user" ON users FOR UPDATE
    USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Admins can delete users'
  ) THEN
    CREATE POLICY "Admins can delete users" ON users FOR DELETE
    USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Service can insert users'
  ) THEN
    CREATE POLICY "Service can insert users" ON users FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

-- =============================================-- PROPERTIES TABLE POLICIES-- =============================================
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'properties' AND policyname = 'Anyone can view active properties'
  ) THEN
    CREATE POLICY "Anyone can view active properties" ON properties FOR SELECT
    USING (status = 'active' AND availability = 'Available');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'properties' AND policyname = 'Owners can view own properties'
  ) THEN
    CREATE POLICY "Owners can view own properties" ON properties FOR SELECT
    USING (auth.uid() = owner_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'properties' AND policyname = 'Owners can insert properties'
  ) THEN
    CREATE POLICY "Owners can insert properties" ON properties FOR INSERT
    WITH CHECK (auth.uid() = owner_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'properties' AND policyname = 'Owners can update own properties'
  ) THEN
    CREATE POLICY "Owners can update own properties" ON properties FOR UPDATE
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'properties' AND policyname = 'Owners can delete own properties'
  ) THEN
    CREATE POLICY "Owners can delete own properties" ON properties FOR DELETE
    USING (auth.uid() = owner_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'properties' AND policyname = 'Admins can view all properties'
  ) THEN
    CREATE POLICY "Admins can view all properties" ON properties FOR SELECT
    USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'properties' AND policyname = 'Admins can update any property'
  ) THEN
    CREATE POLICY "Admins can update any property" ON properties FOR UPDATE
    USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'properties' AND policyname = 'Admins can delete any property'
  ) THEN
    CREATE POLICY "Admins can delete any property" ON properties FOR DELETE
    USING (is_admin());
  END IF;
END $$;

-- =============================================-- SUBSCRIPTIONS TABLE POLICIES-- =============================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Users can view own subscriptions'
  ) THEN
    CREATE POLICY "Users can view own subscriptions" ON subscriptions FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Users can insert own subscriptions'
  ) THEN
    CREATE POLICY "Users can insert own subscriptions" ON subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Admins can view all subscriptions'
  ) THEN
    CREATE POLICY "Admins can view all subscriptions" ON subscriptions FOR SELECT
    USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Admins can update subscriptions'
  ) THEN
    CREATE POLICY "Admins can update subscriptions" ON subscriptions FOR UPDATE
    USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Service can manage subscriptions'
  ) THEN
    CREATE POLICY "Service can manage subscriptions" ON subscriptions FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- =============================================-- FAVORITES TABLE POLICIES-- =============================================
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'favorites' AND policyname = 'Users can view own favorites'
  ) THEN
    CREATE POLICY "Users can view own favorites" ON favorites FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'favorites' AND policyname = 'Users can add favorites'
  ) THEN
    CREATE POLICY "Users can add favorites" ON favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'favorites' AND policyname = 'Users can delete own favorites'
  ) THEN
    CREATE POLICY "Users can delete own favorites" ON favorites FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================-- MESSAGES TABLE POLICIES-- =============================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Users can view own messages'
  ) THEN
    CREATE POLICY "Users can view own messages" ON messages FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Users can send messages'
  ) THEN
    CREATE POLICY "Users can send messages" ON messages FOR INSERT
    WITH CHECK (auth.uid() = sender_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Users can update sent messages'
  ) THEN
    CREATE POLICY "Users can update sent messages" ON messages FOR UPDATE
    USING (auth.uid() = sender_id);
  END IF;
END $$;

-- =============================================-- INQUIRIES TABLE POLICIES-- =============================================
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inquiries' AND policyname = 'Users can view related inquiries'
  ) THEN
    CREATE POLICY "Users can view related inquiries" ON inquiries FOR SELECT
    USING (auth.uid() = tenant_id OR auth.uid() = owner_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inquiries' AND policyname = 'Tenants can create inquiries'
  ) THEN
    CREATE POLICY "Tenants can create inquiries" ON inquiries FOR INSERT
    WITH CHECK (auth.uid() = tenant_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inquiries' AND policyname = 'Owners can update inquiry status'
  ) THEN
    CREATE POLICY "Owners can update inquiry status" ON inquiries FOR UPDATE
    USING (auth.uid() = owner_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inquiries' AND policyname = 'Tenants can update own inquiries'
  ) THEN
    CREATE POLICY "Tenants can update own inquiries" ON inquiries FOR UPDATE
    USING (auth.uid() = tenant_id);
  END IF;
END $$;

-- =============================================-- NOTIFICATIONS TABLE POLICIES-- =============================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users can view own notifications'
  ) THEN
    CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users can update own notifications'
  ) THEN
    CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users can delete own notifications'
  ) THEN
    CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Service can insert notifications'
  ) THEN
    CREATE POLICY "Service can insert notifications" ON notifications FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

-- =============================================-- PAYMENT_LOGS TABLE POLICIES-- =============================================
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_logs' AND policyname = 'Users can view own payments'
  ) THEN
    CREATE POLICY "Users can view own payments" ON payment_logs FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_logs' AND policyname = 'Admins can view all payments'
  ) THEN
    CREATE POLICY "Admins can view all payments" ON payment_logs FOR SELECT
    USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_logs' AND policyname = 'Service can insert payments'
  ) THEN
    CREATE POLICY "Service can insert payments" ON payment_logs FOR INSERT
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_logs' AND policyname = 'Admins can update payments'
  ) THEN
    CREATE POLICY "Admins can update payments" ON payment_logs FOR UPDATE
    USING (is_admin());
  END IF;
END $$;

-- =============================================-- ENABLE REALTIME FOR TABLES-- =============================================

-- Add tables to realtime publication (ignore if already exists)
DO $$
BEGIN
  -- Check if publication exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Add tables one by one (ignore errors if already added)
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE inquiries;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- =============================================-- FORCE RLS FOR ALL TABLES-- =============================================

ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE properties FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE inquiries FORCE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE favorites FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_logs FORCE ROW LEVEL SECURITY;
