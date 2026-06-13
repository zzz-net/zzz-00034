import {
  SensorRecord,
  ManualNote,
  AlarmRecord,
  Evidence,
  Event,
  ThresholdConfig,
  ImportBatch,
  ImportError,
  ScenePackagePreview,
  ScenePackage,
  ScenePackageReplayResult,
  ConflictDetail,
  FilePreview,
  FileType,
  ReplayMode,
  ImportSession,
  UndoSnapshot,
  ReplayConflictAnalysis,
  ConflictChoice,
  ConflictChoiceType,
  RuleScheme,
  RecalcPreview,
  StateConflictChoice,
  AuditLogEntry,
} from '../types'
import { generateId, parseSensorCSV, parseNoteCSV, parseCSV } from './csvParser'
import { parseAlarmJSON } from './jsonParser'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from './anomalyDetector'
import { mergeEvents } from './eventMerger'
import { DEFAULT_THRESHOLD, validateThresholdConfig } from './validator'

export function computeContentHash(content: string, fileName: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `${fileName}-${content.length}-${hash}`
}

export interface PreviewInputs {
  sensorContent?: string
  sensorFileName?: string
  noteContent?: string
  noteFileName?: string
  alarmContent?: string
  alarmFileName?: string
  existingSensorRecords: SensorRecord[]
  existingManualNotes: ManualNote[]
  existingAlarmRecords: AlarmRecord[]
  existingBatches: ImportBatch[]
  existingEvents: Event[]
  threshold: ThresholdConfig
}

function countRows(content: string): number {
  if (!content) return 0
  const rows = parseCSV(content)
  return Math.max(0, rows.length - 1)
}

