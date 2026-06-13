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
  ScenePackagePreview,
  ScenePackage,
  ScenePackageReplayResult,
  ReplayMode,
  ConflictDetail,
  ImportSession,
  UndoSnapshot,
  UndoImpactPreview,
  ApplyUndoResult,
  ConflictChoice,
} from '../types'
import { DEFAULT_THRESHOLD, validateThresholdConfig } from '../utils/validator'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from '../utils/anomalyDetector'
import { mergeEvents } from '../utils/eventMerger'
import { generateId } from '../utils/csvParser'
import { replayScenePackage, analyzeReplayConflicts } from '../utils/scenePackage'
import {
  createSessionForImport,
  createSessionForReplay,
  createUndoSnapshot,
  previewUndoImpact,
  applyUndo,
  findLatestUndoableSession,
} from '../utils/importSession'

interface AppState {
  threshold: ThresholdConfig
  sensorRecords: SensorRecord[]
  manualNotes: ManualNote[]
  alarmRecords: AlarmRecord[]
  evidences: Evidence[]
  events: Event[]
  importBatches: ImportBatch[]
  importSessions: ImportSession[]
  undoSnapshots: UndoSnapshot[]
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

  applyScenePackage: (preview: ScenePackagePreview, conflictChoices?: ConflictChoice[]) => {
    batches: ImportBatch[]
    newEvents: number
    totalRecords: number
    conflicts: ConflictDetail[]
    affectedEventIds: string[]
    resolutionSummary: string
    session: ImportSession
    sessionId: string
  }
  replayScenePackageData: (
    pkg: ScenePackage,
    mode: ReplayMode,
    conflictChoices?: ConflictChoice[]
  ) => ScenePackageReplayResult & { session_id: string }

  getUndoImpactPreview: (sessionId: string) => UndoImpactPreview
  getLatestUndoableSession: () => ImportSession | null
  undoSession: (sessionId: string) => ApplyUndoResult

