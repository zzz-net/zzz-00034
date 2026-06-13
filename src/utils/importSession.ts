import {
  ImportSession,
  UndoSnapshot,
  UndoImpactPreview,
  SessionAuditBreakdown,
  ThresholdConfig,
  SensorRecord,
  ManualNote,
  AlarmRecord,
  Evidence,
  Event,
  ImportBatch,
  FileType,
  ScenePackagePreview,
  ConflictChoice,
  ReplayMode,
  SessionActionType,
  UndoStatus,
  ApplyUndoResult,
} from '../types'
import { generateId } from './csvParser'

const EMPTY_BREAKDOWN: SessionAuditBreakdown = {
  new_sensor_records: 0,
  new_note_records: 0,
  new_alarm_records: 0,
  skipped_duplicate_records: 0,
  new_events: 0,
  merged_events: 0,
  overwritten_events: 0,
  skipped_events: 0,
  conflicts_detected: 0,
  conflicts_resolved: 0,
}

export function createEmptyBreakdown(): SessionAuditBreakdown {
  return { ...EMPTY_BREAKDOWN }
}

export interface CreateSessionForImportInput {
  preview: ScenePackagePreview
  thresholdBefore: ThresholdConfig
  thresholdAfter: ThresholdConfig
  batches: ImportBatch[]
  newSensorRecords: SensorRecord[]
  newNoteRecords: ManualNote[]
  newAlarmRecords: AlarmRecord[]
  eventsBefore: Event[]
  eventsAfter: Event[]
  conflictChoices?: ConflictChoice[]
  userNote?: string
}

