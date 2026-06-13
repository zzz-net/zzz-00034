import {
  RuleScheme,
  RuleSchemeDiff,
  ThresholdConfig,
  SensorRecord,
  ManualNote,
  AlarmRecord,
  Event,
  Evidence,
  RecalcPreview,
  RecalcEventChange,
  EventChangeType,
  StateConflict,
  StateConflictChoice,
  StateConflictChoiceType,
  AuditLogEntry,
  ImportBatch,
} from '../types'
import { generateId } from './csvParser'
import { DEFAULT_THRESHOLD, validateThresholdConfig } from './validator'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from './anomalyDetector'
import { mergeEvents } from './eventMerger'

export function generateSchemeId(): string {
  return 'scheme_' + generateId()
}

export function generateAuditLogId(): string {
  return 'audit_' + generateId()
}

export function createDefaultScheme(): RuleScheme {
  const now = new Date().toISOString()
  return {
    id: generateSchemeId(),
    name: '默认方案',
    description: '系统默认的异常检测规则方案',
    threshold: { ...DEFAULT_THRESHOLD },
    is_default: true,
    is_active: true,
    enabled_at: now,
    created_at: now,
    updated_at: now,
    version: 1,
  }
}

export function createScheme(
  name: string,
  threshold: ThresholdConfig,
  options: Partial<RuleScheme> = {}
): { scheme: RuleScheme; auditLog: AuditLogEntry } {
  const validation = validateThresholdConfig(threshold)
  if (!validation.valid) {
    throw new Error(`无效的阈值配置: ${validation.errors.map(e => e.message).join('; ')}`)
  }

  const now = new Date().toISOString()
  const scheme: RuleScheme = {
    id: generateSchemeId(),
    name,
    description: options.description,
    threshold: { ...threshold },
    is_default: options.is_default || false,
    is_active: false,
    created_at: now,
    updated_at: now,
    created_by: options.created_by,
    version: 1,
  }

  const auditLog: AuditLogEntry = {
    id: generateAuditLogId(),
    action_type: 'scheme_create',
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    metadata: {
      threshold: scheme.threshold,
      description: scheme.description,
    },
    created_at: now,
    created_by: options.created_by,
  }

  return { scheme, auditLog }
}

export function copyScheme(
  sourceScheme: RuleScheme,
  newName: string,
  options: Partial<RuleScheme> = {}
): { scheme: RuleScheme; auditLog: AuditLogEntry } {
  const now = new Date().toISOString()
  const scheme: RuleScheme = {
    ...sourceScheme,
    id: generateSchemeId(),
    name: newName,
    description: options.description || `${sourceScheme.description || ''} (副本)`.trim(),
    is_default: false,
    is_active: false,
    enabled_at: undefined,
    created_at: now,
    updated_at: now,
    version: 1,
  }

  const auditLog: AuditLogEntry = {
    id: generateAuditLogId(),
    action_type: 'scheme_copy',
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    metadata: {
      source_scheme_id: sourceScheme.id,
      source_scheme_name: sourceScheme.name,
      threshold: scheme.threshold,
    },
    created_at: now,
    created_by: options.created_by,
  }

  return { scheme, auditLog }
}

export function updateScheme(
  scheme: RuleScheme,
  updates: Partial<RuleScheme>,
  updatedBy?: string
): { scheme: RuleScheme; auditLog: AuditLogEntry } {
  const now = new Date().toISOString()
  const updated: RuleScheme = {
    ...scheme,
    ...updates,
    updated_at: now,
    version: scheme.version + 1,
  }

  const changedFields: string[] = []
  const metadata: Record<string, unknown> = {}

  for (const key of Object.keys(updates) as Array<keyof RuleScheme>) {
    if (JSON.stringify(scheme[key]) !== JSON.stringify(updated[key])) {
      changedFields.push(key)
      metadata[`old_${key}`] = scheme[key]
      metadata[`new_${key}`] = updated[key]
    }
  }

  const auditLog: AuditLogEntry = {
    id: generateAuditLogId(),
    action_type: 'scheme_update',
    scheme_id: scheme.id,
    scheme_name: updated.name,
    metadata: {
      changed_fields: changedFields,
      ...metadata,
    },
    created_at: now,
    created_by: updatedBy,
  }

  return { scheme: updated, auditLog }
}

