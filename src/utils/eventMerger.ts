import { Event, Evidence, EventStatus } from '../types'
import { generateId } from './csvParser'

export interface MergeResult {
  events: Event[]
  evidences: Evidence[]
}

export function mergeEvents(
  evidences: Evidence[],
  mergeWindowMinutes: number
): MergeResult {
  const result: MergeResult = {
    events: [],
    evidences: [],
  }
  
  if (evidences.length === 0) return result
  
  const byDevice = new Map<string, Evidence[]>()
  for (const ev of evidences) {
    if (!byDevice.has(ev.device_id)) {
      byDevice.set(ev.device_id, [])
    }
    byDevice.get(ev.device_id)!.push(ev)
  }
  
  const mergeWindowMs = mergeWindowMinutes * 60 * 1000
  
  for (const [deviceId, deviceEvidences] of byDevice) {
    const sorted = [...deviceEvidences].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    
    const windows: Array<{ start: Date; end: Date; evidences: Evidence[] }> = []
    
    for (const ev of sorted) {
      const evTime = new Date(ev.timestamp)
      let placed = false
      
      for (const window of windows) {
        const timeDiff = evTime.getTime() - window.end.getTime()
        
        if (timeDiff <= mergeWindowMs) {
          window.end = evTime
          window.evidences.push(ev)
          placed = true
          break
        }
      }
      
      if (!placed) {
        windows.push({
          start: evTime,
          end: evTime,
          evidences: [ev],
        })
      }
    }
    
    for (const window of windows) {
      const eventId = generateId()
      const now = new Date().toISOString()
      
      const event: Event = {
        id: eventId,
        device_id: deviceId,
        start_time: window.start.toISOString(),
        end_time: window.end.toISOString(),
        status: 'pending' as EventStatus,
        handler: '',
        remark: '',
        close_time: null,
        created_at: now,
        updated_at: now,
        evidence_count: window.evidences.length,
      }
      
      result.events.push(event)
      
      for (const ev of window.evidences) {
        result.evidences.push({
          ...ev,
          event_id: eventId,
        })
      }
    }
  }
  
  result.events.sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  )
  
  return result
}

export function rebuildEvents(
  existingEvents: Event[],
  existingEvidences: Evidence[],
  newEvidences: Evidence[],
  mergeWindowMinutes: number
): MergeResult {
  const pendingEvents = existingEvents.filter(e => e.status === 'pending')
  const nonPendingEvents = existingEvents.filter(e => e.status !== 'pending')
  
  const pendingEventIds = new Set(pendingEvents.map(e => e.id))
  
  const pendingEvidences = existingEvidences.filter(e => pendingEventIds.has(e.event_id))
  const nonPendingEvidences = existingEvidences.filter(e => !pendingEventIds.has(e.event_id))
  
  const allPendingEvidences = [...pendingEvidences, ...newEvidences]
  
  const remerged = mergeEvents(allPendingEvidences, mergeWindowMinutes)
  
  const mergedEvents = remerged.events.map(ev => {
    const existing = existingEvents.find(e => 
      e.device_id === ev.device_id &&
      Math.abs(new Date(e.start_time).getTime() - new Date(ev.start_time).getTime()) < mergeWindowMinutes * 60 * 1000
    )
    
    if (existing && existing.status === 'pending') {
      return {
        ...ev,
        id: existing.id,
        status: existing.status,
        handler: existing.handler,
        remark: existing.remark,
        close_time: existing.close_time,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
      }
    }
    
    return ev
  })
  
  const finalEvents = [...nonPendingEvents, ...mergedEvents]
  const finalEvidences = [...nonPendingEvidences, ...remerged.evidences]
  
  finalEvents.sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  )
  
  return { events: finalEvents, evidences: finalEvidences }
}