export function createSessionForImport(input: CreateSessionForImportInput): {
  session: ImportSession
  batchedRecords: {
    sensor: SensorRecord[]
    notes: ManualNote[]
    alarms: AlarmRecord[]
  }
  batchesWithSession: ImportBatch[]
} {
  const sessionId = 'sess_' + generateId()
  const now = new Date().toISOString()

  const newSensorWithSession = input.newSensorRecords.map(r => ({ ...r, session_id: sessionId }))
  const newNotesWithSession = input.newNoteRecords.map(r => ({ ...r, session_id: sessionId }))
  const newAlarmsWithSession = input.newAlarmRecords.map(r => ({ ...r, session_id: sessionId }))

  const batchesWithSession = input.batches.map(b => ({
    ...b,
    session_id: sessionId,
    new_record_ids: (() => {
      if (b.file_type === 'sensor') return newSensorWithSession.filter(r => r.batch_id.startsWith(input.preview.package_id)).map(r => r.id)
      if (b.file_type === 'note') return newNotesWithSession.filter(r => r.batch_id.startsWith(input.preview.package_id)).map(r => r.id)
      if (b.file_type === 'alarm') return newAlarmsWithSession.filter(r => r.batch_id.startsWith(input.preview.package_id)).map(r => r.id)
      return []
    })(),
  }))

  const newEventIds: string[] = []
  const mergedEventIds: string[] = []
  const overwrittenEventIds: string[] = []
  const skippedEventIds: string[] = []

  const beforeEventIds = new Set(input.eventsBefore.map(e => e.id))
  for (const ev of input.eventsAfter) {
    if (!beforeEventIds.has(ev.id)) {
      newEventIds.push(ev.id)
    }
  }

  for (const beforeEv of input.eventsBefore) {
    const afterEv = input.eventsAfter.find(e => e.id === beforeEv.id)
    if (afterEv) {
      const changed =
        afterEv.status !== beforeEv.status ||
        afterEv.remark !== beforeEv.remark ||
        afterEv.handler !== beforeEv.handler ||
        afterEv.evidence_count !== beforeEv.evidence_count ||
        afterEv.end_time !== beforeEv.end_time ||
        afterEv.start_time !== beforeEv.start_time
      if (changed) {
        if (afterEv.status === beforeEv.status && afterEv.evidence_count > beforeEv.evidence_count) {
          mergedEventIds.push(afterEv.id)
        } else {
          overwrittenEventIds.push(afterEv.id)
        }
      }
    } else {
      skippedEventIds.push(beforeEv.id)
    }
  }

  const batchDuplicates = input.preview.conflicts.filter(c => c.conflict_type === 'batch_duplicate')
  const timeConflicts = input.preview.conflicts.filter(c => c.conflict_type === 'same_device_time')

  const breakdown: SessionAuditBreakdown = {
    new_sensor_records: newSensorWithSession.length,
    new_note_records: newNotesWithSession.length,
    new_alarm_records: newAlarmsWithSession.length,
    skipped_duplicate_records: batchDuplicates.length,
    new_events: newEventIds.length,
    merged_events: mergedEventIds.length,
    overwritten_events: overwrittenEventIds.length,
    skipped_events: skippedEventIds.length,
    conflicts_detected: input.preview.conflicts.length,
    conflicts_resolved: input.conflictChoices?.length || 0,
  }

  const affectedEventIds = Array.from(new Set([...newEventIds, ...mergedEventIds, ...overwrittenEventIds]))

  const resolutionParts: string[] = []
  if (breakdown.new_sensor_records > 0) resolutionParts.push(`${breakdown.new_sensor_records} 条传感器`)
  if (breakdown.new_note_records > 0) resolutionParts.push(`${breakdown.new_note_records} 条备注`)
  if (breakdown.new_alarm_records > 0) resolutionParts.push(`${breakdown.new_alarm_records} 条告警`)
  if (breakdown.new_events > 0) resolutionParts.push(`新增 ${breakdown.new_events} 事件`)
  if (breakdown.merged_events > 0) resolutionParts.push(`合并 ${breakdown.merged_events} 事件`)
  if (breakdown.overwritten_events > 0) resolutionParts.push(`覆盖 ${breakdown.overwritten_events} 事件`)
  if (timeConflicts.length > 0) resolutionParts.push(`${timeConflicts.length} 处同时间冲突`)
  if (batchDuplicates.length > 0) resolutionParts.push(`跳过 ${batchDuplicates.length} 重复批次`)

  const session: ImportSession = {
    id: sessionId,
    action_type: 'import',
    package_id: input.preview.package_id,
    created_at: now,
    batch_ids: batchesWithSession.map(b => b.id),
    affected_event_ids: affectedEventIds,
    new_event_ids: newEventIds,
    merged_event_ids: mergedEventIds,
    overwritten_event_ids: overwrittenEventIds,
    skipped_event_ids: skippedEventIds,
    new_sensor_record_ids: newSensorWithSession.map(r => r.id),
    new_note_record_ids: newNotesWithSession.map(r => r.id),
    new_alarm_record_ids: newAlarmsWithSession.map(r => r.id),
    skipped_sensor_record_ids: [],
    skipped_note_record_ids: [],
    skipped_alarm_record_ids: [],
    threshold_before: { ...input.thresholdBefore },
    threshold_after: { ...input.thresholdAfter },
    threshold_changed: JSON.stringify(input.thresholdBefore) !== JSON.stringify(input.thresholdAfter),
    breakdown,
    resolution_summary: resolutionParts.length > 0 ? resolutionParts.join('；') : '无变更',
    source_files: input.preview.files.map(fp => ({
      file_type: fp.file_type as FileType,
      file_name: fp.file_name,
      file_hash: fp.file_hash,
      record_count: fp.valid_count,
      error_count: fp.error_count,
    })),
    undo_status: 'active',
    conflict_choices: input.conflictChoices,
    user_note: input.userNote,
  }

  const eventsWithSource = input.eventsAfter.map(ev => {
    const isNew = newEventIds.includes(ev.id)
    const isMerged = mergedEventIds.includes(ev.id)
    const isOverwritten = overwrittenEventIds.includes(ev.id)
    if (isNew || isMerged || isOverwritten) {
      const sourceSessions = Array.from(new Set([...(ev.source_session_ids || []), sessionId]))
      const sourceBatches = Array.from(new Set([...(ev.source_batch_ids || []), ...session.batch_ids]))
      return { ...ev, source_session_ids: sourceSessions, source_batch_ids: sourceBatches }
    }
    return ev
  })

  return {
    session,
    batchedRecords: {
      sensor: newSensorWithSession,
      notes: newNotesWithSession,
      alarms: newAlarmsWithSession,
    },
    batchesWithSession,
  }
}