export function generateScenePackagePreview(inputs: PreviewInputs): ScenePackagePreview {
  const packageId = generateId()
  const files: FilePreview[] = []
  const allSensorRecords: SensorRecord[] = [...inputs.existingSensorRecords]
  const allNotes: ManualNote[] = [...inputs.existingManualNotes]
  const allAlarms: AlarmRecord[] = [...inputs.existingAlarmRecords]
  const conflicts: ConflictDetail[] = []
  const fileHashes: string[] = []

  let newSensor: SensorRecord[] = []
  let newNotes: ManualNote[] = []
  let newAlarms: AlarmRecord[] = []

  if (inputs.sensorContent && inputs.sensorFileName) {
    const hash = computeContentHash(inputs.sensorContent, inputs.sensorFileName)
    fileHashes.push(hash)
    const isDuplicate = inputs.existingBatches.some(b => b.file_hash === hash)
    const parseResult = parseSensorCSV(inputs.sensorContent, inputs.sensorFileName, packageId)
    files.push({
      file_type: 'sensor',
      file_name: inputs.sensorFileName,
      file_hash: hash,
      total_rows: countRows(inputs.sensorContent),
      valid_count: parseResult.records.length,
      error_count: parseResult.errors.length,
      errors: parseResult.errors,
      is_duplicate: isDuplicate,
    })
    if (!isDuplicate) {
      newSensor = parseResult.records
      allSensorRecords.push(...parseResult.records)
    } else {
      conflicts.push({
        device_id: '',
        timestamp: '',
        existing_source: '已导入批次',
        new_source: inputs.sensorFileName,
        conflict_type: 'batch_duplicate',
        description: `传感器文件 ${inputs.sensorFileName} 已导入过`,
      })
    }
  }

  if (inputs.noteContent && inputs.noteFileName) {
    const hash = computeContentHash(inputs.noteContent, inputs.noteFileName)
    fileHashes.push(hash)
    const isDuplicate = inputs.existingBatches.some(b => b.file_hash === hash)
    const parseResult = parseNoteCSV(inputs.noteContent, inputs.noteFileName, packageId)
    files.push({
      file_type: 'note',
      file_name: inputs.noteFileName,
      file_hash: hash,
      total_rows: countRows(inputs.noteContent),
      valid_count: parseResult.records.length,
      error_count: parseResult.errors.length,
      errors: parseResult.errors,
      is_duplicate: isDuplicate,
    })
    if (!isDuplicate) {
      newNotes = parseResult.records
      allNotes.push(...parseResult.records)
    } else {
      conflicts.push({
        device_id: '',
        timestamp: '',
        existing_source: '已导入批次',
        new_source: inputs.noteFileName,
        conflict_type: 'batch_duplicate',
        description: `备注文件 ${inputs.noteFileName} 已导入过`,
      })
    }
  }

  if (inputs.alarmContent && inputs.alarmFileName) {
    const hash = computeContentHash(inputs.alarmContent, inputs.alarmFileName)
    fileHashes.push(hash)
    const isDuplicate = inputs.existingBatches.some(b => b.file_hash === hash)
    const parseResult = parseAlarmJSON(inputs.alarmContent, inputs.alarmFileName, packageId)
    let totalRows = 0
    try {
      const data = JSON.parse(inputs.alarmContent)
      if (Array.isArray(data)) totalRows = data.length
      else if (typeof data === 'object' && data !== null) {
        const obj = data as Record<string, unknown>
        if (Array.isArray(obj.data)) totalRows = obj.data.length
        else if (Array.isArray(obj.alarms)) totalRows = obj.alarms.length
        else if (Array.isArray(obj.items)) totalRows = obj.items.length
      }
    } catch { /* ignore */ }
    files.push({
      file_type: 'alarm',
      file_name: inputs.alarmFileName,
      file_hash: hash,
      total_rows: totalRows,
      valid_count: parseResult.records.length,
      error_count: parseResult.errors.length,
      errors: parseResult.errors,
      is_duplicate: isDuplicate,
    })
    if (!isDuplicate) {
      newAlarms = parseResult.records
      allAlarms.push(...parseResult.records)
    } else {
      conflicts.push({
        device_id: '',
        timestamp: '',
        existing_source: '已导入批次',
        new_source: inputs.alarmFileName,
        conflict_type: 'batch_duplicate',
        description: `告警文件 ${inputs.alarmFileName} 已导入过`,
      })
    }
  }

  const timeConflictToleranceMs = 1000
  for (const ns of newSensor) {
    for (const es of inputs.existingSensorRecords) {
      if (es.device_id === ns.device_id) {
        const diff = Math.abs(new Date(es.timestamp).getTime() - new Date(ns.timestamp).getTime())
        if (diff <= timeConflictToleranceMs) {
          conflicts.push({
            device_id: es.device_id,
            timestamp: es.timestamp,
            existing_source: es.source_file,
            new_source: ns.source_file,
            conflict_type: 'same_device_time',
            description: `设备 ${es.device_id} 在 ${es.timestamp} 已有传感器记录（时间差 ${diff}ms）`,
          })
          break
        }
      }
    }
  }
  for (const nn of newNotes) {
    for (const en of inputs.existingManualNotes) {
      if (en.device_id === nn.device_id) {
        const diff = Math.abs(new Date(en.timestamp).getTime() - new Date(nn.timestamp).getTime())
        if (diff <= timeConflictToleranceMs) {
          conflicts.push({
            device_id: en.device_id,
            timestamp: en.timestamp,
            existing_source: en.source_file,
            new_source: nn.source_file,
            conflict_type: 'same_device_time',
            description: `设备 ${en.device_id} 在 ${en.timestamp} 已有备注记录（时间差 ${diff}ms）`,
          })
          break
        }
      }
    }
  }
  for (const na of newAlarms) {
    for (const ea of inputs.existingAlarmRecords) {
      if (ea.device_id === na.device_id) {
        const diff = Math.abs(new Date(ea.timestamp).getTime() - new Date(na.timestamp).getTime())
        if (diff <= timeConflictToleranceMs) {
          conflicts.push({
            device_id: ea.device_id,
            timestamp: ea.timestamp,
            existing_source: ea.source_file,
            new_source: na.source_file,
            conflict_type: 'same_device_time',
            description: `设备 ${ea.device_id} 在 ${ea.timestamp} 已有告警记录（时间差 ${diff}ms）`,
          })
          break
        }
      }
    }
  }

  const oldSensorEvidences = detectSensorAnomalies(inputs.existingSensorRecords, inputs.threshold)
  const oldNoteEvidences = notesToEvidence(inputs.existingManualNotes)
  const oldAlarmEvidences = alarmsToEvidence(inputs.existingAlarmRecords)
  const oldAllEvidences = [...oldSensorEvidences, ...oldNoteEvidences, ...oldAlarmEvidences]
  const oldMergeResult = mergeEvents(oldAllEvidences, inputs.threshold.merge_window_minutes)
  const oldEventCount = oldMergeResult.events.length

  const allSensorEvidences = detectSensorAnomalies(allSensorRecords, inputs.threshold)
  const allNoteEvidences = notesToEvidence(allNotes)
  const allAlarmEvidences = alarmsToEvidence(allAlarms)
  const allEvidences = [...allSensorEvidences, ...allNoteEvidences, ...allAlarmEvidences]
  const newMergeResult = mergeEvents(allEvidences, inputs.threshold.merge_window_minutes)
  const newEventCount = newMergeResult.events.length

  let mergedCount = 0
  for (const newEv of newMergeResult.events) {
    for (const oldEv of inputs.existingEvents) {
      if (oldEv.device_id === newEv.device_id) {
        const newStart = new Date(newEv.start_time).getTime()
        const newEnd = new Date(newEv.end_time).getTime()
        const oldStart = new Date(oldEv.start_time).getTime()
        const oldEnd = new Date(oldEv.end_time).getTime()
        const overlap = Math.max(0, Math.min(newEnd, oldEnd) - Math.max(newStart, oldStart))
        if (overlap > 0) {
          mergedCount++
          break
        }
      }
    }
  }

  return {
    package_id: packageId,
    files,
    new_events_count: Math.max(0, newEventCount - oldEventCount),
    merged_events_count: mergedCount,
    conflicts,
    will_create_sensor_records: newSensor.length,
    will_create_note_records: newNotes.length,
    will_create_alarm_records: newAlarms.length,
    timestamp: new Date().toISOString(),
    _sensorRecords: newSensor,
    _noteRecords: newNotes,
    _alarmRecords: newAlarms,
    _fileHashes: fileHashes,
  }
}