export function renameScheme(
  scheme: RuleScheme,
  newName: string,
  renamedBy?: string
): { scheme: RuleScheme; auditLog: AuditLogEntry } {
  const result = updateScheme(scheme, { name: newName }, renamedBy)
  result.auditLog.action_type = 'scheme_rename'
  return result
}

export function deleteScheme(
  schemes: RuleScheme[],
  schemeId: string,
  deletedBy?: string
): { schemes: RuleScheme[]; auditLog: AuditLogEntry; error?: string } {
  const scheme = schemes.find(s => s.id === schemeId)
  if (!scheme) {
    return { schemes, auditLog: null as any, error: '方案不存在' }
  }

  if (scheme.is_default) {
    return { schemes, auditLog: null as any, error: '不能删除默认方案' }
  }

  if (scheme.is_active) {
    return { schemes, auditLog: null as any, error: '不能删除当前激活的方案' }
  }

  const now = new Date().toISOString()
  const auditLog: AuditLogEntry = {
    id: generateAuditLogId(),
    action_type: 'scheme_delete',
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    metadata: {
      threshold: scheme.threshold,
      deleted: true,
    },
    created_at: now,
    created_by: deletedBy,
  }

  return {
    schemes: schemes.filter(s => s.id !== schemeId),
    auditLog,
  }
}

export function switchScheme(
  schemes: RuleScheme[],
  newActiveSchemeId: string,
  switchedBy?: string
): { schemes: RuleScheme[]; auditLog: AuditLogEntry; error?: string } {
  const newScheme = schemes.find(s => s.id === newActiveSchemeId)
  if (!newScheme) {
    return { schemes, auditLog: null as any, error: '目标方案不存在' }
  }

  const oldActiveScheme = schemes.find(s => s.is_active)
  const now = new Date().toISOString()

  const updatedSchemes = schemes.map(s => {
    if (s.id === newActiveSchemeId) {
      return { ...s, is_active: true, enabled_at: now, updated_at: now }
    }
    if (s.is_active) {
      return { ...s, is_active: false, updated_at: now }
    }
    return s
  })

  const auditLog: AuditLogEntry = {
    id: generateAuditLogId(),
    action_type: 'scheme_switch',
    scheme_id: newScheme.id,
    scheme_name: newScheme.name,
    old_scheme_id: oldActiveScheme?.id,
    new_scheme_id: newScheme.id,
    metadata: {
      old_scheme_id: oldActiveScheme?.id,
      old_scheme_name: oldActiveScheme?.name,
      new_scheme_id: newScheme.id,
      new_scheme_name: newScheme.name,
      old_threshold: oldActiveScheme?.threshold,
      new_threshold: newScheme.threshold,
    },
    created_at: now,
    created_by: switchedBy,
  }

  return { schemes: updatedSchemes, auditLog }
}

export function compareSchemes(
  schemeA: RuleScheme,
  schemeB: RuleScheme
): RuleSchemeDiff {
  const fields: Array<keyof ThresholdConfig> = [
    'temp_min', 'temp_max', 'voltage_min', 'voltage_max',
    'offline_duration_min', 'merge_window_minutes',
  ]

  const differences: RuleSchemeDiff['differences'] = []

  for (const field of fields) {
    const valueA = schemeA.threshold[field]
    const valueB = schemeB.threshold[field]
    if (valueA !== valueB) {
      const changePercent = valueA !== 0 ? ((valueB - valueA) / Math.abs(valueA)) * 100 : undefined
      differences.push({
        field,
        value_a: valueA,
        value_b: valueB,
        change_percent: changePercent,
      })
    }
  }

  const summary = differences.length === 0
    ? '两个方案完全相同'
    : `共 ${differences.length} 处差异：${differences.map(d => `${d.field}: ${d.value_a} → ${d.value_b}`).join('; ')}`

  return {
    scheme_a_id: schemeA.id,
    scheme_a_name: schemeA.name,
    scheme_b_id: schemeB.id,
    scheme_b_name: schemeB.name,
    differences,
    summary,
  }
}

