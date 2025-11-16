'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Plus, UserPlus, Users, Bell, Download, RotateCcw, MoreVertical } from 'lucide-react'
import { WorkerQueue } from '@/components/worker-queue'
import { AddWorkerDialog } from '@/components/add-worker-dialog'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { exportToExcel } from '@/lib/excel-export'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Worker, BreakRequest } from '@/lib/types'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { UserMinus } from 'lucide-react'

export interface WorkerWithStatus extends Worker {
  breakStartTime?: number
  addedToQueueTime?: number
  request?: BreakRequest
  dailyBreakMinutes?: number
}

export default function BreakTrackerPage() {
  const [workers, setWorkers] = useState<WorkerWithStatus[]>([])
  const [onBreak, setOnBreak] = useState<WorkerWithStatus[]>([])
  const [waitingQueue, setWaitingQueue] = useState<WorkerWithStatus[]>([])
  const [breakRequests, setBreakRequests] = useState<BreakRequest[]>([])
  const [maxBreakSlots, setMaxBreakSlots] = useState(3)
  const [isAddWorkerOpen, setIsAddWorkerOpen] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    const cachedWorkers = localStorage.getItem('cached_workers')
    if (cachedWorkers) {
      try {
        const parsed = JSON.parse(cachedWorkers)
        setWorkers(parsed)
      } catch (e) {
        console.error('[v0] Error loading cached workers:', e)
      }
    }
  }, [])

  useEffect(() => {
    const checkAndReset = async () => {
      const now = new Date()
      const lastCheck = localStorage.getItem('lastResetCheck')
      const lastCheckDate = lastCheck ? new Date(lastCheck) : null
      
      const fourAMToday = new Date()
      fourAMToday.setHours(4, 0, 0, 0)
      
      if (!lastCheckDate || (now >= fourAMToday && lastCheckDate < fourAMToday)) {
        await performDailyReset(true)
      }
      
      localStorage.setItem('lastResetCheck', now.toISOString())
    }

    checkAndReset()
    const interval = setInterval(checkAndReset, 60000)
    return () => clearInterval(interval)
  }, [])

  const reloadAll = async () => {
    await Promise.all([
      loadWorkers(),
      loadBreakRequests(),
      loadActiveBreaks()
    ])
  }

  useEffect(() => {
    loadWorkers()
    loadBreakRequests()
    loadActiveBreaks()
    
    const workersChannel = supabase
      .channel('workers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, (payload) => {
        reloadAll()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsSubscribed(true)
        }
      })

    const requestsChannel = supabase
      .channel('requests_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'break_requests' }, (payload) => {
        // Instant notification when new request comes in
        if (payload.eventType === 'INSERT' && (payload.new as BreakRequest).status === 'pending') {
          const request = payload.new as BreakRequest
          
          // Play sound and show toast immediately
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
          const oscillator = audioContext.createOscillator()
          const gainNode = audioContext.createGain()
          
          oscillator.connect(gainNode)
          gainNode.connect(audioContext.destination)
          
          oscillator.frequency.value = 600
          oscillator.type = 'sine'
          
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
          
          oscillator.start(audioContext.currentTime)
          oscillator.stop(audioContext.currentTime + 0.3)
          
          // Instant reload to show the new request
          reloadAll()
        } else {
          // For any other change, reload data
          reloadAll()
        }
      })
      .subscribe()

    const historyChannel = supabase
      .channel('history_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'break_history' }, (payload) => {
        reloadAll()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(workersChannel)
      supabase.removeChannel(requestsChannel)
      supabase.removeChannel(historyChannel)
      setIsSubscribed(false)
    }
  }, [])

  const loadWorkers = async () => {
    console.log('Loading workers...')
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('Error loading workers:', error)
      return
    }
    
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayISO = startOfToday.toISOString()
    
    // Get all break history for today in one query
    const { data: allHistory, error: historyError } = await supabase
      .from('break_history')
      .select('worker_id, duration_minutes, started_at')
      .gte('started_at', todayISO)
    
    if (historyError) {
      console.error('Error loading break history:', historyError)
    }
    
    // Calculate daily minutes for each worker from the batch result
    const workersWithMinutes = (data || []).map((worker) => {
      const workerHistory = allHistory?.filter(h => h.worker_id === worker.id) || []
      const dailyBreakMinutes = workerHistory.reduce((sum, b) => sum + (b.duration_minutes || 0), 0)
      
      return {
        ...worker,
        dailyBreakMinutes
      }
    })
    
    setWorkers(workersWithMinutes)
    localStorage.setItem('cached_workers', JSON.stringify(workersWithMinutes))
    console.log('Workers loaded with break minutes:', workersWithMinutes.map(w => ({ name: w.name, minutes: w.dailyBreakMinutes })))
  }

  const loadBreakRequests = async () => {
    const { data, error } = await supabase
      .from('break_requests')
      .select(`
        *,
        worker:workers(*)
      `)
      .in('status', ['pending', 'approved'])
      .order('requested_at', { ascending: true })
    
    if (error) {
      console.error('Error loading break requests:', error)
      return
    }
    
    setBreakRequests(data || [])
    
    const approvedRequests = (data || []).filter((req: BreakRequest) => req.status === 'approved')
    
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    
    const workerIds = approvedRequests.map(req => req.worker_id)
    const { data: history } = await supabase
      .from('break_history')
      .select('worker_id, duration_minutes')
      .in('worker_id', workerIds)
      .gte('started_at', startOfToday.toISOString())
    
    const queueWithMinutes = approvedRequests.map((req: BreakRequest) => {
      const workerHistory = history?.filter(h => h.worker_id === req.worker_id) || []
      const dailyBreakMinutes = workerHistory.reduce((sum, b) => sum + (b.duration_minutes || 0), 0)
      
      return {
        ...req.worker!,
        addedToQueueTime: new Date(req.approved_at!).getTime(),
        request: req,
        dailyBreakMinutes
      }
    })
    
    setWaitingQueue(queueWithMinutes)
  }

  const loadActiveBreaks = async () => {
    const { data, error } = await supabase
      .from('break_requests')
      .select(`
        *,
        worker:workers(*)
      `)
      .eq('status', 'on_break')
      .order('started_at', { ascending: true })
    
    if (error) {
      console.error('Error loading active breaks:', error)
      return
    }
    
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    
    const workerIds = (data || []).map(req => req.worker_id)
    const { data: history } = await supabase
      .from('break_history')
      .select('worker_id, duration_minutes')
      .in('worker_id', workerIds)
      .gte('started_at', startOfToday.toISOString())
    
    const breaksWithMinutes = (data || []).map((req: BreakRequest) => {
      const workerHistory = history?.filter(h => h.worker_id === req.worker_id) || []
      const dailyBreakMinutes = workerHistory.reduce((sum, b) => sum + (b.duration_minutes || 0), 0)
      
      return {
        ...req.worker!,
        breakStartTime: new Date(req.started_at!).getTime(),
        request: req,
        dailyBreakMinutes
      }
    })
    
    setOnBreak(breaksWithMinutes)
  }

  useEffect(() => {
    const availableSlots = maxBreakSlots - onBreak.length
    if (availableSlots > 0 && waitingQueue.length > 0) {
      toast({
        title: '🔔 Break Slot Available',
        description: `${waitingQueue[0].name} can now take their break!`,
        duration: 5000,
      })
    }
  }, [onBreak.length, waitingQueue.length, maxBreakSlots])

  const addWorker = async (name: string) => {
    const { data, error } = await supabase
      .from('workers')
      .insert({ name })
      .select()
      .single()
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to add worker',
        variant: 'destructive',
      })
      return
    }
    
    toast({
      title: 'Worker Added',
      description: `${name} has been added to the system.`,
    })
  }

  const approveBreakRequest = async (requestId: string) => {
    const request = breakRequests.find(r => r.id === requestId)
    if (!request) return

    setBreakRequests(prev => prev.filter(r => r.id !== requestId))
    
    // Show immediate visual feedback
    toast({
      title: 'Approving Request...',
      description: `Processing ${request.worker?.name}'s request`,
    })
    
    const { error } = await supabase
      .from('break_requests')
      .update({ 
        status: 'approved',
        approved_at: new Date().toISOString()
      })
      .eq('id', requestId)
    
    if (error) {
      // Revert on error
      toast({
        title: 'Error',
        description: 'Failed to approve request. Please try again.',
        variant: 'destructive',
      })
      reloadAll()
      return
    }
    
    // Real-time subscriptions will handle updates, but we reload to ensure consistency
    await reloadAll()
    
    // Confirmation feedback
    toast({
      title: 'Request Approved ✓',
      description: `${request.worker?.name} added to waiting queue. They have been notified.`,
    })
  }

  const denyBreakRequest = async (requestId: string) => {
    const request = breakRequests.find(r => r.id === requestId)
    
    setBreakRequests(prev => prev.filter(r => r.id !== requestId))
    
    const { error } = await supabase
      .from('break_requests')
      .update({ status: 'completed' })
      .eq('id', requestId)
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to deny request. Please try again.',
        variant: 'destructive',
      })
      reloadAll()
      return
    }
    
    toast({
      title: 'Request Denied',
      description: `${request?.worker?.name} has been notified`,
      variant: 'destructive',
    })
  }

  const sendToBreak = async (workerId: string) => {
    const workerInQueue = waitingQueue.find((w) => w.id === workerId)
    const worker = workerInQueue || workers.find(w => w.id === workerId)
    
    if (!worker) return

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    
    const { data: history } = await supabase
      .from('break_history')
      .select('duration_minutes')
      .eq('worker_id', workerId)
      .gte('started_at', startOfToday.toISOString())
    
    const totalMinutes = history?.reduce((sum, b) => sum + (b.duration_minutes || 0), 0) || 0
    
    if (totalMinutes >= 60) {
      toast({
        title: 'Break Not Allowed',
        description: `${worker.name} has used all 60 minutes today`,
        variant: 'destructive',
      })
      return
    }

    if (workerInQueue) {
      setWaitingQueue(prev => prev.filter(w => w.id !== workerId))
      setOnBreak(prev => [...prev, { ...workerInQueue, breakStartTime: Date.now() }])
    }

    toast({
      title: 'Starting Break...',
      description: `${worker.name} is being sent on break`,
    })

    if (workerInQueue && workerInQueue.request) {
      const { error } = await supabase
        .from('break_requests')
        .update({ 
          status: 'on_break',
          started_at: new Date().toISOString()
        })
        .eq('id', workerInQueue.request.id)
      
      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to start break. Please try again.',
          variant: 'destructive',
        })
        reloadAll()
        return
      }
    } else {
      const { error } = await supabase
        .from('break_requests')
        .insert({
          worker_id: workerId,
          status: 'on_break',
          requested_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
          started_at: new Date().toISOString()
        })
      
      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to start break. Please try again.',
          variant: 'destructive',
        })
        reloadAll()
        return
      }
    }
    
    // Real-time subscription will update, but reload to ensure consistency
    await reloadAll()
    
    toast({
      title: 'Break Started ✓',
      description: `${worker.name} is now on break. Worker has been notified.`,
    })
  }

  const endBreak = async (workerId: string, isPause: boolean = false) => {
    const worker = onBreak.find((w) => w.id === workerId)
    if (!worker || !worker.request) return

    const startTime = new Date(worker.request.started_at!).getTime()
    const endTime = Date.now()
    const elapsedSeconds = Math.floor((endTime - startTime) / 1000)
    const previousElapsed = worker.request.elapsed_seconds || 0
    const totalElapsed = previousElapsed + elapsedSeconds
    const remainingSeconds = Math.max(0, 900 - totalElapsed)
    const minutesUsed = Math.ceil(totalElapsed / 60)
    
    if (!isPause) {
      setOnBreak(prev => prev.filter(w => w.id !== workerId))
    }
    
    if (isPause) {
      const { error } = await supabase
        .from('break_requests')
        .update({ 
          status: 'approved',
          is_paused: true,
          elapsed_seconds: totalElapsed,
          remaining_seconds: remainingSeconds
        })
        .eq('id', worker.request.id)
      
      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to pause break',
          variant: 'destructive',
        })
        reloadAll()
        return
      }

      await reloadAll()
      
      toast({
        title: 'Break Paused',
        description: `${worker.name} has ${Math.ceil(remainingSeconds / 60)} minutes remaining`,
      })
    } else {
      const duration = Math.min(minutesUsed, 15)
      const breakStartedAt = new Date(worker.request.started_at!)
      const breakEndedAt = new Date(endTime)
      
      const { error: historyError } = await supabase
        .from('break_history')
        .insert({
          worker_id: workerId,
          started_at: breakStartedAt.toISOString(),
          ended_at: breakEndedAt.toISOString(),
          duration_minutes: duration
        })
      
      if (historyError) {
        toast({
          title: 'Error',
          description: 'Failed to save break history',
          variant: 'destructive',
        })
        reloadAll()
        return
      }

      const { error: requestError } = await supabase
        .from('break_requests')
        .update({ 
          status: 'completed',
          ended_at: new Date().toISOString()
        })
        .eq('id', worker.request.id)
      
      if (requestError) {
        toast({
          title: 'Error',
          description: 'Failed to end break',
          variant: 'destructive',
        })
        reloadAll()
        return
      }

      await new Promise(resolve => setTimeout(resolve, 300))
      await reloadAll()

      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      
      const { data: updatedHistory } = await supabase
        .from('break_history')
        .select('duration_minutes')
        .eq('worker_id', workerId)
        .gte('started_at', startOfToday.toISOString())
      
      const newTotalMinutes = updatedHistory?.reduce((sum, b) => sum + (b.duration_minutes || 0), 0) || 0
      const remainingMinutesForDay = Math.max(0, 60 - newTotalMinutes)

      toast({
        title: 'Break Ended',
        description: `${worker.name} returned. Used ${duration} min. ${remainingMinutesForDay} min remaining today.`,
      })
    }
  }

  const removeFromQueue = async (workerId: string) => {
    const worker = waitingQueue.find((w) => w.id === workerId)
    if (!worker || !worker.request) return
    
    setWaitingQueue(prev => prev.filter(w => w.id !== workerId))
    
    const { error } = await supabase
      .from('break_requests')
      .update({ status: 'completed' })
      .eq('id', worker.request.id)
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove from queue',
        variant: 'destructive',
      })
      reloadAll()
      return
    }
    
    toast({
      title: 'Removed from Queue',
      description: `${worker.name} removed from waiting queue`,
    })
  }

  const removeWorker = async (workerId: string) => {
    const worker = workers.find((w) => w.id === workerId)
    
    if (!confirm(`Remove ${worker?.name}? This will delete all their break history.`)) {
      return
    }

    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('id', workerId)
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove worker',
        variant: 'destructive',
      })
      return
    }
    
    await reloadAll()
    
    if (worker) {
      toast({
        title: 'Worker Removed',
        description: `${worker.name} removed from system`,
        variant: 'destructive',
      })
    }
  }

  const performDailyReset = async (isAutomatic = false) => {
    console.log('Starting comprehensive daily reset...')
    
    try {
      const { error: endBreaksError } = await supabase
        .from('break_requests')
        .update({ 
          status: 'completed',
          ended_at: new Date().toISOString()
        })
        .in('status', ['on_break', 'approved', 'pending'])
      
      if (endBreaksError) {
        console.error('Error ending breaks:', endBreaksError)
        throw endBreaksError
      }

      console.log('All active breaks ended')

      const { error: deleteHistoryError } = await supabase
        .from('break_history')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all records
      
      if (deleteHistoryError) {
        console.error('Error deleting break history:', deleteHistoryError)
        throw deleteHistoryError
      }

      console.log('All break history deleted')

      const { data: allWorkers, error: fetchError } = await supabase
        .from('workers')
        .select('id')
      
      if (fetchError) {
        console.error('Error fetching workers:', fetchError)
        throw fetchError
      }

      if (allWorkers && allWorkers.length > 0) {
        const workerIds = allWorkers.map(w => w.id)
        const { error: resetError } = await supabase
          .from('workers')
          .update({ last_reset_date: new Date().toISOString().split('T')[0] })
          .in('id', workerIds)
        
        if (resetError) {
          console.error('Error resetting workers:', resetError)
          throw resetError
        }
        
        console.log('Reset complete for', workerIds.length, 'workers')
      }

      localStorage.removeItem('cached_workers')
      localStorage.removeItem('cached_total_minutes')
      localStorage.setItem('lastResetCheck', new Date().toISOString())

      console.log('Local caches cleared')

      await new Promise(resolve => setTimeout(resolve, 1000))

      await Promise.all([
        loadWorkers(),
        loadBreakRequests(),
        loadActiveBreaks()
      ])

      console.log('All data reloaded - daily reset completed successfully')

      if (!isAutomatic) {
        toast({
          title: 'Daily Reset Complete',
          description: 'All breaks ended and time reset to 60 minutes for all workers.',
        })
      }
    } catch (error) {
      console.error('Daily reset failed:', error)
      toast({
        title: 'Reset Failed',
        description: 'There was an error resetting breaks. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleManualReset = () => {
    if (confirm('Are you sure you want to reset all breaks? This will:\n\n• End all active breaks\n• Clear waiting queue\n• Delete all break history\n• Reset everyone to 60 minutes\n\nThis action cannot be undone.')) {
      performDailyReset(false)
    }
  }

  const availableWorkers = workers.filter(
    (w) => !onBreak.find((ob) => ob.id === w.id) && !waitingQueue.find((wq) => wq.id === w.id)
  )

  const handleExportExcel = async () => {
    const { data: history } = await supabase
      .from('break_history')
      .select(`
        *,
        worker:workers(name)
      `)
      .order('created_at', { ascending: false })
    
    if (!history) return
    
    exportToExcel(workers, history as any)
    toast({
      title: 'Report Exported',
      description: 'Break report has been downloaded as CSV file.',
    })
  }

  const pendingRequests = breakRequests.filter(r => r.status === 'pending')

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-balance mb-2">Supervisor Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor and manage worker breaks in real-time
              {isSubscribed && (
                <Badge variant="outline" className="ml-2 text-xs">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
                  Live
                </Badge>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <Button asChild variant="outline">
              <Link href="/worker">
                <Users className="mr-2 h-4 w-4" />
                Worker Portal
              </Link>
            </Button>
            <Button onClick={handleExportExcel} variant="outline" disabled={workers.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
            <Button onClick={handleManualReset} variant="outline" disabled={workers.length === 0}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset All Breaks
            </Button>
            <Button onClick={() => setIsAddWorkerOpen(true)} size="lg">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Worker
            </Button>
          </div>
        </div>

        {pendingRequests.length > 0 && (
          <Card className="p-6 border-primary/50 bg-primary/5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Break Requests</h3>
              <Badge variant="default">{pendingRequests.length}</Badge>
            </div>
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-background border"
                >
                  <div>
                    <p className="font-medium">{request.worker?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Requested {new Date(request.requested_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => approveBreakRequest(request.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => denyBreakRequest(request.id)}
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Workers</p>
                <p className="text-3xl font-bold">{workers.length}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">On Break</p>
                <p className="text-3xl font-bold">{onBreak.length}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">In Queue</p>
                <p className="text-3xl font-bold">{waitingQueue.length}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Bell className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Available Slots</p>
                <p className="text-3xl font-bold">{maxBreakSlots - onBreak.length}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <Plus className="h-6 w-6 text-success" />
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WorkerQueue
            title="Currently On Break"
            description={`${onBreak.length} worker${onBreak.length !== 1 ? 's' : ''} on break`}
            workers={onBreak}
            type="break"
            onEndBreak={endBreak}
            onRemoveWorker={removeWorker}
          />

          <WorkerQueue
            title="Waiting Queue"
            description={`${waitingQueue.length} worker${waitingQueue.length !== 1 ? 's' : ''} waiting`}
            workers={waitingQueue}
            type="queue"
            onRemoveFromQueue={removeFromQueue}
            onRemoveWorker={removeWorker}
            onSendToBreak={sendToBreak}
          />
        </div>

        {availableWorkers.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Available Workers</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {availableWorkers.map((worker) => {
                const remainingMinutes = Math.max(0, 60 - (worker.dailyBreakMinutes || 0))
                const isLowTime = remainingMinutes <= 15
                const isNoTime = remainingMinutes === 0
                
                return (
                  <div
                    key={worker.id}
                    className="flex flex-col gap-2 p-4 rounded-lg bg-accent hover:bg-accent/80 transition-colors border"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-base">{worker.name}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => removeWorker(worker.id)}
                          >
                            <UserMinus className="h-4 w-4 mr-2" />
                            Remove Worker
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Badge 
                        variant={isNoTime ? 'destructive' : isLowTime ? 'secondary' : 'outline'}
                        className="text-sm font-semibold flex-1 justify-center"
                      >
                        {remainingMinutes} min remaining
                      </Badge>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      Used: {worker.dailyBreakMinutes || 0} / 60 minutes
                    </div>
                    
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => sendToBreak(worker.id)}
                      disabled={isNoTime}
                      className="w-full"
                    >
                      {isNoTime ? 'No Time Left' : 'Start Break'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {workers.length === 0 && (
          <Card className="p-12">
            <div className="text-center">
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Workers Added</h3>
              <p className="text-muted-foreground mb-6">
                Get started by adding workers to the system
              </p>
              <Button onClick={() => setIsAddWorkerOpen(true)} size="lg">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Your First Worker
              </Button>
            </div>
          </Card>
        )}
      </div>

      <AddWorkerDialog
        open={isAddWorkerOpen}
        onOpenChange={setIsAddWorkerOpen}
        onAddWorker={addWorker}
      />

      <Toaster />
    </div>
  )
}