export function exportScenePackage(
  threshold: ThresholdConfig,
  sensorRecords: SensorRecord[],
  manualNotes: ManualNote[],
  alarmRecords: AlarmRecord[],
  importBatches: ImportBatch[],
  events: Event[],
  evidences: Evidence[],
  importSessions: ImportSession[] = [],
  undoSnapshots: UndoSnapshot[] = [],
  exportedBySessionId?: string,
  ruleSchemes?: RuleScheme[],
  activeRuleSchemeId?: string,
  recalcPreviews?: RecalcPreview[],
  conflictChoices?: StateConflictChoice[],
  auditLogs?: AuditLogEntry[]
): ScenePackage {
  const activeSessions = importSessions.filter(s => s.undo_status === 'active').length
  const undoneSessions = importSessions.filter(s => s.undo_status === 'undone').length
  const activeScheme = ruleSchemes?.find(s => s.id === activeRuleSchemeId)
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    threshold: { ...threshold },
    sensor_records: sensorRecords.map(r => ({ ...r })),
    manual_notes: manualNotes.map(n => ({ ...n })),
    alarm_records: alarmRecords.map(a => ({ ...a })),
    import_batches: importBatches.map(b => ({ ...b })),
    events: events.map(e => ({ ...e })),
    evidences: evidences.map(e => ({ ...e })),
    import_sessions: importSessions.map(s => ({ ...s })),
    undo_snapshots: undoSnapshots.map(s => ({
      ...s,
      full_sensor_records: [],
      full_manual_notes: [],
      full_alarm_records: [],
      full_events: [],
      full_evidences: [],
      full_import_batches: [],
      full_sessions: [],
    })),
    active_rule_scheme: activeScheme ? { ...activeScheme } : undefined,
    rule_schemes: ruleSchemes?.map(s => ({ ...s })),
    recalc_previews: recalcPreviews?.map(p => ({ ...p })),
    conflict_choices: conflictChoices?.map(c => ({ ...c })),
    audit_logs: auditLogs?.map(l => ({ ...l })),
    _meta: {
      exported_by_session_id: exportedBySessionId,
      total_active_sessions: activeSessions,
      total_undone_sessions: undoneSessions,
      rule_scheme_count: ruleSchemes?.length || 0,
      active_rule_scheme_id: activeRuleSchemeId,
    },
  }
}