export function getFieldLabel(field: keyof ThresholdConfig): string {
  const labels: Record<keyof ThresholdConfig, string> = {
    temp_min: '温度下限',
    temp_max: '温度上限',
    voltage_min: '电压下限',
    voltage_max: '电压上限',
    offline_duration_min: '离线时长阈值',
    merge_window_minutes: '事件合并窗口',
  }
  return labels[field] || field
}

export function getFieldUnit(field: keyof ThresholdConfig): string {
  const units: Record<keyof ThresholdConfig, string> = {
    temp_min: '°C',
    temp_max: '°C',
    voltage_min: 'V',
    voltage_max: 'V',
    offline_duration_min: '分钟',
    merge_window_minutes: '分钟',
  }
  return units[field] || ''
}

export function calculateRecalcPreview(
  oldScheme: RuleScheme,
  newScheme: RuleScheme,
  sensorRecords: SensorRecord[],
  manualNotes: ManualNote[],
  alarmRecords: AlarmRecord[],
  existingEvents: Event[],
  importBatches: ImportBatch[],
  previewId?: string
): { preview: RecalcPreview; auditLog: AuditLogEntry } {
  const now = new Date().toISOString()

  const oldSensorEvidences = detectSensorAnomalies(sensorRecords, oldScheme.threshold)
  const oldNoteEvidences = notesToEvidence(manualNotes)
  const oldAlarmEvidences = alarmsToEvidence(alarmRecords)
  const oldAllEvidences = [...oldSensorEvidences, ...oldNoteEvidences, ...oldAlarmEvidences]
  const oldMergeResult = mergeEvents(oldAllEvidences, oldScheme.threshold.merge_window_minutes)

  const newSensorEvidences = detectSensorAnomalies(sensorRecords, newScheme.threshold)
  const newNoteEvidences = notesToEvidence(manualNotes)
  const newAlarmEvidences = alarmsToEvidence(alarmRecords)
  const newAllEvidences = [...newSensorEvidences, ...newNoteEvidences, ...newAlarmEvidences]
  const newMergeResult = mergeEvents(newAllEvidences, newScheme.threshold.merge_window_minutes)

  const changes = compareEvents(oldMergeResult.events, newMergeResult.events, existingEvents)

  const countByType = (type: EventChangeType) => changes.filter(c => c.change_type === type).length
  const withManualState = changes.filter(c => c.has_manual_state).length

  const affectedBatchIds = Array.from(new Set([
    ...sensorRecords.map(r => r.batch_id),
    ...manualNotes.map(n => n.batch_id),
    ...alarmRecords.map(a => a.batch_id),
  ])).filter(id => importBatches.some(b => b.id === id))

  const preview: RecalcPreview = {
    id: previewId || 'recalc_' + generateId(),
    old_scheme_id: oldScheme.id,
    old_scheme_name: oldScheme.name,
    new_scheme_id: newScheme.id,
    new_scheme_name: newScheme.name,
    created_at: now,
    old_event_count: oldMergeResult.events.length,
    new_event_count: newMergeResult.events.length,
    changes,
    new_events: countByType('new'),
    merged_events: countByType('merged'),
    split_events: countByType('split'),
    closed_events: countByType('closed'),
    unchanged_events: countByType('unchanged'),
    modified_events: countByType('modified'),
    events_with_manual_state: withManualState,
    affected_batch_ids: affectedBatchIds,
    is_applied: false,
  }

  const auditLog: AuditLogEntry = {
    id: generateAuditLogId(),
    action_type: 'recalc_start',
    scheme_id: newScheme.id,
    scheme_name: newScheme.name,
    old_scheme_id: oldScheme.id,
    new_scheme_id: newScheme.id,
    metadata: {
      preview_id: preview.id,
      old_event_count: preview.old_event_count,
      new_event_count: preview.new_event_count,
      new_events: preview.new_events,
      merged_events: preview.merged_events,
      split_events: preview.split_events,
      closed_events: preview.closed_events,
      events_with_manual_state: preview.events_with_manual_state,
    },
    created_at: now,
  }

  return { preview, auditLog }
}

