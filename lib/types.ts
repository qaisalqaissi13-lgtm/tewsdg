export interface Worker {
  id: string;
  name: string;
  created_at: string;
}

export interface BreakHistory {
  id: string;
  worker_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  created_at: string;
}

export interface BreakRequest {
  id: string;
  worker_id: string;
  status: 'pending' | 'approved' | 'on_break' | 'completed';
  requested_at: string;
  approved_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  remaining_seconds?: number;
  is_paused?: boolean;
  elapsed_seconds?: number;
  worker?: Worker;
}