export interface ParseScenePackageResult {
  valid: boolean
  data: ScenePackage | null
  errors: string[]
}

export function parseScenePackage(content: string): ParseScenePackageResult {
  const errors: string[] = []
  let raw: unknown

  try {
    raw = JSON.parse(content)
  } catch (e) {
    return {
      valid: false,
      data: null,
      errors: ['JSON 解析失败: ' + (e instanceof Error ? e.message : String(e))],
    }
  }

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, data: null, errors: ['场景包必须是 JSON 对象'] }
  }

  const obj = raw as Record<string, unknown>

  if (obj.version !== 1) {
    errors.push(`不支持的场景包版本: ${obj.version}，仅支持 version=1`)
  }

  if (!obj.threshold || typeof obj.threshold !== 'object') {
    errors.push('缺少 threshold 字段')
  } else {
    const tv = validateThresholdConfig(obj.threshold as ThresholdConfig)
    if (!tv.valid) {
      errors.push('阈值配置无效: ' + tv.errors.map(e => `${e.field}: ${e.message}`).join('; '))
    }
  }

  const requiredArrays: Array<[string, string, (item: unknown) => boolean]> = [
    ['sensor_records', 'SensorRecord', (i: unknown) =>
      typeof i === 'object' && i !== null &&
      'device_id' in (i as Record<string, unknown>) &&
      'timestamp' in (i as Record<string, unknown>)],
    ['manual_notes', 'ManualNote', (i: unknown) =>
      typeof i === 'object' && i !== null &&
      'device_id' in (i as Record<string, unknown>) &&
      'content' in (i as Record<string, unknown>)],
    ['alarm_records', 'AlarmRecord', (i: unknown) =>
      typeof i === 'object' && i !== null &&
      'device_id' in (i as Record<string, unknown>) &&
      'alarm_type' in (i as Record<string, unknown>)],
    ['import_batches', 'ImportBatch', (i: unknown) =>
      typeof i === 'object' && i !== null &&
      'id' in (i as Record<string, unknown>) &&
      'file_type' in (i as Record<string, unknown>)],
    ['events', 'Event', (i: unknown) =>
      typeof i === 'object' && i !== null &&
      'device_id' in (i as Record<string, unknown>) &&
      'status' in (i as Record<string, unknown>)],
    ['evidences', 'Evidence', (i: unknown) =>
      typeof i === 'object' && i !== null &&
      'type' in (i as Record<string, unknown>) &&
      'device_id' in (i as Record<string, unknown>)],
  ]

  for (const [key, itemName, validator] of requiredArrays) {
    if (!Array.isArray(obj[key])) {
      errors.push(`缺少 ${key} 数组`)
    } else {
      const arr = obj[key] as unknown[]
      for (let i = 0; i < arr.length; i++) {
        if (!validator(arr[i])) {
          errors.push(`${key}[${i}] 不是有效的 ${itemName}`)
          if (errors.length > 50) break
        }
      }
    }
  }

  if (!Array.isArray(obj.import_sessions)) {
    obj.import_sessions = []
  }
  if (!Array.isArray(obj.undo_snapshots)) {
    obj.undo_snapshots = []
  }
  if (!Array.isArray(obj.rule_schemes)) {
    obj.rule_schemes = []
  }
  if (!Array.isArray(obj.recalc_previews)) {
    obj.recalc_previews = []
  }
  if (!Array.isArray(obj.conflict_choices)) {
    obj.conflict_choices = []
  }
  if (!Array.isArray(obj.audit_logs)) {
    obj.audit_logs = []
  }

  if (errors.length > 0) {
    return { valid: false, data: null, errors }
  }

  const data = raw as ScenePackage
  if (!data.import_sessions) data.import_sessions = []
  if (!data.undo_snapshots) data.undo_snapshots = []
  if (!data.rule_schemes) data.rule_schemes = []
  if (!data.recalc_previews) data.recalc_previews = []
  if (!data.conflict_choices) data.conflict_choices = []
  if (!data.audit_logs) data.audit_logs = []

  return {
    valid: true,
    data,
    errors: [],
  }
}