function compareEvents(
  oldEvents: Event[],
  newEvents: Event[],
  existingEvents: Event[]
): RecalcEventChange[] {
  const changes: RecalcEventChange[] = []
  const oldEventsByDevice = new Map<string, Event[]>()
  const newEventsByDevice = new Map<string, Event[]>()

  for (const ev of oldEvents) {
    if (!oldEventsByDevice.has(ev.device_id)) oldEventsByDevice.set(ev.device_id, [])
    oldEventsByDevice.get(ev.device_id)!.push(ev)
  }
  for (const ev of newEvents) {
    if (!newEventsByDevice.has(ev.device_id)) newEventsByDevice.set(ev.device_id, [])
    newEventsByDevice.get(ev.device_id)!.push(ev)
  }

  const allDeviceIds = Array.from(new Set([...oldEventsByDevice.keys(), ...newEventsByDevice.keys()]))
  const overlapThresholdMs = 60 * 1000

  const matchedOldIds = new Set<string>()
  const matchedNewIds = new Set<string>()

  for (const deviceId of allDeviceIds) {
    const oldDevEvents = oldEventsByDevice.get(deviceId) || []
    const newDevEvents = newEventsByDevice.get(deviceId) || []

    for (const newEv of newDevEvents) {
      const newStart = new Date(newEv.start_time).getTime()
      const newEnd = new Date(newEv.end_time).getTime()

      const overlappingOld = oldDevEvents.filter(oldEv => {
        if (matchedOldIds.has(oldEv.id)) return false
        const oldStart = new Date(oldEv.start_time).getTime()
        const oldEnd = new Date(oldEv.end_time).getTime()
        const overlapStart = Math.max(newStart, oldStart)
        const overlapEnd = Math.min(newEnd, oldEnd)
        return overlapEnd - overlapStart > overlapThresholdMs
      })

      if (overlappingOld.length === 1) {
        const oldEv = overlappingOld[0]
        matchedOldIds.add(oldEv.id)
        matchedNewIds.add(newEv.id)

        const existing = existingEvents.find(e => e.id === oldEv.id)
        const hasManualState = existing ? existing.status !== 'pending' : false

        const oldStart = new Date(oldEv.start_time).getTime()
        const oldEnd = new Date(oldEv.end_time).getTime()
        const newStartT = new Date(newEv.start_time).getTime()
        const newEndT = new Date(newEv.end_time).getTime()

        const timeChanged = oldStart !== newStartT || oldEnd !== newEndT
        const evidenceChanged = oldEv.evidence_count !== newEv.evidence_count

        if (timeChanged || evidenceChanged) {
          changes.push({
            event_id: oldEv.id,
            new_event_id: newEv.id,
            change_type: 'modified',
            device_id: deviceId,
            old_start_time: oldEv.start_time,
            old_end_time: oldEv.end_time,
            old_status: oldEv.status,
            old_evidence_count: oldEv.evidence_count,
            new_start_time: newEv.start_time,
            new_end_time: newEv.end_time,
            new_evidence_count: newEv.evidence_count,
            description: `事件已修改：${timeChanged ? '时间范围变化' : ''}${timeChanged && evidenceChanged ? '、' : ''}${evidenceChanged ? '证据数变化' : ''}`,
            has_manual_state: hasManualState,
          })
        } else {
          changes.push({
            event_id: oldEv.id,
            change_type: 'unchanged',
            device_id: deviceId,
            old_start_time: oldEv.start_time,
            old_end_time: oldEv.end_time,
            old_status: oldEv.status,
            old_evidence_count: oldEv.evidence_count,
            description: '事件未变化',
            has_manual_state: hasManualState,
          })
        }
      } else if (overlappingOld.length > 1) {
        for (const oldEv of overlappingOld) {
          matchedOldIds.add(oldEv.id)
        }
        matchedNewIds.add(newEv.id)

        const existing = overlappingOld.some(oe => {
          const e = existingEvents.find(ev => ev.id === oe.id)
          return e && e.status !== 'pending'
        })

        changes.push({
          new_event_id: newEv.id,
          change_type: 'merged',
          device_id: deviceId,
          merged_from: overlappingOld.map(e => e.id),
          new_start_time: newEv.start_time,
          new_end_time: newEv.end_time,
          new_evidence_count: newEv.evidence_count,
          description: `${overlappingOld.length} 个事件合并为 1 个`,
          has_manual_state: existing,
        })
      }
    }

    for (const oldEv of oldDevEvents) {
      if (matchedOldIds.has(oldEv.id)) continue

      const oldStart = new Date(oldEv.start_time).getTime()
      const oldEnd = new Date(oldEv.end_time).getTime()

      const overlappingNew = newDevEvents.filter(newEv => {
        if (matchedNewIds.has(newEv.id)) return false
        const newStart = new Date(newEv.start_time).getTime()
        const newEnd = new Date(newEv.end_time).getTime()
        const overlapStart = Math.max(oldStart, newStart)
        const overlapEnd = Math.min(oldEnd, newEnd)
        return overlapEnd - overlapStart > overlapThresholdMs
      })

      if (overlappingNew.length > 1) {
        matchedOldIds.add(oldEv.id)
        for (const ne of overlappingNew) matchedNewIds.add(ne.id)

        const existing = existingEvents.find(e => e.id === oldEv.id)
        const hasManualState = existing ? existing.status !== 'pending' : false

        changes.push({
          event_id: oldEv.id,
          change_type: 'split',
          device_id: deviceId,
          old_start_time: oldEv.start_time,
          old_end_time: oldEv.end_time,
          old_evidence_count: oldEv.evidence_count,
          old_status: oldEv.status,
          split_into: overlappingNew.map(e => e.id),
          description: `1 个事件拆分为 ${overlappingNew.length} 个`,
          has_manual_state: hasManualState,
        })
      }
    }
  }

  for (const oldEv of oldEvents) {
    if (!matchedOldIds.has(oldEv.id)) {
      const existing = existingEvents.find(e => e.id === oldEv.id)
      const hasManualState = existing ? existing.status !== 'pending' : false
      changes.push({
        event_id: oldEv.id,
        change_type: 'closed',
        device_id: oldEv.device_id,
        old_start_time: oldEv.start_time,
        old_end_time: oldEv.end_time,
        old_status: oldEv.status,
        old_evidence_count: oldEv.evidence_count,
        description: '事件不再满足异常条件，将被关闭',
        has_manual_state: hasManualState,
      })
    }
  }

  for (const newEv of newEvents) {
    if (!matchedNewIds.has(newEv.id)) {
      changes.push({
        new_event_id: newEv.id,
        change_type: 'new',
        device_id: newEv.device_id,
        new_start_time: newEv.start_time,
        new_end_time: newEv.end_time,
        new_evidence_count: newEv.evidence_count,
        description: '新事件',
        has_manual_state: false,
      })
    }
  }

  return changes
}

