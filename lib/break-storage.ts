export interface BreakRecord {
  workerId: string
  workerName: string
  startTime: number
  endTime: number
  duration: number // in minutes
}

export interface WorkerStats {
  totalBreaks: number
  totalMinutes: number
  breaks: BreakRecord[]
}

const STORAGE_KEY = 'break-tracker-history'

export function saveBreakRecord(record: BreakRecord): void {
  const history = getBreakHistory()
  history.push(record)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

export function getBreakHistory(): BreakRecord[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

export function getWorkerStats(workerId: string): WorkerStats {
  const history = getBreakHistory()
  const workerBreaks = history.filter(b => b.workerId === workerId)
  
  return {
    totalBreaks: workerBreaks.length,
    totalMinutes: workerBreaks.reduce((sum, b) => sum + b.duration, 0),
    breaks: workerBreaks
  }
}

export function getAllWorkersStats(): Record<string, WorkerStats> {
  const history = getBreakHistory()
  const statsMap: Record<string, WorkerStats> = {}
  
  history.forEach(record => {
    if (!statsMap[record.workerId]) {
      statsMap[record.workerId] = {
        totalBreaks: 0,
        totalMinutes: 0,
        breaks: []
      }
    }
    statsMap[record.workerId].totalBreaks++
    statsMap[record.workerId].totalMinutes += record.duration
    statsMap[record.workerId].breaks.push(record)
  })
  
  return statsMap
}

export function canTakeBreak(workerId: string): { allowed: boolean; reason?: string } {
  const stats = getWorkerStats(workerId)
  
  if (stats.totalMinutes >= 60) {
    return { 
      allowed: false, 
      reason: 'Worker has already used 60 minutes of break time today' 
    }
  }
  
  return { allowed: true }
}

export function clearBreakHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}