export function replayScenePackage(
  pkg: ScenePackage,
  mode: ReplayMode,
  currentSensorRecords: SensorRecord[],
  currentManualNotes: ManualNote[],
  currentAlarmRecords: AlarmRecord[],
  currentBatches: ImportBatch[],
  currentEvents: Event[],
  currentEvidences: Evidence[],
  currentRuleSchemes: RuleScheme[] = [],
  currentRecalcPreviews: RecalcPreview[] = [],
  currentConflictChoices: StateConflictChoice[] = [],
  currentAuditLogs: AuditLogEntry[] = []
): {
  result: ScenePackageReplayResult
  sensorRecords: SensorRecord[]
  manualNotes: ManualNote[]
  alarmRecords: AlarmRecord[]
  batches: ImportBatch[]
  events: Event[]
  evidences: Evidence[]
  threshold: ThresholdConfig
  ruleSchemes: RuleScheme[]
  activeRuleSchemeId: string | null
  recalcPreviews: RecalcPreview[]
  conflictChoices: StateConflictChoice[]
  auditLogs: AuditLogEntry[]
} {
  const errors: string[] = []
  let skippedBatches = 0
  let skippedEvents = 0
  let mergedEvents = 0
  let overwrittenEvents = 0
  const importedBatches: ImportBatch[] = []

  const pkgRuleSchemes = pkg.rule_schemes || []
  const pkgActiveScheme = pkg.active_rule_scheme
  const pkgRecalcPreviews = pkg.recalc_previews || []
  const pkgConflictChoices = pkg.conflict_choices || []
  const pkgAuditLogs = pkg.audit_logs || []

  let mergedRuleSchemes: RuleScheme[] = []
  let activeSchemeId: string | null = null

  if (mode === 'overwrite') {
    mergedRuleSchemes = pkgRuleSchemes
    activeSchemeId = pkgActiveScheme?.id || null
  } else {
    const existingSchemeIds = new Set(currentRuleSchemes.map(s => s.id))
    mergedRuleSchemes = [...currentRuleSchemes]
    for (const scheme of pkgRuleSchemes) {
      if (!existingSchemeIds.has(scheme.id)) {
        mergedRuleSchemes.push(scheme)
      }
    }
    const currentActive = currentRuleSchemes.find(s => s.is_active)
    activeSchemeId = currentActive?.id || null
  }

  if (mode === 'overwrite') {
    return {
      result: {
        success: true,
        mode: 'overwrite',
        skipped_batches: 0,
        skipped_events: 0,
        merged_events: 0,
        overwritten_events: pkg.events.length,
        errors: [],
        imported_batches: pkg.import_batches,
      },
      sensorRecords: [...pkg.sensor_records],
      manualNotes: [...pkg.manual_notes],
      alarmRecords: [...pkg.alarm_records],
      batches: [...pkg.import_batches],
      events: [...pkg.events],
      evidences: [...pkg.evidences],
      threshold: { ...pkg.threshold },
      ruleSchemes: mergedRuleSchemes,
      activeRuleSchemeId: activeSchemeId,
      recalcPreviews: [...pkgRecalcPreviews],
      conflictChoices: [...pkgConflictChoices],
      auditLogs: [...pkgAuditLogs],
    }
  }

  let sensorRecords = [...currentSensorRecords]
  let manualNotes = [...currentManualNotes]
  let alarmRecords = [...currentAlarmRecords]
  let batches = [...currentBatches]
  let events = [...currentEvents]
  let evidences = [...currentEvidences]

  const existingBatchHashes = new Set(batches.map(b => b.file_hash))
  for (const batch of pkg.import_batches) {
    if (existingBatchHashes.has(batch.file_hash)) {
      skippedBatches++
      if (mode === 'skip') {
        errors.push(`跳过已存在批次: ${batch.file_name}`)
      }
    } else {
      batches.push(batch)
      importedBatches.push(batch)
      existingBatchHashes.add(batch.file_hash)
    }
  }

  const existingSensorIds = new Set(currentSensorRecords.map(r => r.id))
  const existingNoteIds = new Set(currentManualNotes.map(n => n.id))
  const existingAlarmIds = new Set(currentAlarmRecords.map(a => a.id))

  for (const r of pkg.sensor_records) {
    if (!existingSensorIds.has(r.id)) {
      sensorRecords.push(r)
      existingSensorIds.add(r.id)
    }
  }
  for (const n of pkg.manual_notes) {
    if (!existingNoteIds.has(n.id)) {
      manualNotes.push(n)
      existingNoteIds.add(n.id)
    }
  }
  for (const a of pkg.alarm_records) {
    if (!existingAlarmIds.has(a.id)) {
      alarmRecords.push(a)
      existingAlarmIds.add(a.id)
    }
  }

  const existingEventIds = new Set(currentEvents.map(e => e.id))
  for (const ev of pkg.events) {
    if (existingEventIds.has(ev.id)) {
      if (mode === 'merge') {
        const idx = events.findIndex(e => e.id === ev.id)
        if (idx !== -1) {
          const existing = events[idx]
          if (existing.status === 'pending' || ev.status !== 'pending') {
            events[idx] = {
              ...ev,
              handler: ev.handler || existing.handler,
              remark: ev.remark || existing.remark,
            }
            mergedEvents++
          } else {
            skippedEvents++
          }
        }
      } else {
        skippedEvents++
        errors.push(`跳过已存在事件: ${ev.device_id} ${ev.start_time}`)
      }
    } else {
      events.push(ev)
      existingEventIds.add(ev.id)
    }
  }

  const existingEvidenceIds = new Set(currentEvidences.map(e => e.id))
  for (const ev of pkg.evidences) {
    if (!existingEvidenceIds.has(ev.id)) {
      evidences.push(ev)
      existingEvidenceIds.add(ev.id)
    }
  }

  const threshold = validateThresholdConfig(pkg.threshold).valid ? pkg.threshold : { ...DEFAULT_THRESHOLD }

  const mergedRecalcPreviews = [...currentRecalcPreviews]
  const existingPreviewIds = new Set(currentRecalcPreviews.map(p => p.id))
  for (const p of pkgRecalcPreviews) {
    if (!existingPreviewIds.has(p.id)) {
      mergedRecalcPreviews.push(p)
    }
  }

  const mergedConflictChoices = [...currentConflictChoices]
  const existingChoiceKeys = new Set(currentConflictChoices.map(c => `${c.conflict_id}_${c.choice}`))
  for (const c of pkgConflictChoices) {
    const key = `${c.conflict_id}_${c.choice}`
    if (!existingChoiceKeys.has(key)) {
      mergedConflictChoices.push(c)
    }
  }

  const mergedAuditLogs = [...currentAuditLogs]
  const existingAuditIds = new Set(currentAuditLogs.map(l => l.id))
  for (const l of pkgAuditLogs) {
    if (!existingAuditIds.has(l.id)) {
      mergedAuditLogs.push(l)
    }
  }

  return {
    result: {
      success: true,
      mode,
      skipped_batches: skippedBatches,
      skipped_events: skippedEvents,
      merged_events: mergedEvents,
      overwritten_events: overwrittenEvents,
      errors,
      imported_batches: importedBatches,
    },
    sensorRecords,
    manualNotes,
    alarmRecords,
    batches,
    events,
    evidences,
    threshold: validateThresholdConfig(pkg.threshold).valid ? pkg.threshold : { ...DEFAULT_THRESHOLD },
    ruleSchemes: mergedRuleSchemes,
    activeRuleSchemeId: activeSchemeId,
    recalcPreviews: mergedRecalcPreviews,
    conflictChoices: mergedConflictChoices,
    auditLogs: mergedAuditLogs,
  }
}

