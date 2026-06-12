import { create } from 'zustand'
import {
  ThresholdConfig,
  SensorRecord,
  ManualNote,
  AlarmRecord,
  Evidence,
  Event,
  ImportBatch,
  EventStatus,
  ToastMessage,
} from '../types'
import { DEFAULT_THRESHOLD, validateThresholdConfig } from '../utils/validator'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from '../utils/anomalyDetector'
import { mergeEvents } from '../utils/eventMerger'
import { generateId } from '../utils/csvParser'

interface AppState {
  threshold: ThresholdConfig
  sensorRecords: SensorRecord[]
  manualNotes: ManualNote[]
  alarmRecords: AlarmRecord[]
  evidences: Evidence[]
  events: Event[]
  importBatches: ImportBatch[]
  selectedEventId: string | null
  toasts: ToastMessage[]

  setThreshold: (config: ThresholdConfig) => {
    valid: boolean
    errors: Array<{ field: string; message: string; value: string }>
  }
  addSensorRecords: (
    records: SensorRecord[],
    batchId: string,
    batchInfo: Omit<ImportBatch, 'id' | 'import_time'>
  ) => void
  addManualNotes: (
    notes: ManualNote[],
    batchId: string,
    batchInfo: Omit<ImportBatch, 'id' | 'import_time'>
  ) => void
  addAlarmRecords: (
    records: AlarmRecord[],
    batchId: string,
    batchInfo: Omit<ImportBatch, 'id' | 'import_time'>
  ) => void
  hasBatch: (fileHash: string) => boolean

  selectEvent: (eventId: string | null) => void
  updateEventStatus: (eventId: string, status: EventStatus, handler: string) => void
  updateEventRemark: (eventId: string, remark: string) => void
  closeEvent: (eventId: string, handler: string) => void

  addToast: (type: ToastMessage['type'], message: string) => void
  removeToast: (id: string) => void

  getEventEvidences: (eventId: string) => Evidence[]
  getDeviceIds: () => string[]

  clearAllData: () => void
}

const STORAGE_KEY = 'inspection_dashboard_data'

interface PersistedData {
  threshold: ThresholdConfig
  sensorRecords: SensorRecord[]
  manualNotes: ManualNote[]
  alarmRecords: AlarmRecord[]
  evidences: Evidence[]
  events: Event[]
  importBatches: ImportBatch[]
}

function loadFromStorage(): Partial<PersistedData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e)
  }
  return {}
}

function saveToStorage(state: Partial<PersistedData>) {
  try {
    const data: PersistedData = {
      threshold: state.threshold || DEFAULT_THRESHOLD,
      sensorRecords: state.sensorRecords || [],
      manualNotes: state.manualNotes || [],
      alarmRecords: state.alarmRecords || [],
      evidences: state.evidences || [],
      events: state.events || [],
      importBatches: state.importBatches || [],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('Failed to save to localStorage:', e)
  }
}

const persisted = loadFromStorage()

function migrateEventStates(oldEvents: Event[], newEvents: Event[]): Event[] {
  const nonPendingOldEvents = oldEvents.filter((e) => e.status !== 'pending')

  if (nonPendingOldEvents.length === 0) {
    return newEvents
  }

  return newEvents.map((newEvent) => {
    const newStart = new Date(newEvent.start_time).getTime()
    const newEnd = new Date(newEvent.end_time).getTime()

    let bestMatch: Event | null = null
    let bestOverlap = 0

    for (const oldEvent of nonPendingOldEvents) {
      if (oldEvent.device_id !== newEvent.device_id) continue

      const oldStart = new Date(oldEvent.start_time).getTime()
      const oldEnd = new Date(oldEvent.end_time).getTime()

      const overlapStart = Math.max(newStart, oldStart)
      const overlapEnd = Math.min(newEnd, oldEnd)
      const overlap = Math.max(0, overlapEnd - overlapStart)

      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestMatch = oldEvent
      }
    }

    if (bestMatch && bestOverlap > 0) {
      return {
        ...newEvent,
        id: bestMatch.id,
        status: bestMatch.status,
        handler: bestMatch.handler,
        remark: bestMatch.remark,
        close_time: bestMatch.close_time,
        created_at: bestMatch.created_at,
        updated_at: new Date().toISOString(),
      }
    }

    return newEvent
  })
}

