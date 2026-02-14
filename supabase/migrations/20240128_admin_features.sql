-- Create payments table
create table if not exists payments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  amount decimal(10,2) not null,
  currency text default 'INR',
  status text check (status in ('pending', 'completed', 'failed', 'refunded')),
  provider_order_id text,
  provider_payment_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table payments enable row level security;

-- Policies
create policy "Users can view their own payments"
  on payments for select
  using (auth.uid() = user_id);

create policy "Admins can view all payments"
  on payments for select
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );

-- Create site_settings table for CMS
create table if not exists site_settings (
  id uuid default uuid_generate_v4() primary key,
  key text unique not null,
  value jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_by uuid references auth.users
);

-- Enable RLS
alter table site_settings enable row level security;

-- Policies
create policy "Public can view settings"
  on site_settings for select
  to authenticated, anon
  using (true);

create policy "Admins can update settings"
  on site_settings for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );

-- Insert default settings
insert into site_settings (key, value)
values 
  ('contact_info', '{"email": "support@zerorentals.com", "phone": "+91 9876543210"}'::jsonb),
  ('hero_banner', '{"title": "Find Your Perfect Home", "subtitle": "Zero Brokerage. Zero Hassle."}'::jsonb)
on conflict (key) do nothing;