export interface CreateSessionForReplayInput {
  actionType: SessionActionType
  replayMode: ReplayMode
  packageId: string
  thresholdBefore: ThresholdConfig
  thresholdAfter: ThresholdConfig
  batches: ImportBatch[]
  eventsBefore: Event[]
  eventsAfter: Event[]
  newSensorCount: number
  newNoteCount: number
  newAlarmCount: number
  skippedBatches: number
  skippedEvents: number
  mergedEvents: number
  overwrittenEvents: number
  conflictChoices?: ConflictChoice[]
}

export function createSessionForReplay(input: CreateSessionForReplayInput): {
  session: ImportSession
  batchesWithSession: ImportBatch[]
} {
  const sessionId = 'sess_' + generateId()
  const now = new Date().toISOString()

  const batchesWithSession = input.batches.map(b => ({
    ...b,
    session_id: sessionId,
  }))

  const newEventIds: string[] = []
  const mergedEventIds: string[] = []
  const overwrittenEventIds: string[] = []
  const skippedEventIds: string[] = []

  const beforeEventIds = new Set(input.eventsBefore.map(e => e.id))
  for (const ev of input.eventsAfter) {
    if (!beforeEventIds.has(ev.id)) newEventIds.push(ev.id)
  }
  for (const beforeEv of input.eventsBefore) {
    const afterEv = input.eventsAfter.find(e => e.id === beforeEv.id)
    if (!afterEv) {
      skippedEventIds.push(beforeEv.id)
    }
  }

  const breakdown: SessionAuditBreakdown = {
    new_sensor_records: input.newSensorCount,
    new_note_records: input.newNoteCount,
    new_alarm_records: input.newAlarmCount,
    skipped_duplicate_records: input.skippedBatches,
    new_events: newEventIds.length,
    merged_events: input.mergedEvents,
    overwritten_events: input.overwrittenEvents,
    skipped_events: input.skippedEvents,
    conflicts_detected: input.conflictChoices?.length || 0,
    conflicts_resolved: input.conflictChoices?.length || 0,
  }

  const affectedEventIds = Array.from(new Set([
    ...newEventIds,
    ...Array(input.mergedEvents).fill('').map((_, i) => `merged_${i}`).slice(0, Math.min(input.mergedEvents, input.eventsAfter.length)),
  ])).filter(id => !id.startsWith('merged_') || input.eventsAfter.some(e => e.id === id.replace('merged_', '')))

  const session: ImportSession = {
    id: sessionId,
    action_type: input.actionType,
    package_id: input.packageId,
    created_at: now,
    batch_ids: batchesWithSession.map(b => b.id),
    affected_event_ids: input.eventsAfter.filter(e =>
      newEventIds.includes(e.id) ||
      input.eventsBefore.some(be => be.id === e.id && (be.evidence_count !== e.evidence_count || be.status !== e.status))
    ).map(e => e.id),
    new_event_ids: newEventIds,
    merged_event_ids: mergedEventIds,
    overwritten_event_ids: overwrittenEventIds,
    skipped_event_ids: skippedEventIds,
    new_sensor_record_ids: [],
    new_note_record_ids: [],
    new_alarm_record_ids: [],
    skipped_sensor_record_ids: [],
    skipped_note_record_ids: [],
    skipped_alarm_record_ids: [],
    threshold_before: { ...input.thresholdBefore },
    threshold_after: { ...input.thresholdAfter },
    threshold_changed: JSON.stringify(input.thresholdBefore) !== JSON.stringify(input.thresholdAfter),
    breakdown,
    resolution_summary: `回放(${replayModeLabel(input.replayMode)})：${newEventIds.length}新事件/${input.mergedEvents}合并/${input.skippedEvents}跳过/${input.skippedBatches}跳过批次`,
    source_files: [],
    replay_mode: input.replayMode,
    undo_status: 'active',
    conflict_choices: input.conflictChoices,
  }

  return { session, batchesWithSession }
}

