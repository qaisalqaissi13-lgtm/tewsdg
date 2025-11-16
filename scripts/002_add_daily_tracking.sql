-- Add last_reset column to track when breaks were last reset
alter table public.workers add column if not exists last_reset_date date default current_date;

-- Add function to get total break minutes for today
create or replace function get_daily_break_minutes(p_worker_id uuid, p_date date default current_date)
returns integer as $$
  select coalesce(sum(duration_minutes), 0)::integer
  from public.break_history
  where worker_id = p_worker_id
    and date(started_at) = p_date;
$$ language sql stable;