  analyzeReplayConflictsUI: (pkg: ScenePackage) => ReturnType<typeof analyzeReplayConflicts>

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
  importSessions: ImportSession[]
  undoSnapshots: UndoSnapshot[]
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
      importSessions: state.importSessions || [],
      undoSnapshots: state.undoSnapshots || [],
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
        source_session_ids: bestMatch.source_session_ids,
        source_batch_ids: bestMatch.source_batch_ids,
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

function saveAllState(get: () => AppState) {
  const s = get()
  saveToStorage({
    threshold: s.threshold,
    sensorRecords: s.sensorRecords,
    manualNotes: s.manualNotes,
    alarmRecords: s.alarmRecords,
    evidences: s.evidences,
    events: s.events,
    importBatches: s.importBatches,
    importSessions: s.importSessions,
    undoSnapshots: s.undoSnapshots,
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  threshold: persisted.threshold || DEFAULT_THRESHOLD,
  sensorRecords: persisted.sensorRecords || [],
  manualNotes: persisted.manualNotes || [],
  alarmRecords: persisted.alarmRecords || [],
  evidences: persisted.evidences || [],
  events: persisted.events || [],
  importBatches: persisted.importBatches || [],
  importSessions: persisted.importSessions || [],
  undoSnapshots: persisted.undoSnapshots || [],
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

    saveAllState(get)

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

    saveAllState(get)

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

    saveAllState(get)

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

    saveAllState(get)

    get().addToast('success', `导入完成，共 ${records.length} 条告警`)
  },

  applyScenePackage: (preview, conflictChoices) => {
    const state = get()

    const preSnapshot = createUndoSnapshot({
      session_id: preview.package_id,
      threshold: state.threshold,
      sensorRecords: state.sensorRecords,
      manualNotes: state.manualNotes,
      alarmRecords: state.alarmRecords,
      events: state.events,
      evidences: state.evidences,
      importBatches: state.importBatches,
      importSessions: state.importSessions,
    })

    const now = new Date().toISOString()
    const rawBatches: ImportBatch[] = []

    const batchConflicts = preview.conflicts.filter(c => c.conflict_type === 'batch_duplicate')
    const sameDeviceConflicts = preview.conflicts.filter(c => c.conflict_type === 'same_device_time')

    const affectedEventIds: string[] = []
    for (const oldEv of state.events) {
      for (const newEv of preview._sensorRecords
        .concat(preview._noteRecords as any[])
        .concat(preview._alarmRecords as any[])) {
        if (oldEv.device_id === (newEv as any).device_id) {
          const oldStart = new Date(oldEv.start_time).getTime()
          const oldEnd = new Date(oldEv.end_time).getTime()
          const ts = new Date((newEv as any).timestamp).getTime()
          if (ts >= oldStart && ts <= oldEnd) {
            affectedEventIds.push(oldEv.id)
            break
          }
        }
      }
    }

    const resolutionParts: string[] = []
    if (batchConflicts.length > 0) {
      resolutionParts.push(`${batchConflicts.length} 个重复批次已跳过`)
    }
    if (sameDeviceConflicts.length > 0) {
      resolutionParts.push(`${sameDeviceConflicts.length} 处同设备同时间冲突已记录（数据正常写入）`)
    }

    for (const fp of preview.files) {
      if (fp.is_duplicate) continue
      const batch: ImportBatch = {
        id: preview.package_id + '-' + fp.file_type,
        file_type: fp.file_type,
        file_name: fp.file_name,
        import_time: now,
        record_count: fp.valid_count,
        error_count: fp.error_count,
        errors: fp.errors,
        file_hash: fp.file_hash,
        conflicts: preview.conflicts.length > 0 ? preview.conflicts : undefined,
        resolution_summary: resolutionParts.length > 0 ? resolutionParts.join('；') : '无冲突，全部正常导入',
        affected_event_ids: affectedEventIds.length > 0 ? affectedEventIds : undefined,
      }
      rawBatches.push(batch)
    }

    const eventsBefore = [...state.events]

    const newSensorRecords = [...state.sensorRecords, ...preview._sensorRecords]
    const newManualNotes = [...state.manualNotes, ...preview._noteRecords]
    const newAlarmRecords = [...state.alarmRecords, ...preview._alarmRecords]
    const newImportBatches = [...state.importBatches, ...rawBatches]

    const result = regenerateAll(
      newSensorRecords,
      newManualNotes,
      newAlarmRecords,
      state.threshold,
      state.events
    )

    const sessionResult = createSessionForImport({
      preview,
      thresholdBefore: state.threshold,
      thresholdAfter: state.threshold,
      batches: rawBatches,
      newSensorRecords: preview._sensorRecords,
      newNoteRecords: preview._noteRecords,
      newAlarmRecords: preview._alarmRecords,
      eventsBefore,
      eventsAfter: result.events,
      conflictChoices,
    })

    preSnapshot.session_id = sessionResult.session.id

    const newEventsWithSource = result.events.map(ev => {
      const sr = sessionResult.session.new_event_ids.includes(ev.id)
        || sessionResult.session.merged_event_ids.includes(ev.id)
        || sessionResult.session.overwritten_event_ids.includes(ev.id)
      if (!sr) return ev
      const srcSessions = Array.from(new Set([...(ev.source_session_ids || []), sessionResult.session.id]))
      const srcBatches = Array.from(new Set([...(ev.source_batch_ids || []), ...sessionResult.session.batch_ids]))
      return { ...ev, source_session_ids: srcSessions, source_batch_ids: srcBatches }
    })

    if (preview.new_events_count > 0) {
      resolutionParts.push(`新增 ${preview.new_events_count} 个事件`)
    }
    if (preview.merged_events_count > 0) {
      resolutionParts.push(`合并 ${preview.merged_events_count} 个事件`)
    }
    const resolutionSummary = resolutionParts.length > 0
      ? resolutionParts.join('；')
      : '无冲突，全部正常导入'

    set({
      sensorRecords: sessionResult.batchedRecords.sensor.length > 0
        ? [...state.sensorRecords, ...sessionResult.batchedRecords.sensor]
        : newSensorRecords,
      manualNotes: sessionResult.batchedRecords.notes.length > 0
        ? [...state.manualNotes, ...sessionResult.batchedRecords.notes]
        : newManualNotes,
      alarmRecords: sessionResult.batchedRecords.alarms.length > 0
        ? [...state.alarmRecords, ...sessionResult.batchedRecords.alarms]
        : newAlarmRecords,
      importBatches: [...state.importBatches, ...sessionResult.batchesWithSession],
      events: newEventsWithSource,
      evidences: result.evidences.map(e => ({
        ...e,
        session_id: sessionResult.session.id,
      })),
      importSessions: [...state.importSessions, sessionResult.session],
      undoSnapshots: [...state.undoSnapshots, preSnapshot],
    })

    saveAllState(get)

    const totalRecords = preview._sensorRecords.length + preview._noteRecords.length + preview._alarmRecords.length
    const newEventCount = newEventsWithSource.length - eventsBefore.length
    get().addToast(
      'success',
      `场景包导入完成: ${totalRecords} 条记录, ${Math.max(0, newEventCount)} 个新事件, ${sessionResult.batchesWithSession.length} 个批次 (会话 ${sessionResult.session.id.slice(0, 8)})`
    )

    return {
      batches: sessionResult.batchesWithSession,
      newEvents: Math.max(0, newEventCount),
      totalRecords,
      conflicts: preview.conflicts,
      affectedEventIds,
      resolutionSummary,
      session: sessionResult.session,
      sessionId: sessionResult.session.id,
    }
  },

  replayScenePackageData: (pkg, mode, conflictChoices) => {
    const state = get()

    const replayThreshold = validateThresholdConfig(pkg.threshold).valid ? pkg.threshold : { ...DEFAULT_THRESHOLD }

    const preSnapshot = createUndoSnapshot({
      session_id: `replay_${Date.now()}`,
      threshold: state.threshold,
      sensorRecords: state.sensorRecords,
      manualNotes: state.manualNotes,
      alarmRecords: state.alarmRecords,
      events: state.events,
      evidences: state.evidences,
      importBatches: state.importBatches,
      importSessions: state.importSessions,
    })

    const eventsBefore = [...state.events]

    const replay = replayScenePackage(
      pkg,
      mode,
      state.sensorRecords,
      state.manualNotes,
      state.alarmRecords,
      state.importBatches,
      state.events,
      state.evidences
    )

    let finalEvents = replay.events
    let finalEvidences = replay.evidences
    let finalThreshold = replay.threshold

    if (mode !== 'overwrite') {
      const regen = regenerateAll(
        replay.sensorRecords,
        replay.manualNotes,
        replay.alarmRecords,
        replay.threshold,
        replay.events
      )
      finalEvents = regen.events
      finalEvidences = regen.evidences
    }

    const replayBatchId = generateId() + '-replay'
    const modeText: Record<ReplayMode, string> = {
      overwrite: '覆盖',
      merge: '合并',
      skip: '跳过',
    }

    const affectedEventIds: string[] = []
    if (mode === 'merge') {
      for (const oldEv of state.events) {
        for (const newEv of replay.result.imported_batches.length > 0 ? pkg.events : []) {
          if (oldEv.device_id === newEv.device_id && oldEv.id === newEv.id) {
            affectedEventIds.push(oldEv.id)
            break
          }
        }
      }
    } else if (mode === 'overwrite') {
      affectedEventIds.push(...state.events.map(e => e.id))
    }

    const resolutionParts: string[] = []
    if (replay.result.skipped_batches > 0) {
      resolutionParts.push(`${replay.result.skipped_batches} 个重复批次已跳过`)
    }
    if (replay.result.skipped_events > 0) {
      resolutionParts.push(`${replay.result.skipped_events} 个重复事件已跳过`)
    }
    if (replay.result.merged_events > 0) {
      resolutionParts.push(`${replay.result.merged_events} 个事件已合并`)
    }
    if (replay.result.overwritten_events > 0) {
      resolutionParts.push(`${replay.result.overwritten_events} 个事件已覆盖`)
    }
    if (replay.result.errors.length > 0) {
      resolutionParts.push(`${replay.result.errors.length} 条提示信息`)
    }

    const conflicts: ConflictDetail[] = []
    for (const batch of pkg.import_batches) {
      if (state.importBatches.some(b => b.file_hash === batch.file_hash)) {
        conflicts.push({
          device_id: '',
          timestamp: '',
          existing_source: '已导入批次',
          new_source: batch.file_name,
          conflict_type: 'batch_duplicate',
          description: `批次 ${batch.file_name} 已存在`,
        })
      }
    }

    const replayBatch: ImportBatch = {
      id: replayBatchId,
      file_type: 'sensor',
      file_name: `回放-${modeText[mode]}-${new Date().toLocaleString('zh-CN')}`,
      import_time: new Date().toISOString(),
      record_count: replay.result.imported_batches.reduce((s, b) => s + b.record_count, 0),
      error_count: replay.result.errors.length,
      errors: replay.result.errors.map((msg, i) => ({ row: 0, field: 'replay', value: '', message: msg })),
      file_hash: `replay-${mode}-${pkg.exported_at}`,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      replay_mode: mode,
      resolution_summary: resolutionParts.length > 0 ? resolutionParts.join('；') : `${modeText[mode]}回放成功，无冲突`,
      affected_event_ids: affectedEventIds.length > 0 ? affectedEventIds : undefined,
    }

    const newBatches = [...replay.batches, replayBatch]

    const newSensorCount = replay.sensorRecords.length - state.sensorRecords.length
    const newNoteCount = replay.manualNotes.length - state.manualNotes.length
    const newAlarmCount = replay.alarmRecords.length - state.alarmRecords.length

    const sessionCreator = createSessionForReplay({
      actionType: 'replay',
      replayMode: mode,
      packageId: `pkg_${pkg.exported_at}`,
      thresholdBefore: state.threshold,
      thresholdAfter: replayThreshold,
      batches: newBatches,
      eventsBefore,
      eventsAfter: finalEvents,
      newSensorCount: Math.max(0, newSensorCount),
      newNoteCount: Math.max(0, newNoteCount),
      newAlarmCount: Math.max(0, newAlarmCount),
      skippedBatches: replay.result.skipped_batches,
      skippedEvents: replay.result.skipped_events,
      mergedEvents: replay.result.merged_events,
      overwrittenEvents: replay.result.overwritten_events,
      conflictChoices,
    })

    preSnapshot.session_id = sessionCreator.session.id

    const finalEventsWithSource = finalEvents.map(ev => {
      const isNew = sessionCreator.session.new_event_ids.includes(ev.id)
      if (!isNew && mode !== 'overwrite') return ev
      const pkgSessions = pkg.import_sessions?.map(s => s.id) || []
      const srcSessions = Array.from(new Set([...(ev.source_session_ids || []), sessionCreator.session.id, ...pkgSessions]))
      const srcBatches = Array.from(new Set([...(ev.source_batch_ids || []), ...sessionCreator.session.batch_ids]))
      return { ...ev, source_session_ids: srcSessions, source_batch_ids: srcBatches }
    })

    const mergedPkgSessions = pkg.import_sessions || []
    const sessionIdMap = new Map<string, string>()
    const mergedSessions = [...state.importSessions]
    for (const pkgSession of mergedPkgSessions) {
      const localMatch = mergedSessions.find(s =>
        s.package_id === pkgSession.package_id &&
        s.action_type === pkgSession.action_type &&
        Math.abs(new Date(s.created_at).getTime() - new Date(pkgSession.created_at).getTime()) < 1000
      )
      if (!localMatch) {
        const newId = 'sess_imported_' + pkgSession.id
        sessionIdMap.set(pkgSession.id, newId)
        mergedSessions.push({
          ...pkgSession,
          id: newId,
          batch_ids: pkgSession.batch_ids.map(bid => sessionIdMap.get(bid) || bid),
        })
      } else {
        sessionIdMap.set(pkgSession.id, localMatch.id)
      }
    }

    set({
      threshold: finalThreshold,
      sensorRecords: replay.sensorRecords,
      manualNotes: replay.manualNotes,
      alarmRecords: replay.alarmRecords,
      importBatches: sessionCreator.batchesWithSession,
      events: finalEventsWithSource,
      evidences: finalEvidences,
      importSessions: [...mergedSessions, sessionCreator.session],
      undoSnapshots: [...state.undoSnapshots, preSnapshot],
    })

    saveAllState(get)

    get().addToast(
      replay.result.errors.length > 0 ? 'warning' : 'success',
      `场景包回放(${modeText[mode]})完成: ${replay.result.imported_batches.length} 批次导入, ${replay.result.errors.length} 条提示 (会话 ${sessionCreator.session.id.slice(0, 8)})`
    )

    return {
      ...replay.result,
      replay_batch: replayBatch,
      resolution_summary: replayBatch.resolution_summary,
      session_id: sessionCreator.session.id,
      applied_choices: conflictChoices,
    }
  },

  getUndoImpactPreview: (sessionId) => {
    const state = get()
    return previewUndoImpact(
      sessionId,
      state.importSessions,
      state.undoSnapshots,
      state.threshold
    )
  },

  getLatestUndoableSession: () => {
    return findLatestUndoableSession(get().importSessions)
  },

  undoSession: (sessionId) => {
    const state = get()
    const undoResult = applyUndo(
      sessionId,
      state.importSessions,
      state.undoSnapshots,
      state.sensorRecords,
      state.manualNotes,
      state.alarmRecords,
      state.events,
      state.evidences,
      state.importBatches,
      state.threshold
    )

    if (!undoResult.result.success) {
      get().addToast('error', `撤销失败: ${undoResult.result.reason}`)
      return undoResult.result
    }

    set({
      sensorRecords: undoResult.new_sensor_records,
      manualNotes: undoResult.new_manual_notes,
      alarmRecords: undoResult.new_alarm_records,
      events: undoResult.new_events,
      evidences: undoResult.new_evidences,
      importBatches: undoResult.new_batches,
      threshold: undoResult.new_threshold,
      importSessions: undoResult.new_sessions,
    })

    saveAllState(get)

    const summary = `撤销会话 ${sessionId.slice(0, 10)}...：恢复 ${undoResult.result.restored_event_count} 事件/${undoResult.result.restored_batch_count} 批次`
    get().addToast('success', summary)

    return undoResult.result
  },

  analyzeReplayConflictsUI: (pkg) => {
    const state = get()
    return analyzeReplayConflicts(
      pkg,
      state.sensorRecords,
      state.manualNotes,
      state.alarmRecords,
      state.importBatches,
      state.threshold,
      state.importSessions
    )
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
    saveAllState(get)

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
    saveAllState(get)
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
    saveAllState(get)

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
      importSessions: [],
      undoSnapshots: [],
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
      importSessions: [],
      undoSnapshots: [],
    })
    get().addToast('info', '所有数据已清除')
  },
}))