function replayModeLabel(m: ReplayMode): string {
  return m === 'overwrite' ? '覆盖' : m === 'merge' ? '合并' : '跳过'
}

export function createUndoSnapshot(input: {
  session_id: string
  threshold: ThresholdConfig
  sensorRecords: SensorRecord[]
  manualNotes: ManualNote[]
  alarmRecords: AlarmRecord[]
  events: Event[]
  evidences: Evidence[]
  importBatches: ImportBatch[]
  importSessions: ImportSession[]
}): UndoSnapshot {
  return {
    id: 'snap_' + generateId(),
    session_id: input.session_id,
    created_at: new Date().toISOString(),
    threshold: { ...input.threshold },
    sensor_record_ids: input.sensorRecords.map(r => r.id),
    manual_note_ids: input.manualNotes.map(r => r.id),
    alarm_record_ids: input.alarmRecords.map(r => r.id),
    event_ids: input.events.map(e => e.id),
    evidence_ids: input.evidences.map(e => e.id),
    import_batch_ids: input.importBatches.map(b => b.id),
    full_sensor_records: input.sensorRecords.map(r => ({ ...r })),
    full_manual_notes: input.manualNotes.map(r => ({ ...r })),
    full_alarm_records: input.alarmRecords.map(r => ({ ...r })),
    full_events: input.events.map(e => ({ ...e })),
    full_evidences: input.evidences.map(e => ({ ...e })),
    full_import_batches: input.importBatches.map(b => ({ ...b })),
    full_sessions: input.importSessions.map(s => ({ ...s })),
    can_undo: true,
    undo_reason: null,
  }
}

export function findLatestUndoableSession(sessions: ImportSession[]): ImportSession | null {
  const activeSessions = sessions
    .filter(s => s.undo_status === 'active')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (activeSessions.length === 0) return null

  const latest = activeSessions[0]

  const laterSessions = sessions
    .filter(s => s.undo_status === 'active' && s.id !== latest.id)
    .filter(s => new Date(s.created_at).getTime() > new Date(latest.created_at).getTime())

  if (laterSessions.length > 0) {
    return null
  }

  return latest
}