export function detectStateConflicts(
  preview: RecalcPreview,
  existingEvents: Event[]
): StateConflict[] {
  const conflicts: StateConflict[] = []
  const manualStateChanges = preview.changes.filter(c =>
    c.has_manual_state && c.change_type !== 'unchanged'
  )

  for (const change of manualStateChanges) {
    const event = existingEvents.find(e => e.id === change.event_id)
    if (!event) continue

    const newStatus = change.change_type === 'closed' ? 'closed' :
      change.change_type === 'new' ? 'pending' :
      change.new_status || event.status

    if (event.status !== 'pending' && event.status !== newStatus) {
      conflicts.push({
        id: 'conflict_' + generateId(),
        event_id: event.id,
        event_device_id: event.device_id,
        event_start_time: event.start_time,
        old_status: event.status,
        new_status: newStatus as any,
        handler: event.handler,
        description: `事件状态冲突：原状态「${event.status}」，新规则下将变为「${newStatus}」`,
      })
    }
  }

  return conflicts
}

export function applyConflictChoice(
  conflict: StateConflict,
  choice: StateConflictChoiceType,
  batchId?: string,
  decidedBy?: string
): { choice: StateConflictChoice; auditLog: AuditLogEntry } {
  const now = new Date().toISOString()
  const choiceRecord: StateConflictChoice = {
    conflict_id: conflict.id,
    event_id: conflict.event_id,
    choice,
    batch_id: batchId,
    created_at: now,
  }

  const choiceLabels: Record<StateConflictChoiceType, string> = {
    keep_manual: '保留人工状态',
    recalculate: '按新规则重算',
    skip_batch: '跳过本批次',
  }

  const auditLog: AuditLogEntry = {
    id: generateAuditLogId(),
    action_type: 'conflict_resolve',
    scheme_id: undefined,
    metadata: {
      conflict_id: conflict.id,
      event_id: conflict.event_id,
      event_device_id: conflict.event_device_id,
      old_status: conflict.old_status,
      new_status: conflict.new_status,
      choice,
      choice_label: choiceLabels[choice],
      batch_id: batchId,
    },
    created_at: now,
    created_by: decidedBy,
  }

  return { choice: choiceRecord, auditLog }
}