export function analyzeReplayConflicts(
  pkg: ScenePackage,
  currentSensorRecords: SensorRecord[],
  currentManualNotes: ManualNote[],
  currentAlarmRecords: AlarmRecord[],
  currentBatches: ImportBatch[],
  currentThreshold: ThresholdConfig,
  existingSessions: ImportSession[]
): ReplayConflictAnalysis {
  const sameDeviceTimeConflicts: ConflictDetail[] = []
  const batchDuplicates: ConflictDetail[] = []
  const undoneSessions: Array<{ session_id: string; conflict_description: string }> = []
  const choicesNeeded: ConflictChoice[] = []

  const timeConflictToleranceMs = 1000

  for (const nr of pkg.sensor_records) {
    for (const er of currentSensorRecords) {
      if (er.device_id === nr.device_id) {
        const diff = Math.abs(new Date(er.timestamp).getTime() - new Date(nr.timestamp).getTime())
        if (diff <= timeConflictToleranceMs) {
          sameDeviceTimeConflicts.push({
            device_id: er.device_id,
            timestamp: er.timestamp,
            existing_source: er.source_file,
            new_source: nr.source_file,
            conflict_type: 'same_device_time',
            description: `设备 ${er.device_id} 在 ${er.timestamp.slice(0, 19)} 已有传感器记录（时间差 ${diff}ms）`,
            existing_session_id: er.session_id,
            new_session_id: nr.session_id,
          })
          break
        }
      }
    }
  }

  for (const nn of pkg.manual_notes) {
    for (const en of currentManualNotes) {
      if (en.device_id === nn.device_id) {
        const diff = Math.abs(new Date(en.timestamp).getTime() - new Date(nn.timestamp).getTime())
        if (diff <= timeConflictToleranceMs) {
          sameDeviceTimeConflicts.push({
            device_id: en.device_id,
            timestamp: en.timestamp,
            existing_source: en.source_file,
            new_source: nn.source_file,
            conflict_type: 'same_device_time',
            description: `设备 ${en.device_id} 在 ${en.timestamp.slice(0, 19)} 已有备注记录（时间差 ${diff}ms）`,
            existing_session_id: en.session_id,
            new_session_id: nn.session_id,
          })
          break
        }
      }
    }
  }

  for (const na of pkg.alarm_records) {
    for (const ea of currentAlarmRecords) {
      if (ea.device_id === na.device_id) {
        const diff = Math.abs(new Date(ea.timestamp).getTime() - new Date(na.timestamp).getTime())
        if (diff <= timeConflictToleranceMs) {
          sameDeviceTimeConflicts.push({
            device_id: ea.device_id,
            timestamp: ea.timestamp,
            existing_source: ea.source_file,
            new_source: na.source_file,
            conflict_type: 'same_device_time',
            description: `设备 ${ea.device_id} 在 ${ea.timestamp.slice(0, 19)} 已有告警记录（时间差 ${diff}ms）`,
            existing_session_id: ea.session_id,
            new_session_id: na.session_id,
          })
          break
        }
      }
    }
  }

  const existingBatchHashes = new Set(currentBatches.map(b => b.file_hash))
  for (const batch of pkg.import_batches) {
    if (existingBatchHashes.has(batch.file_hash)) {
      batchDuplicates.push({
        device_id: '',
        timestamp: '',
        existing_source: '本地已导入批次',
        new_source: batch.file_name,
        conflict_type: 'batch_duplicate',
        description: `批次 ${batch.file_name} (${batch.record_count} 条记录) 已在本地存在`,
        existing_session_id: currentBatches.find(b => b.file_hash === batch.file_hash)?.session_id,
        new_session_id: batch.session_id,
      })
    }
  }

  if (pkg.import_sessions) {
    for (const pkgSession of pkg.import_sessions) {
      if (pkgSession.undo_status === 'undone') {
        const existsLocal = existingSessions.some(s => s.package_id === pkgSession.package_id && s.undo_status === 'undone')
        undoneSessions.push({
          session_id: pkgSession.id,
          conflict_description: existsLocal
            ? `会话 ${pkgSession.id.slice(0, 10)}... 在本地和场景包中都已标记撤销`
            : `会话 ${pkgSession.id.slice(0, 10)}... 在场景包中已撤销，本地未标记`,
        })
      }
    }
  }

  const thresholdFields: Array<keyof ThresholdConfig> = [
    'temp_min', 'temp_max', 'voltage_min', 'voltage_max',
    'offline_duration_min', 'merge_window_minutes',
  ]
  const thresholdDiff: ReplayConflictAnalysis['threshold_diff'] = (() => {
    const differences: Array<{ field: string; current: number | string; imported: number | string }> = []
    for (const f of thresholdFields) {
      const cv = currentThreshold[f]
      const iv = pkg.threshold[f]
      if (cv !== iv) {
        differences.push({ field: f, current: cv, imported: iv })
      }
    }
    if (differences.length === 0) return null
    return {
      current: { ...currentThreshold },
      imported: { ...pkg.threshold },
      differences,
    }
  })()

  for (const c of sameDeviceTimeConflicts.slice(0, 10)) {
    const key = `${c.conflict_type}:${c.device_id}:${c.timestamp}`
    choicesNeeded.push({
      conflict_type: 'same_device_time',
      key,
      device_id: c.device_id,
      timestamp: c.timestamp,
      existing_source: c.existing_source,
      new_source: c.new_source,
      choice: 'keep_both',
      description: c.description,
    })
  }

  for (const b of batchDuplicates.slice(0, 10)) {
    const key = `${b.conflict_type}:${b.new_source}`
    choicesNeeded.push({
      conflict_type: 'batch_duplicate',
      key,
      existing_source: b.existing_source,
      new_source: b.new_source,
      choice: 'skip',
      description: b.description,
    })
  }

  if (thresholdDiff) {
    for (const d of thresholdDiff.differences) {
      choicesNeeded.push({
        conflict_type: 'threshold_diff',
        key: `threshold:${d.field}`,
        existing_source: `当前: ${d.current}`,
        new_source: `导入: ${d.imported}`,
        choice: 'merge',
        description: `阈值字段 ${d.field} 不一致（当前: ${d.current}，导入: ${d.imported}）`,
      })
    }
  }

  return {
    same_device_time_conflicts: sameDeviceTimeConflicts,
    batch_duplicates: batchDuplicates,
    undone_sessions: undoneSessions,
    threshold_diff: thresholdDiff,
    total_conflicts: sameDeviceTimeConflicts.length + batchDuplicates.length + undoneSessions.length + (thresholdDiff ? thresholdDiff.differences.length : 0),
    choices_needed: choicesNeeded,
  }
}
