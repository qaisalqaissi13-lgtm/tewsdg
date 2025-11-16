-- Add fields to track paused breaks and remaining time
alter table public.break_requests
add column if not exists remaining_seconds integer default 900; -- 15 minutes = 900 seconds

-- Add field to track if a break is paused
alter table public.break_requests
add column if not exists is_paused boolean default false;

-- Add field to track total elapsed time
alter table public.break_requests
add column if not exists elapsed_seconds integer default 0;
