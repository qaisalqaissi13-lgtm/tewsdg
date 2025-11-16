'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Clock, Coffee, AlertCircle, CheckCircle, LogOut, Users, Timer } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { createClient } from '@/lib/supabase/client'
import type { Worker, BreakHistory, BreakRequest } from '@/lib/types'

export default function WorkerPortalPage() {
  const [workerName, setWorkerName] = useState('')
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const [availableWorkers, setAvailableWorkers] = useState<Worker[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [totalMinutes, setTotalMinutes] = useState(0)
  const [totalBreaks, setTotalBreaks] = useState(0)
  const [breakHistory, setBreakHistory] = useState<BreakHistory[]>([])
  const [currentRequest, setCurrentRequest] = useState<BreakRequest | null>(null)
  const [breakTimer, setBreakTimer] = useState(0)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [queueLength, setQueueLength] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [isRequestPending, setIsRequestPending] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    const cachedMinutes = localStorage.getItem('cached_total_minutes')
    if (cachedMinutes) {
      setTotalMinutes(parseInt(cachedMinutes))
    }
  }, [])

  useEffect(() => {
    const savedWorkerId = localStorage.getItem('worker_id')
    if (savedWorkerId) {
      loadWorkerById(savedWorkerId)
    }
  }, [])

  const loadWorkerById = async (workerId: string) => {
    const { data } = await supabase
      .from('workers')
      .select('*')
      .eq('id', workerId)
      .single()
    
    if (data) {
      setSelectedWorker(data)
      setIsLoggedIn(true)
    } else {
      localStorage.removeItem('worker_id')
    }
  }

  useEffect(() => {
    loadWorkers()
  }, [])

  useEffect(() => {
    if (selectedWorker) {
      loadWorkerStats()
      loadCurrentRequest()
      
      // Monitor THIS worker's specific requests with detailed logging
      const requestsSubscription = supabase
        .channel(`worker_requests_${selectedWorker.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'break_requests',
          filter: `worker_id=eq.${selectedWorker.id}`
        }, (payload) => {
          const newRequest = payload.new as BreakRequest
          const oldRequest = payload.old as BreakRequest
          
          // Instant detection of new request creation
          if (payload.eventType === 'INSERT' && newRequest?.status === 'pending') {
            setCurrentRequest(newRequest)
            setIsRequestPending(false)
            playNotificationSound()
            showBrowserNotification('Request Submitted!', 'Your break request has been sent to your supervisor.')
          }
          
          // Break approved notification
          if (newRequest?.status === 'approved' && oldRequest?.status === 'pending') {
            playNotificationSound()
            showBrowserNotification('Break Approved!', 'You have been added to the waiting queue.')
            loadCurrentRequest()
            loadQueuePosition()
          }
          
          // Break started notification
          if (newRequest?.status === 'on_break' && oldRequest?.status === 'approved') {
            playNotificationSound()
            showBrowserNotification('Break Started!', 'Your 15-minute break has begun.')
            loadCurrentRequest()
          }
          
          // Break ended/completed
          if (payload.eventType === 'UPDATE' && newRequest?.status === 'completed') {
            loadCurrentRequest()
            loadWorkerStats()
          }
          
          // Any other status change
          if (payload.eventType === 'UPDATE' && newRequest) {
            loadCurrentRequest()
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
          }
        })

      const historySubscription = supabase
        .channel(`worker_history_${selectedWorker.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'break_history',
          filter: `worker_id=eq.${selectedWorker.id}`
        }, (payload) => {
          loadWorkerStats()
        })
        .subscribe()

      const globalHistorySubscription = supabase
        .channel('global_history_reset')
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'break_history'
        }, () => {
          localStorage.removeItem('cached_total_minutes')
          Promise.all([
            loadWorkerStats(),
            loadCurrentRequest()
          ])
          playNotificationSound()
          showBrowserNotification('Break Time Reset', 'Your break time has been reset to 60 minutes.')
          toast({
            title: 'Break Time Reset',
            description: 'Your break time has been reset to 60 minutes.',
          })
        })
        .subscribe()

      const allRequestsSubscription = supabase
        .channel('all_requests_monitoring')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'break_requests'
        }, (payload) => {
          if (currentRequest?.status === 'approved') {
            loadQueuePosition()
          }
        })
        .subscribe()

      return () => {
        requestsSubscription.unsubscribe()
        historySubscription.unsubscribe()
        globalHistorySubscription.unsubscribe()
        allRequestsSubscription.unsubscribe()
        setIsConnected(false)
      }
    }
  }, [selectedWorker, currentRequest?.status])

  useEffect(() => {
    if (currentRequest?.status === 'on_break' && currentRequest.started_at) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - new Date(currentRequest.started_at!).getTime()) / 1000)
        setBreakTimer(elapsed)
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [currentRequest])

  useEffect(() => {
    if (currentRequest?.status === 'approved') {
      loadQueuePosition()
      const interval = setInterval(loadQueuePosition, 5000)
      return () => clearInterval(interval)
    }
  }, [currentRequest])

  useEffect(() => {
    if (queuePosition === 1 && currentRequest?.status === 'approved') {
      playNotificationSound()
      showBrowserNotification("You're Next!", 'Get ready - your break will start soon!')
    }
  }, [queuePosition])

  const loadWorkers = async () => {
    const { data } = await supabase
      .from('workers')
      .select('*')
      .order('name')
    
    setAvailableWorkers(data || [])
  }

  const loadCurrentRequest = async () => {
    if (!selectedWorker) return

    const { data } = await supabase
      .from('break_requests')
      .select('*')
      .eq('worker_id', selectedWorker.id)
      .in('status', ['pending', 'approved', 'on_break'])
      .order('requested_at', { ascending: false })
      .limit(1)
    
    const request = data?.[0] || null
    
    if (request?.status === 'approved' && currentRequest?.status === 'pending') {
      toast({
        title: 'Break Approved!',
        description: 'You have been added to the waiting queue.',
      })
    }

    if (request?.status === 'on_break' && currentRequest?.status === 'approved') {
      toast({
        title: 'Break Started!',
        description: 'Your 15-minute break has begun. Enjoy!',
      })
    }
    
    if (!request && currentRequest) {
      await loadWorkerStats()
      toast({
        title: 'Break Ended',
        description: `Your break has ended. You have ${60 - totalMinutes} minutes remaining today.`,
      })
    }

    setCurrentRequest(request)
    setIsRequestPending(false)
  }

  const loadQueuePosition = async () => {
    if (!selectedWorker || !currentRequest) return

    const { data } = await supabase
      .from('break_requests')
      .select('id, approved_at')
      .eq('status', 'approved')
      .order('approved_at', { ascending: true })
    
    if (data) {
      const position = data.findIndex(r => r.id === currentRequest.id) + 1
      setQueuePosition(position)
      setQueueLength(data.length)
    }
  }

  const loadWorkerStats = async () => {
    if (!selectedWorker) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    const { data: historyData } = await supabase
      .from('break_history')
      .select('*')
      .eq('worker_id', selectedWorker.id)
      .gte('started_at', todayISO)
      .order('started_at', { ascending: false })
    
    const history = historyData || []
    const total = history.reduce((sum, b) => sum + b.duration_minutes, 0)
    
    setBreakHistory(history)
    setTotalBreaks(history.length)
    setTotalMinutes(total)
    localStorage.setItem('cached_total_minutes', total.toString())
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const worker = availableWorkers.find(w => 
      w.name.toLowerCase() === workerName.toLowerCase()
    )
    
    if (worker) {
      setSelectedWorker(worker)
      setIsLoggedIn(true)
      localStorage.setItem('worker_id', worker.id)
      toast({
        title: 'Welcome!',
        description: `Hello, ${worker.name}!`,
      })
    } else {
      toast({
        title: 'Worker Not Found',
        description: 'Please check your name or contact your supervisor',
        variant: 'destructive',
      })
    }
  }

  const handleRequestBreak = async () => {
    if (!selectedWorker) return

    if (totalMinutes >= 60) {
      toast({
        title: 'Break Not Allowed',
        description: 'You have used all 60 minutes of break time today',
        variant: 'destructive',
      })
      return
    }

    setIsRequestPending(true)
    
    const optimisticRequest: BreakRequest = {
      id: 'temp-' + Date.now(),
      worker_id: selectedWorker.id,
      status: 'pending',
      requested_at: new Date().toISOString(),
      approved_at: null,
      started_at: null,
      ended_at: null,
      is_paused: false,
      elapsed_seconds: 0,
      remaining_seconds: 900
    }
    
    // Instantly show pending request in UI before database confirms
    setCurrentRequest(optimisticRequest)

    // Show instant visual feedback
    toast({
      title: 'Submitting Request...',
      description: 'Sending break request to supervisor.',
    })

    const { data, error } = await supabase
      .from('break_requests')
      .insert({
        worker_id: selectedWorker.id,
        status: 'pending'
      })
      .select()
      .single()
    
    if (error) {
      // Revert optimistic update on error
      setCurrentRequest(null)
      setIsRequestPending(false)
      toast({
        title: 'Error',
        description: 'Failed to submit break request. Please try again.',
        variant: 'destructive',
      })
      return
    }

    if (data) {
      setCurrentRequest(data as BreakRequest)
      setIsRequestPending(false)
      
      // Visual and audio confirmation
      playNotificationSound()
      toast({
        title: 'Request Submitted! ✓',
        description: 'Your supervisor has been notified. You will be alerted when approved.',
      })
    }
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setSelectedWorker(null)
    setWorkerName('')
    setTotalMinutes(0)
    setTotalBreaks(0)
    setBreakHistory([])
    setCurrentRequest(null)
    setQueuePosition(null)
    localStorage.removeItem('worker_id')
    localStorage.removeItem('cached_total_minutes')
  }

  const remainingMinutes = Math.max(0, 60 - totalMinutes)
  const canRequest = remainingMinutes > 0 && !currentRequest && !isRequestPending
  
  const getRemainingTimeColor = () => {
    if (remainingMinutes === 0) return 'bg-destructive/10 text-destructive'
    if (remainingMinutes <= 15) return 'bg-warning/10 text-warning'
    return 'bg-success/10 text-success'
  }

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const remainingBreakTime = Math.max(0, 900 - breakTimer)

  const playNotificationSound = () => {
    if (!audioEnabled) return
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    oscillator.frequency.value = 800
    oscillator.type = 'sine'
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
    
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
  }

  const showBrowserNotification = (title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      })
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission()
      }
    }
  }, [])

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Coffee className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Worker Portal</h1>
            <p className="text-muted-foreground">Request and manage your breaks</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="worker-name">Your Name</Label>
              <Input
                id="worker-name"
                type="text"
                placeholder="Enter your name"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={!workerName.trim()}>
              Continue
            </Button>
          </form>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">Welcome, {selectedWorker?.name}</h1>
            <p className="text-muted-foreground">
              {remainingMinutes} minutes of break time remaining today
              {isConnected && (
                <Badge variant="outline" className="ml-2 text-xs">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
                  Live
                </Badge>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setAudioEnabled(!audioEnabled)}
              title={audioEnabled ? 'Disable sound' : 'Enable sound'}
            >
              {audioEnabled ? '🔔' : '🔕'}
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        {currentRequest?.status === 'approved' && queuePosition && (
          <Card className={`p-6 border-2 ${queuePosition === 1 ? 'border-success animate-pulse' : 'border-warning'}`}>
            <div className="flex items-center gap-4">
              <div className={`h-16 w-16 rounded-full flex items-center justify-center ${
                queuePosition === 1 ? 'bg-success/20' : 'bg-warning/10'
              }`}>
                <Users className={`h-8 w-8 ${queuePosition === 1 ? 'text-success' : 'text-warning'}`} />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-1">
                  {queuePosition === 1 ? "You're Next! 🎉" : 'In Waiting Queue'}
                </h3>
                <p className="text-muted-foreground">
                  {queuePosition === 1 
                    ? "Get ready - your break will start soon!"
                    : `${queuePosition - 1} ${queuePosition - 1 === 1 ? 'person' : 'people'} ahead of you`}
                </p>
              </div>
              <div className="text-center">
                <div className={`text-4xl font-bold ${queuePosition === 1 ? 'text-success' : 'text-warning'}`}>
                  {queuePosition}
                </div>
                <div className="text-xs text-muted-foreground">of {queueLength}</div>
              </div>
            </div>
          </Card>
        )}

        {currentRequest?.status === 'on_break' && (
          <Card className="p-8 border-2 border-primary">
            <div className="text-center">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Timer className="h-12 w-12 text-primary animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold mb-2">You're on Break!</h2>
              <div className="text-5xl font-mono font-bold text-primary mb-2">
                {formatTimer(remainingBreakTime)}
              </div>
              <p className="text-muted-foreground mb-4">Time remaining</p>
              <Badge variant="secondary" className="text-lg px-4 py-2">
                {Math.ceil((totalMinutes + (breakTimer / 60)))} / 60 minutes used today
              </Badge>
            </div>
          </Card>
        )}

        {currentRequest?.status === 'pending' && (
          <Card className="p-6 border-2 border-blue-500">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Clock className="h-8 w-8 text-blue-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-1">Request Pending</h3>
                <p className="text-muted-foreground">
                  Waiting for supervisor approval...
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Breaks Today</p>
                <p className="text-3xl font-bold">{totalBreaks}</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Coffee className="h-6 w-6 text-primary" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Time Used</p>
                <p className="text-3xl font-bold">{totalMinutes}m</p>
                <p className="text-xs text-muted-foreground mt-1">of 60 minutes</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Time Remaining</p>
                <p className={`text-3xl font-bold ${
                  remainingMinutes === 0 ? 'text-destructive' : 
                  remainingMinutes <= 15 ? 'text-warning' : 
                  'text-success'
                }`}>
                  {remainingMinutes}m
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {remainingMinutes === 0 ? 'No time left' : 'Available for breaks'}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${getRemainingTimeColor()}`}>
                {remainingMinutes > 0 ? (
                  <CheckCircle className="h-6 w-6" />
                ) : (
                  <AlertCircle className="h-6 w-6" />
                )}
              </div>
            </div>
          </Card>
        </div>

        {!currentRequest && (
          <Card className="p-8">
            <div className="text-center max-w-md mx-auto">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Coffee className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Request a Break</h2>
              <p className="text-muted-foreground mb-6">
                {canRequest 
                  ? 'Each break is 15 minutes. You have a total of 60 minutes available per day.'
                  : 'You have used all your break time for today.'}
              </p>

              {canRequest && (
                <div className="bg-muted p-4 rounded-lg mb-6">
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Break duration: <strong>15 minutes</strong>
                    </span>
                  </div>
                </div>
              )}

              <Button
                size="lg"
                className="w-full"
                onClick={handleRequestBreak}
                disabled={!canRequest || isRequestPending}
              >
                {isRequestPending ? 'Submitting...' : 'Request Break'}
              </Button>
            </div>
          </Card>
        )}

        {breakHistory.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Break History</h3>
            <div className="space-y-3">
              {breakHistory.map((breakRecord) => (
                <div
                  key={breakRecord.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(breakRecord.started_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">{breakRecord.duration_minutes} minutes</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <Toaster />
    </div>
  )
}
