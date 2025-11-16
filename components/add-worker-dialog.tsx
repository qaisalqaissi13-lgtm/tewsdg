'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AddWorkerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddWorker: (name: string) => void
}

export function AddWorkerDialog({ open, onOpenChange, onAddWorker }: AddWorkerDialogProps) {
  const [workerNames, setWorkerNames] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const names = workerNames
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0)
    
    names.forEach(name => {
      onAddWorker(name)
    })
    
    setWorkerNames('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Workers</DialogTitle>
          <DialogDescription>
            Enter worker names below. You can add multiple workers by putting each name on a new line.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="worker-names">Worker Names</Label>
              <textarea
                id="worker-names"
                placeholder="John Doe&#10;Jane Smith&#10;Bob Johnson"
                value={workerNames}
                onChange={(e) => setWorkerNames(e.target.value)}
                className="w-full min-h-[120px] px-3 py-2 rounded-md border border-input bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Tip: Press Enter after each name to add multiple workers at once
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setWorkerNames('')
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!workerNames.trim()}>
              Add Worker{workerNames.split('\n').filter(n => n.trim()).length > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