export function applyRecalcPreview(
  preview: RecalcPreview,
  conflictChoices: StateConflictChoice[],
  existingEvents: Event[],
  sensorRecords: SensorRecord[],
  manualNotes: ManualNote[],
  alarmRecords: AlarmRecord[],
  newScheme: RuleScheme
): {
  events: Event[]
  evidences: Evidence[]
  threshold: ThresholdConfig
  auditLog: AuditLogEntry
  appliedPreview: RecalcPreview
} {
  const now = new Date().toISOString()

  const newSensorEvidences = detectSensorAnomalies(sensorRecords, newScheme.threshold)
  const newNoteEvidences = notesToEvidence(manualNotes)
  const newAlarmEvidences = alarmsToEvidence(alarmRecords)
  const newAllEvidences = [...newSensorEvidences, ...newNoteEvidences, ...newAlarmEvidences]
  const newMergeResult = mergeEvents(newAllEvidences, newScheme.threshold.merge_window_minutes)

  const keepManualIds = new Set(
    conflictChoices
      .filter(c => c.choice === 'keep_manual')
      .map(c => c.event_id)
  )

  const skippedBatchIds = new Set(
    conflictChoices
      .filter(c => c.choice === 'skip_batch' && c.batch_id)
      .map(c => c.batch_id!)
  )

  let finalEvents = [...newMergeResult.events]

  for (const ev of existingEvents) {
    if (keepManualIds.has(ev.id)) {
      const idx = finalEvents.findIndex(e => {
        if (e.id === ev.id) return true
        const newStart = new Date(e.start_time).getTime()
        const newEnd = new Date(e.end_time).getTime()
        const oldStart = new Date(ev.start_time).getTime()
        const oldEnd = new Date(ev.end_time).getTime()
        const overlap = Math.min(newEnd, oldEnd) - Math.max(newStart, oldStart)
        return overlap > 60000 && e.device_id === ev.device_id
      })

      if (idx !== -1) {
        finalEvents[idx] = {
          ...finalEvents[idx],
          id: ev.id,
          status: ev.status,
          handler: ev.handler,
          remark: ev.remark,
          close_time: ev.close_time,
          created_at: ev.created_at,
          updated_at: now,
        }
      }
    }
  }

  if (skippedBatchIds.size > 0) {
    const skippedRecordIds = new Set([
      ...sensorRecords.filter(r => skippedBatchIds.has(r.batch_id)).map(r => r.id),
      ...manualNotes.filter(n => skippedBatchIds.has(n.batch_id)).map(n => n.id),
      ...alarmRecords.filter(a => skippedBatchIds.has(a.batch_id)).map(a => a.id),
    ])

    const eventIdMap = new Map(finalEvents.map(e => [e.id, e]))
    const evidenceEventIds = new Set(
      newMergeResult.evidences
        .filter(e => !skippedRecordIds.has(e.id.replace('ev_', '')))
        .map(e => e.event_id)
    )

    finalEvents = finalEvents.filter(e => {
      if (keepManualIds.has(e.id)) return true
      return evidenceEventIds.has(e.id)
    })
  }

  const existingEventIds = new Set(existingEvents.map(e => e.id))
  const eventsWithSource = finalEvents.map(ev => {
    if (!existingEventIds.has(ev.id)) return ev
    const existing = existingEvents.find(e => e.id === ev.id)!
    return {
      ...ev,
      source_session_ids: existing.source_session_ids,
      source_batch_ids: existing.source_batch_ids,
    }
  })

  const auditLog: AuditLogEntry = {
    id: generateAuditLogId(),
    action_type: 'recalc_apply',
    scheme_id: newScheme.id,
    scheme_name: newScheme.name,
    metadata: {
      preview_id: preview.id,
      new_event_count: finalEvents.length,
      conflict_choices_count: conflictChoices.length,
      keep_manual_count: conflictChoices.filter(c => c.choice === 'keep_manual').length,
      recalculate_count: conflictChoices.filter(c => c.choice === 'recalculate').length,
      skip_batch_count: conflictChoices.filter(c => c.choice === 'skip_batch').length,
    },
    created_at: now,
  }

  return {
    events: eventsWithSource,
    evidences: newMergeResult.evidences,
    threshold: newScheme.threshold,
    auditLog,
    appliedPreview: { ...preview, is_applied: true },
  }
}