export function previewUndoImpact(
  sessionId: string,
  sessions: ImportSession[],
  snapshots: UndoSnapshot[],
  currentThreshold: ThresholdConfig
): UndoImpactPreview {
  const session = sessions.find(s => s.id === sessionId)
  if (!session) {
    return {
      session_id: sessionId,
      can_undo: false,
      reason_if_cannot: '会话不存在',
      events_to_remove: 0,
      events_to_restore: 0,
      batches_to_remove: 0,
      sensor_records_to_remove: 0,
      note_records_to_remove: 0,
      alarm_records_to_remove: 0,
      threshold_will_change: false,
      dependent_sessions: [],
    }
  }

  if (session.undo_status !== 'active') {
    return {
      session_id: sessionId,
      can_undo: false,
      reason_if_cannot: `会话已处于「${undoStatusLabel(session.undo_status)}」状态`,
      events_to_remove: 0,
      events_to_restore: 0,
      batches_to_remove: 0,
      sensor_records_to_remove: 0,
      note_records_to_remove: 0,
      alarm_records_to_remove: 0,
      threshold_will_change: false,
      dependent_sessions: [],
    }
  }

  const sessionTime = new Date(session.created_at).getTime()
  const laterActiveSessions = sessions
    .filter(s =>
      s.id !== sessionId &&
      s.undo_status === 'active' &&
      new Date(s.created_at).getTime() > sessionTime
    )

  if (laterActiveSessions.length > 0) {
    return {
      session_id: sessionId,
      can_undo: false,
      reason_if_cannot: `存在 ${laterActiveSessions.length} 个后续会话，仅允许撤销最近一次完整可追溯的写入`,
      events_to_remove: session.new_event_ids.length,
      events_to_restore: 0,
      batches_to_remove: session.batch_ids.length,
      sensor_records_to_remove: session.breakdown.new_sensor_records,
      note_records_to_remove: session.breakdown.new_note_records,
      alarm_records_to_remove: session.breakdown.new_alarm_records,
      threshold_will_change: session.threshold_changed,
      threshold_before: session.threshold_after,
      threshold_after: session.threshold_before,
      dependent_sessions: laterActiveSessions.map(s => s.id),
    }
  }

  const snapshot = snapshots.find(s => s.session_id === sessionId)
  if (!snapshot) {
    return {
      session_id: sessionId,
      can_undo: false,
      reason_if_cannot: '撤销快照已丢失（页面刷新时未保存或手动清除）',
      events_to_remove: session.new_event_ids.length,
      events_to_restore: 0,
      batches_to_remove: session.batch_ids.length,
      sensor_records_to_remove: session.breakdown.new_sensor_records,
      note_records_to_remove: session.breakdown.new_note_records,
      alarm_records_to_remove: session.breakdown.new_alarm_records,
      threshold_will_change: session.threshold_changed,
      threshold_before: currentThreshold,
      threshold_after: session.threshold_before,
      dependent_sessions: [],
    }
  }

  return {
    session_id: sessionId,
    can_undo: true,
    events_to_remove: session.new_event_ids.length,
    events_to_restore: Math.max(0, snapshot.full_events.length - (snapshot.full_events.length - session.new_event_ids.length)),
    batches_to_remove: session.batch_ids.length,
    sensor_records_to_remove: session.breakdown.new_sensor_records,
    note_records_to_remove: session.breakdown.new_note_records,
    alarm_records_to_remove: session.breakdown.new_alarm_records,
    threshold_will_change: session.threshold_changed,
    threshold_before: currentThreshold,
    threshold_after: session.threshold_before,
    dependent_sessions: [],
  }
}

