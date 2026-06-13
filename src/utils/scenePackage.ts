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
  evidences: Evidence[]
): ScenePackage {
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

  if (errors.length > 0) {
    return { valid: false, data: null, errors }
  }

  return {
    valid: true,
    data: raw as ScenePackage,
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
  currentEvidences: Evidence[]
): {
  result: ScenePackageReplayResult
  sensorRecords: SensorRecord[]
  manualNotes: ManualNote[]
  alarmRecords: AlarmRecord[]
  batches: ImportBatch[]
  events: Event[]
  evidences: Evidence[]
  threshold: ThresholdConfig
} {
  const errors: string[] = []
  let skippedBatches = 0
  let skippedEvents = 0
  let mergedEvents = 0
  let overwrittenEvents = 0
  const importedBatches: ImportBatch[] = []

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
  }
}