export function cancelRecalcPreview(
  previewId: string,
  cancelledBy?: string
): AuditLogEntry {
  const now = new Date().toISOString()
  return {
    id: generateAuditLogId(),
    action_type: 'recalc_cancel',
    metadata: {
      preview_id: previewId,
      cancelled: true,
    },
    created_at: now,
    created_by: cancelledBy,
  }
}

export function migrateEventStatesWithChoices(
  oldEvents: Event[],
  newEvents: Event[],
  conflictChoices: StateConflictChoice[]
): Event[] {
  const nonPendingOldEvents = oldEvents.filter((e) => e.status !== 'pending')

  if (nonPendingOldEvents.length === 0) {
    return newEvents
  }

  const recalcIds = new Set(
    conflictChoices
      .filter(c => c.choice === 'recalculate')
      .map(c => c.event_id)
  )

  const keepManualIds = new Set(
    conflictChoices
      .filter(c => c.choice === 'keep_manual')
      .map(c => c.event_id)
  )

  return newEvents.map((newEvent) => {
    const newStart = new Date(newEvent.start_time).getTime()
    const newEnd = new Date(newEvent.end_time).getTime()

    let bestMatch: Event | null = null
    let bestOverlap = 0

    for (const oldEvent of nonPendingOldEvents) {
      if (oldEvent.device_id !== newEvent.device_id) continue
      if (recalcIds.has(oldEvent.id)) continue

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
      const shouldKeep = keepManualIds.has(bestMatch.id) || !recalcIds.has(bestMatch.id)
      if (shouldKeep) {
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
    }

    return newEvent
  })
}