function regenerateAll(
  sensorRecords: SensorRecord[],
  manualNotes: ManualNote[],
  alarmRecords: AlarmRecord[],
  threshold: ThresholdConfig,
  existingEvents: Event[]
): { events: Event[]; evidences: Evidence[] } {
  const sensorEvidences = detectSensorAnomalies(sensorRecords, threshold)
  const noteEvidences = notesToEvidence(manualNotes)
  const alarmEvidences = alarmsToEvidence(alarmRecords)

  const allEvidences = [...sensorEvidences, ...noteEvidences, ...alarmEvidences]

  const result = mergeEvents(allEvidences, threshold.merge_window_minutes)

  const eventsWithState = migrateEventStates(existingEvents, result.events)

  const eventIdMap = new Map<string, string>()
  for (let i = 0; i < result.events.length; i++) {
    eventIdMap.set(result.events[i].id, eventsWithState[i].id)
  }

  const evidencesWithCorrectIds = result.evidences.map((ev) => ({
    ...ev,
    event_id: eventIdMap.get(ev.event_id) || ev.event_id,
  }))

  eventsWithState.sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  )

  return { events: eventsWithState, evidences: evidencesWithCorrectIds }
}

export const useAppStore = create<AppState>((set, get) => ({
  threshold: persisted.threshold || DEFAULT_THRESHOLD,
  sensorRecords: persisted.sensorRecords || [],
  manualNotes: persisted.manualNotes || [],
  alarmRecords: persisted.alarmRecords || [],
  evidences: persisted.evidences || [],
  events: persisted.events || [],
  importBatches: persisted.importBatches || [],
  selectedEventId: null,
  toasts: [],

  setThreshold: (config) => {
    const validation = validateThresholdConfig(config)
    if (!validation.valid) {
      return validation
    }

    const state = get()
    const result = regenerateAll(
      state.sensorRecords,
      state.manualNotes,
      state.alarmRecords,
      config,
      state.events
    )

    set({
      threshold: config,
      events: result.events,
      evidences: result.evidences,
    })

    const newState = get()
    saveToStorage({
      threshold: newState.threshold,
      sensorRecords: newState.sensorRecords,
      manualNotes: newState.manualNotes,
      alarmRecords: newState.alarmRecords,
      evidences: newState.evidences,
      events: newState.events,
      importBatches: newState.importBatches,
    })

    const eventCount = result.events.length
    get().addToast('info', `阈值已更新，共分析出 ${eventCount} 个事件`)

    return validation
  },

  hasBatch: (fileHash) => {
    return get().importBatches.some((b) => b.file_hash === fileHash)
  },

  addSensorRecords: (records, batchId, batchInfo) => {
    const state = get()
    const batch: ImportBatch = {
      id: batchId,
      ...batchInfo,
      import_time: new Date().toISOString(),
    }

    const newRecords = [...state.sensorRecords, ...records]
    const newBatches = [...state.importBatches, batch]

    const result = regenerateAll(
      newRecords,
      state.manualNotes,
      state.alarmRecords,
      state.threshold,
      state.events
    )

    set({
      sensorRecords: newRecords,
      importBatches: newBatches,
      events: result.events,
      evidences: result.evidences,
    })

    const newState = get()
    saveToStorage({
      threshold: newState.threshold,
      sensorRecords: newState.sensorRecords,
      manualNotes: newState.manualNotes,
      alarmRecords: newState.alarmRecords,
      evidences: newState.evidences,
      events: newState.events,
      importBatches: newState.importBatches,
    })

    const newEventCount = result.events.length - state.events.length
    if (newEventCount > 0) {
      get().addToast('success', `导入完成，新增 ${newEventCount} 个事件`)
    } else {
      get().addToast('success', `导入完成，共 ${records.length} 条记录`)
    }
  },

  addManualNotes: (notes, batchId, batchInfo) => {
    const state = get()
    const batch: ImportBatch = {
      id: batchId,
      ...batchInfo,
      import_time: new Date().toISOString(),
    }

    const newNotes = [...state.manualNotes, ...notes]
    const newBatches = [...state.importBatches, batch]

    const result = regenerateAll(
      state.sensorRecords,
      newNotes,
      state.alarmRecords,
      state.threshold,
      state.events
    )

    set({
      manualNotes: newNotes,
      importBatches: newBatches,
      events: result.events,
      evidences: result.evidences,
    })

    const newState = get()
    saveToStorage({
      threshold: newState.threshold,
      sensorRecords: newState.sensorRecords,
      manualNotes: newState.manualNotes,
      alarmRecords: newState.alarmRecords,
      evidences: newState.evidences,
      events: newState.events,
      importBatches: newState.importBatches,
    })

    get().addToast('success', `导入完成，共 ${notes.length} 条备注`)
  },

  addAlarmRecords: (records, batchId, batchInfo) => {
    const state = get()
    const batch: ImportBatch = {
      id: batchId,
      ...batchInfo,
      import_time: new Date().toISOString(),
    }

    const newRecords = [...state.alarmRecords, ...records]
    const newBatches = [...state.importBatches, batch]

    const result = regenerateAll(
      state.sensorRecords,
      state.manualNotes,
      newRecords,
      state.threshold,
      state.events
    )

    set({
      alarmRecords: newRecords,
      importBatches: newBatches,
      events: result.events,
      evidences: result.evidences,
    })

    const newState = get()
    saveToStorage({
      threshold: newState.threshold,
      sensorRecords: newState.sensorRecords,
      manualNotes: newState.manualNotes,
      alarmRecords: newState.alarmRecords,
      evidences: newState.evidences,
      events: newState.events,
      importBatches: newState.importBatches,
    })

    get().addToast('success', `导入完成，共 ${records.length} 条告警`)
  },

  selectEvent: (eventId) => set({ selectedEventId: eventId }),

  updateEventStatus: (eventId, status, handler) => {
    const state = get()
    const now = new Date().toISOString()

    const events = state.events.map((e) => {
      if (e.id === eventId) {
        return {
          ...e,
          status,
          handler: handler || e.handler,
          updated_at: now,
          close_time: status === 'closed' ? now : e.close_time,
        }
      }
      return e
    })

    set({ events })

    const newState = get()
    saveToStorage({
      threshold: newState.threshold,
      sensorRecords: newState.sensorRecords,
      manualNotes: newState.manualNotes,
      alarmRecords: newState.alarmRecords,
      evidences: newState.evidences,
      events: newState.events,
      importBatches: newState.importBatches,
    })

    const statusText: Record<EventStatus, string> = {
      pending: '待处理',
      confirmed: '已确认',
      false_alarm: '误报',
      closed: '已关闭',
    }
    get().addToast('success', `事件状态已更新为: ${statusText[status]}`)
  },

  updateEventRemark: (eventId, remark) => {
    const state = get()
    const now = new Date().toISOString()

    const events = state.events.map((e) => {
      if (e.id === eventId) {
        return { ...e, remark, updated_at: now }
      }
      return e
    })

    set({ events })

    const newState = get()
    saveToStorage({
      threshold: newState.threshold,
      sensorRecords: newState.sensorRecords,
      manualNotes: newState.manualNotes,
      alarmRecords: newState.alarmRecords,
      evidences: newState.evidences,
      events: newState.events,
      importBatches: newState.importBatches,
    })
  },

  closeEvent: (eventId, handler) => {
    const state = get()
    const now = new Date().toISOString()

    const events = state.events.map((e) => {
      if (e.id === eventId) {
        return {
          ...e,
          status: 'closed' as EventStatus,
          handler: handler || e.handler,
          close_time: now,
          updated_at: now,
        }
      }
      return e
    })

    set({ events })

    const newState = get()
    saveToStorage({
      threshold: newState.threshold,
      sensorRecords: newState.sensorRecords,
      manualNotes: newState.manualNotes,
      alarmRecords: newState.alarmRecords,
      evidences: newState.evidences,
      events: newState.events,
      importBatches: newState.importBatches,
    })

    get().addToast('success', '事件已关闭')
  },

  addToast: (type, message) => {
    const id = generateId()
    const toast: ToastMessage = { id, type, message }
    set((state) => ({ toasts: [...state.toasts, toast] }))

    setTimeout(() => {
      get().removeToast(id)
    }, 3000)
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  getEventEvidences: (eventId) => {
    return get()
      .evidences.filter((e) => e.event_id === eventId)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
  },

  getDeviceIds: () => {
    const state = get()
    const devices = new Set<string>()
    state.sensorRecords.forEach((r) => devices.add(r.device_id))
    state.manualNotes.forEach((n) => devices.add(n.device_id))
    state.alarmRecords.forEach((a) => devices.add(a.device_id))
    return Array.from(devices).sort()
  },

  clearAllData: () => {
    set({
      sensorRecords: [],
      manualNotes: [],
      alarmRecords: [],
      evidences: [],
      events: [],
      importBatches: [],
      selectedEventId: null,
    })
    saveToStorage({
      threshold: get().threshold,
      sensorRecords: [],
      manualNotes: [],
      alarmRecords: [],
      evidences: [],
      events: [],
      importBatches: [],
    })
    get().addToast('info', '所有数据已清除')
  },
}))
