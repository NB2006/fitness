create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  amount numeric not null,
  status text not null default 'pending',
  pay_type text,
  trade_no text,
  raw_notify jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
