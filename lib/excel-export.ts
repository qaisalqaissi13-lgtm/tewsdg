import type { Worker, BreakHistory } from './types'

export function exportToExcel(workers: Worker[], breakHistory: BreakHistory[]): void {
  // Create CSV content
  let csvContent = 'Worker Name,Total Breaks,Total Minutes,Break Details\n'
  
  workers.forEach(worker => {
    const workerBreaks = breakHistory.filter(b => b.worker_id === worker.id)
    const totalBreaks = workerBreaks.length
    const totalMinutes = workerBreaks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0)
    
    const breakDetails = workerBreaks
      .map(b => {
        const date = new Date(b.started_at).toLocaleString()
        return `${date} (${b.duration_minutes}min)`
      })
      .join('; ')
    
    csvContent += `"${worker.name}",${totalBreaks},${totalMinutes},"${breakDetails}"\n`
  })
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', `break-report-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
