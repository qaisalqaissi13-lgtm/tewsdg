-- Create workers table
create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Create break_history table
create table if not exists public.break_history (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer,
  created_at timestamptz default now()
);

-- Create break_requests table
create table if not exists public.break_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'on_break', 'completed')),
  requested_at timestamptz default now(),
  approved_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz
);

-- Create indexes for better performance
create index if not exists idx_break_history_worker_id on public.break_history(worker_id);
create index if not exists idx_break_requests_worker_id on public.break_requests(worker_id);
create index if not exists idx_break_requests_status on public.break_requests(status);

-- Enable Row Level Security (RLS)
alter table public.workers enable row level security;
alter table public.break_history enable row level security;
alter table public.break_requests enable row level security;

-- RLS Policies - Allow all operations for now (no auth required for this app)
create policy "Allow all operations on workers" on public.workers for all using (true) with check (true);
create policy "Allow all operations on break_history" on public.break_history for all using (true) with check (true);
create policy "Allow all operations on break_requests" on public.break_requests for all using (true) with check (true);
