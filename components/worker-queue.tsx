'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, X, UserMinus, ArrowRight, Pause } from 'lucide-react'
import type { WorkerWithStatus } from '@/app/page'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical } from 'lucide-react'

interface WorkerQueueProps {
  title: string
  description: string
  workers: WorkerWithStatus[]
  type: 'break' | 'queue'
  onEndBreak?: (workerId: string, isPause?: boolean) => void
  onRemoveFromQueue?: (workerId: string) => void
  onRemoveWorker?: (workerId: string) => void
  onSendToBreak?: (workerId: string) => void
}

export function WorkerQueue({
  title,
  description,
  workers,
  type,
  onEndBreak,
  onRemoveFromQueue,
  onRemoveWorker,
  onSendToBreak,
}: WorkerQueueProps) {
  const [currentTime, setCurrentTime] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatElapsedTime = (startTime: number) => {
    const elapsed = Math.floor((currentTime - startTime) / 1000)
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const formatRemainingTime = (remainingSeconds: number) => {
    const minutes = Math.floor(remainingSeconds / 60)
    const seconds = remainingSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const getTimeColor = (startTime: number) => {
    const elapsed = Math.floor((currentTime - startTime) / 1000)
    const minutes = Math.floor(elapsed / 60)
    
    if (minutes >= 20) return 'bg-destructive text-destructive-foreground'
    if (minutes >= 15) return 'bg-warning text-warning-foreground'
    return 'bg-success text-success-foreground'
  }

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="space-y-3">
        {workers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No workers {type === 'break' ? 'on break' : 'in queue'}</p>
          </div>
        ) : (
          workers.map((worker, index) => {
            const remainingMinutes = Math.max(0, 60 - (worker.dailyBreakMinutes || 0))
            const isLowTime = remainingMinutes <= 15
            const isNoTime = remainingMinutes === 0
            
            return (
              <div
                key={worker.id}
                className="flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{worker.name}</p>
                      <Badge 
                        variant={isNoTime ? 'destructive' : isLowTime ? 'secondary' : 'outline'}
                        className="text-xs font-semibold"
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        {remainingMinutes}m left today
                      </Badge>
                      {worker.request?.is_paused && worker.request?.remaining_seconds && (
                        <Badge variant="secondary" className="text-xs font-mono">
                          {formatRemainingTime(worker.request.remaining_seconds)} saved
                        </Badge>
                      )}
                    </div>
                    {type === 'break' && worker.breakStartTime && (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="secondary"
                          className={`${getTimeColor(worker.breakStartTime)} font-mono text-xs`}
                        >
                          {formatElapsedTime(worker.breakStartTime)} elapsed
                        </Badge>
                      </div>
                    )}
                    {type === 'queue' && worker.addedToQueueTime && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground font-mono">
                          Waiting: {formatElapsedTime(worker.addedToQueueTime)} • Position #{index + 1}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {type === 'break' && onEndBreak && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEndBreak(worker.id, true)}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => onEndBreak(worker.id, false)}
                      >
                        End Break
                      </Button>
                    </>
                  )}
                  {type === 'queue' && onSendToBreak && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onSendToBreak(worker.id)}
                      disabled={isNoTime}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" />
                      {isNoTime ? 'No Time Left' : 'Send to Break'}
                    </Button>
                  )}
                  {type === 'queue' && onRemoveFromQueue && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRemoveFromQueue(worker.id)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  )}
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onRemoveWorker?.(worker.id)}
                      >
                        <UserMinus className="h-4 w-4 mr-2" />
                        Remove Worker
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