export function applyUndo(
  sessionId: string,
  sessions: ImportSession[],
  snapshots: UndoSnapshot[],
  currentSensorRecords: SensorRecord[],
  currentManualNotes: ManualNote[],
  currentAlarmRecords: AlarmRecord[],
  currentEvents: Event[],
  currentEvidences: Evidence[],
  currentBatches: ImportBatch[],
  currentThreshold: ThresholdConfig
): {
  result: ApplyUndoResult
  new_sessions: ImportSession[]
  new_sensor_records: SensorRecord[]
  new_manual_notes: ManualNote[]
  new_alarm_records: AlarmRecord[]
  new_events: Event[]
  new_evidences: Evidence[]
  new_batches: ImportBatch[]
  new_threshold: ThresholdConfig
  undo_session?: ImportSession
} {
  const preview = previewUndoImpact(sessionId, sessions, snapshots, currentThreshold)

  if (!preview.can_undo) {
    return {
      result: { success: false, reason: preview.reason_if_cannot },
      new_sessions: sessions,
      new_sensor_records: currentSensorRecords,
      new_manual_notes: currentManualNotes,
      new_alarm_records: currentAlarmRecords,
      new_events: currentEvents,
      new_evidences: currentEvidences,
      new_batches: currentBatches,
      new_threshold: currentThreshold,
    }
  }

  const snapshot = snapshots.find(s => s.session_id === sessionId)!
  const targetSession = sessions.find(s => s.id === sessionId)!

  const undoSessionId = 'sess_' + generateId()
  const now = new Date().toISOString()

  const undoSession: ImportSession = {
    id: undoSessionId,
    action_type: 'undo',
    package_id: `undo_of_${targetSession.package_id}`,
    created_at: now,
    batch_ids: [],
    affected_event_ids: targetSession.affected_event_ids,
    new_event_ids: [],
    merged_event_ids: [],
    overwritten_event_ids: [],
    skipped_event_ids: targetSession.new_event_ids,
    new_sensor_record_ids: [],
    new_note_record_ids: [],
    new_alarm_record_ids: [],
    skipped_sensor_record_ids: targetSession.new_sensor_record_ids,
    skipped_note_record_ids: targetSession.new_note_record_ids,
    skipped_alarm_record_ids: targetSession.new_alarm_record_ids,
    threshold_before: { ...currentThreshold },
    threshold_after: { ...snapshot.threshold },
    threshold_changed: JSON.stringify(currentThreshold) !== JSON.stringify(snapshot.threshold),
    breakdown: {
      ...EMPTY_BREAKDOWN,
      skipped_duplicate_records: targetSession.batch_ids.length,
      skipped_events: targetSession.new_event_ids.length,
    },
    resolution_summary: `撤销会话 ${targetSession.id.slice(0, 12)}...：移除 ${targetSession.new_event_ids.length} 事件/${targetSession.batch_ids.length} 批次`,
    source_files: [],
    undo_status: 'active',
  }

  const markUndone = sessions.map(s => {
    if (s.id === sessionId) {
      return {
        ...s,
        undo_status: 'undone' as UndoStatus,
        undone_by_session_id: undoSessionId,
        undone_at: now,
      }
    }
    return s
  })

  const newSessions = [...markUndone, undoSession]

  const eventsMarked = snapshot.full_events.map(ev => {
    const wasCreatedByUndoneSession = targetSession.new_event_ids.includes(ev.id)
    if (wasCreatedByUndoneSession) {
      return { ...ev, _is_from_undone_session: true }
    }
    return ev
  })

  return {
    result: {
      success: true,
      undoSessionId,
      restored_threshold: snapshot.threshold,
      restored_sensor_count: snapshot.full_sensor_records.length,
      restored_note_count: snapshot.full_manual_notes.length,
      restored_alarm_count: snapshot.full_alarm_records.length,
      restored_event_count: snapshot.full_events.length,
      restored_batch_count: snapshot.full_import_batches.length,
      mark_undone_session_id: sessionId,
    },
    new_sessions: newSessions,
    new_sensor_records: snapshot.full_sensor_records,
    new_manual_notes: snapshot.full_manual_notes,
    new_alarm_records: snapshot.full_alarm_records,
    new_events: eventsMarked,
    new_evidences: snapshot.full_evidences,
    new_batches: snapshot.full_import_batches,
    new_threshold: snapshot.threshold,
    undo_session: undoSession,
  }
}

export function undoStatusLabel(status: UndoStatus): string {
  switch (status) {
    case 'active': return '有效'
    case 'undone': return '已撤销'
    case 'superseded': return '已覆盖'
    default: return String(status)
  }
}

export function actionTypeLabel(type: SessionActionType): string {
  switch (type) {
    case 'import': return '场景包导入'
    case 'replay': return '场景包回放'
    case 'undo': return '撤销操作'
    case 'threshold_change': return '阈值修改'
    default: return String(type)
  }
}

export function getEventSourceSessions(event: Event, sessions: ImportSession[]): ImportSession[] {
  if (!event.source_session_ids || event.source_session_ids.length === 0) return []
  return sessions.filter(s => event.source_session_ids!.includes(s.id))
}

export function getEventSourceBatches(event: Event, batches: ImportBatch[]): ImportBatch[] {
  if (!event.source_batch_ids || event.source_batch_ids.length === 0) return []
  return batches.filter(b => event.source_batch_ids!.includes(b.id))
}
