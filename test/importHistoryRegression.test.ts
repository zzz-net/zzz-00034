import {
  generateScenePackagePreview,
  exportScenePackage,
  parseScenePackage,
  replayScenePackage,
  computeContentHash,
} from '../src/utils/scenePackage'
import { parseSensorCSV, parseNoteCSV, generateId } from '../src/utils/csvParser'
import { parseAlarmJSON } from '../src/utils/jsonParser'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from '../src/utils/anomalyDetector'
import { mergeEvents } from '../src/utils/eventMerger'
import { DEFAULT_THRESHOLD } from '../src/utils/validator'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  SensorRecord,
  ManualNote,
  AlarmRecord,
  ImportBatch,
  Event,
  Evidence,
  ThresholdConfig,
  EventStatus,
  ScenePackage,
  ConflictDetail,
  ReplayMode,
} from '../src/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const errors: string[] = []

function assert(condition: boolean, message: string) {
  if (!condition) {
    errors.push('❌ ' + message)
    console.error('❌ 测试失败:', message)
  } else {
    console.log('✅', message)
  }
}

const sensorCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'sensor_data.csv')
const noteCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'manual_notes.csv')
const alarmJsonPath = path.join(__dirname, '..', 'public', 'sample_data', 'alarm_data.json')

const sensorCsvContent = fs.readFileSync(sensorCsvPath, 'utf-8')
const noteCsvContent = fs.readFileSync(noteCsvPath, 'utf-8')
const alarmJsonContent = fs.readFileSync(alarmJsonPath, 'utf-8')

function simulateApplyScenePackage(
  preview: {
    package_id: string
    files: { file_type: string; file_name: string; valid_count: number; error_count: number; errors: any[]; file_hash: string; is_duplicate: boolean }[]
    conflicts: ConflictDetail[]
    new_events_count: number
    merged_events_count: number
    _sensorRecords: SensorRecord[]
    _noteRecords: ManualNote[]
    _alarmRecords: AlarmRecord[]
  },
  existingEvents: Event[]
): ImportBatch[] {
  const now = new Date().toISOString()

  const batchConflicts = preview.conflicts.filter(c => c.conflict_type === 'batch_duplicate')
  const sameDeviceConflicts = preview.conflicts.filter(c => c.conflict_type === 'same_device_time')

  const affectedEventIds: string[] = []
  for (const oldEv of existingEvents) {
    for (const newRec of [...preview._sensorRecords, ...preview._noteRecords, ...preview._alarmRecords]) {
      if (oldEv.device_id === newRec.device_id) {
        const oldStart = new Date(oldEv.start_time).getTime()
        const oldEnd = new Date(oldEv.end_time).getTime()
        const ts = new Date(newRec.timestamp).getTime()
        if (ts >= oldStart && ts <= oldEnd) {
          affectedEventIds.push(oldEv.id)
          break
        }
      }
    }
  }

  const resolutionParts: string[] = []
  if (batchConflicts.length > 0) resolutionParts.push(`${batchConflicts.length} 个重复批次已跳过`)
  if (sameDeviceConflicts.length > 0) resolutionParts.push(`${sameDeviceConflicts.length} 处同设备同时间冲突已记录（数据正常写入）`)
  if (preview.new_events_count > 0) resolutionParts.push(`新增 ${preview.new_events_count} 个事件`)
  if (preview.merged_events_count > 0) resolutionParts.push(`合并 ${preview.merged_events_count} 个事件`)
  const resolutionSummary = resolutionParts.length > 0 ? resolutionParts.join('；') : '无冲突，全部正常导入'

  const newBatches: ImportBatch[] = []
  for (const fp of preview.files) {
    if (fp.is_duplicate) continue
    newBatches.push({
      id: preview.package_id + '-' + fp.file_type,
      file_type: fp.file_type as any,
      file_name: fp.file_name,
      import_time: now,
      record_count: fp.valid_count,
      error_count: fp.error_count,
      errors: fp.errors,
      file_hash: fp.file_hash,
      conflicts: preview.conflicts.length > 0 ? preview.conflicts : undefined,
      resolution_summary: resolutionSummary,
      affected_event_ids: affectedEventIds.length > 0 ? affectedEventIds : undefined,
    })
  }
  return newBatches
}

function simulateReplayBatch(
  pkg: ScenePackage,
  mode: ReplayMode,
  replayResult: {
    skipped_batches: number
    skipped_events: number
    merged_events: number
    overwritten_events: number
    errors: string[]
    imported_batches: ImportBatch[]
  },
  existingBatches: ImportBatch[],
  existingEvents: Event[]
): ImportBatch {
  const modeText: Record<ReplayMode, string> = { overwrite: '覆盖', merge: '合并', skip: '跳过' }

  const affectedEventIds: string[] = []
  if (mode === 'overwrite') {
    affectedEventIds.push(...existingEvents.map(e => e.id))
  } else if (mode === 'merge') {
    for (const oldEv of existingEvents) {
      for (const newEv of pkg.events) {
        if (oldEv.id === newEv.id) {
          affectedEventIds.push(oldEv.id)
          break
        }
      }
    }
  }

  const conflicts: ConflictDetail[] = []
  for (const batch of pkg.import_batches) {
    if (existingBatches.some(b => b.file_hash === batch.file_hash)) {
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

  const resolutionParts: string[] = []
  if (replayResult.skipped_batches > 0) resolutionParts.push(`${replayResult.skipped_batches} 个重复批次已跳过`)
  if (replayResult.skipped_events > 0) resolutionParts.push(`${replayResult.skipped_events} 个重复事件已跳过`)
  if (replayResult.merged_events > 0) resolutionParts.push(`${replayResult.merged_events} 个事件已合并`)
  if (replayResult.overwritten_events > 0) resolutionParts.push(`${replayResult.overwritten_events} 个事件已覆盖`)
  if (replayResult.errors.length > 0) resolutionParts.push(`${replayResult.errors.length} 条提示信息`)
  const resolutionSummary = resolutionParts.length > 0 ? resolutionParts.join('；') : `${modeText[mode]}回放成功，无冲突`

  return {
    id: generateId() + '-replay',
    file_type: 'sensor',
    file_name: `回放-${modeText[mode]}-${new Date().toLocaleString('zh-CN')}`,
    import_time: new Date().toISOString(),
    record_count: replayResult.imported_batches.reduce((s, b) => s + b.record_count, 0),
    error_count: replayResult.errors.length,
    errors: replayResult.errors.map((msg, i) => ({ row: 0, field: 'replay', value: '', message: msg })),
    file_hash: `replay-${mode}-${pkg.exported_at}`,
    conflicts: conflicts.length > 0 ? conflicts : undefined,
    replay_mode: mode,
    resolution_summary: resolutionSummary,
    affected_event_ids: affectedEventIds.length > 0 ? affectedEventIds : undefined,
  }
}

async function runTests() {
  console.log('=== 导入历史持久化回归测试 ===\n')

  console.log('\n--- Test 1: 场景包确认写入后批次包含冲突明细 ---')
  {
    const preview = generateScenePackagePreview({
      sensorContent: sensorCsvContent,
      sensorFileName: 'sensor_data.csv',
      noteContent: noteCsvContent,
      noteFileName: 'manual_notes.csv',
      alarmContent: alarmJsonContent,
      alarmFileName: 'alarm_data.json',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })

    const batches = simulateApplyScenePackage(preview, [])
    assert(batches.length > 0, '场景包导入产生批次记录')
    for (const batch of batches) {
      assert(batch.resolution_summary !== undefined, `批次 ${batch.file_name} 包含 resolution_summary`)
      assert(typeof batch.resolution_summary === 'string', 'resolution_summary 是字符串')
    }
    const firstBatch = batches[0]
    assert(firstBatch.resolution_summary!.includes('新增'), `首次导入 summary 包含新增事件: "${firstBatch.resolution_summary}"`)
    assert(firstBatch.conflicts === undefined, '首次导入无冲突，conflicts 为 undefined')
  }

  console.log('\n--- Test 2: 重复批次确认写入后批次包含 batch_duplicate 冲突 ---')
  {
    const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', 'test-pkg')
    const existingBatch: ImportBatch = {
      id: 'existing-batch',
      file_type: 'sensor',
      file_name: 'sensor_data.csv',
      import_time: new Date().toISOString(),
      record_count: sensorResult.records.length,
      error_count: 0,
      errors: [],
      file_hash: computeContentHash(sensorCsvContent, 'sensor_data.csv'),
    }

    const preview = generateScenePackagePreview({
      sensorContent: sensorCsvContent,
      sensorFileName: 'sensor_data.csv',
      noteContent: noteCsvContent,
      noteFileName: 'manual_notes.csv',
      existingSensorRecords: sensorResult.records,
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [existingBatch],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })

    const batches = simulateApplyScenePackage(preview, [])
    assert(preview.conflicts.some(c => c.conflict_type === 'batch_duplicate'),
      '预览中检测到 batch_duplicate')

    for (const batch of batches) {
      assert(batch.conflicts !== undefined, `批次 ${batch.file_name} conflicts 字段存在`)
      assert(batch.conflicts!.some(c => c.conflict_type === 'batch_duplicate'),
        `批次 ${batch.file_name} 包含 batch_duplicate 冲突明细`)
      assert(batch.resolution_summary!.includes('重复批次已跳过'),
        `resolution_summary 包含跳过信息: "${batch.resolution_summary}"`)
    }
  }

  console.log('\n--- Test 3: same_device_time 冲突确认写入后可追溯 ---')
  {
    const existingSensor: SensorRecord[] = [{
      id: 'existing-sensor-1',
      device_id: 'DEV-001',
      timestamp: '2024-01-15T08:00:00.000Z',
      temperature: 80,
      voltage: 220,
      is_online: true,
      source_file: 'old.csv',
      batch_id: 'old-batch',
    }]
    const conflictCsv = `device_id,timestamp,temperature,voltage,is_online
DEV-001,2024-01-15T08:00:00.000Z,85,220,true`
    const preview = generateScenePackagePreview({
      sensorContent: conflictCsv,
      sensorFileName: 'conflict_sensor.csv',
      existingSensorRecords: existingSensor,
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })

    assert(preview.conflicts.some(c => c.conflict_type === 'same_device_time'),
      '预览检测到 same_device_time 冲突')

    const batches = simulateApplyScenePackage(preview, [])
    assert(batches.length > 0, '产生批次')
    const batch = batches[0]
    assert(batch.conflicts !== undefined, '批次包含 conflicts 字段')
    assert(batch.conflicts!.some(c => c.conflict_type === 'same_device_time'),
      '批次 conflicts 包含 same_device_time')
    assert(batch.resolution_summary!.includes('同设备同时间冲突已记录'),
      `resolution_summary 包含冲突信息: "${batch.resolution_summary}"`)
  }

  console.log('\n--- Test 4: 跨重启恢复 — 序列化/反序列化后冲突明细不丢失 ---')
  {
    const preview = generateScenePackagePreview({
      sensorContent: sensorCsvContent,
      sensorFileName: 'sensor_data.csv',
      noteContent: noteCsvContent,
      noteFileName: 'manual_notes.csv',
      alarmContent: alarmJsonContent,
      alarmFileName: 'alarm_data.json',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })

    const batches = simulateApplyScenePackage(preview, [])
    const serialized = JSON.stringify({ importBatches: batches })
    const restored = JSON.parse(serialized) as { importBatches: ImportBatch[] }

    assert(restored.importBatches.length === batches.length,
      '序列化/反序列化后批次数不变')
    for (let i = 0; i < batches.length; i++) {
      const orig = batches[i]
      const rest = restored.importBatches[i]
      assert(rest.resolution_summary === orig.resolution_summary,
        `批次 ${orig.file_name}: resolution_summary 跨重启一致`)
      assert(JSON.stringify(rest.conflicts) === JSON.stringify(orig.conflicts),
        `批次 ${orig.file_name}: conflicts 跨重启一致`)
      assert(JSON.stringify(rest.affected_event_ids) === JSON.stringify(orig.affected_event_ids),
        `批次 ${orig.file_name}: affected_event_ids 跨重启一致`)
    }
  }

  console.log('\n--- Test 5: 回放批次记录包含 replay_mode ---')
  {
    const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', 'test-pkg')
    const noteResult = parseNoteCSV(noteCsvContent, 'manual_notes.csv', 'test-pkg')
    const alarmResult = parseAlarmJSON(alarmJsonContent, 'alarm_data.json', 'test-pkg')

    const testThreshold: ThresholdConfig = { ...DEFAULT_THRESHOLD }
    const allSensor = detectSensorAnomalies(sensorResult.records, testThreshold)
    const allNotes = notesToEvidence(noteResult.records)
    const allAlarms = alarmsToEvidence(alarmResult.records)
    const allEv = [...allSensor, ...allNotes, ...allAlarms]
    const mergeResult = mergeEvents(allEv, testThreshold.merge_window_minutes)
    const testEvents: Event[] = mergeResult.events
    const testEvidences: Evidence[] = mergeResult.evidences

    const testBatches: ImportBatch[] = [{
      id: 'batch-1',
      file_type: 'sensor',
      file_name: 'sensor_data.csv',
      import_time: new Date().toISOString(),
      record_count: sensorResult.records.length,
      error_count: 0,
      errors: [],
      file_hash: computeContentHash(sensorCsvContent, 'sensor_data.csv'),
    }]

    const pkg = exportScenePackage(
      testThreshold,
      sensorResult.records,
      noteResult.records,
      alarmResult.records,
      testBatches,
      testEvents,
      testEvidences
    )

    const mergeReplay = replayScenePackage(
      pkg, 'merge',
      sensorResult.records,
      noteResult.records,
      alarmResult.records,
      testBatches,
      testEvents,
      testEvidences
    )

    const replayBatch = simulateReplayBatch(pkg, 'merge', mergeReplay.result, testBatches, testEvents)

    assert(replayBatch.replay_mode === 'merge', '回放批次 replay_mode 为 merge')
    assert(replayBatch.resolution_summary !== undefined, '回放批次包含 resolution_summary')
    assert(typeof replayBatch.resolution_summary === 'string', 'resolution_summary 是字符串')
    assert(replayBatch.file_name.includes('合并'), '回放批次文件名包含策略名')
  }

  console.log('\n--- Test 6: skip 回放批次包含冲突和跳过信息 ---')
  {
    const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', 'test-pkg')
    const noteResult = parseNoteCSV(noteCsvContent, 'manual_notes.csv', 'test-pkg')
    const alarmResult = parseAlarmJSON(alarmJsonContent, 'alarm_data.json', 'test-pkg')

    const testThreshold: ThresholdConfig = { ...DEFAULT_THRESHOLD }
    const allSensor = detectSensorAnomalies(sensorResult.records, testThreshold)
    const allNotes = notesToEvidence(noteResult.records)
    const allAlarms = alarmsToEvidence(alarmResult.records)
    const mergeResult = mergeEvents([...allSensor, ...allNotes, ...allAlarms], testThreshold.merge_window_minutes)

    const existingBatches: ImportBatch[] = [{
      id: 'batch-existing',
      file_type: 'sensor',
      file_name: 'sensor_data.csv',
      import_time: new Date().toISOString(),
      record_count: sensorResult.records.length,
      error_count: 0,
      errors: [],
      file_hash: computeContentHash(sensorCsvContent, 'sensor_data.csv'),
    }]

    const pkg = exportScenePackage(
      testThreshold,
      sensorResult.records,
      noteResult.records,
      alarmResult.records,
      existingBatches,
      mergeResult.events,
      mergeResult.evidences
    )

    const skipReplay = replayScenePackage(
      pkg, 'skip',
      sensorResult.records, noteResult.records, alarmResult.records,
      existingBatches,
      mergeResult.events.slice(0, 1),
      mergeResult.evidences
    )

    const replayBatch = simulateReplayBatch(pkg, 'skip', skipReplay.result, existingBatches, mergeResult.events)

    assert(replayBatch.replay_mode === 'skip', 'skip 回放批次 replay_mode 为 skip')
    assert(skipReplay.result.skipped_batches > 0, 'skip 模式跳过重复批次')
    assert(replayBatch.resolution_summary!.includes('跳过'), 'resolution_summary 包含跳过信息')
    assert(replayBatch.conflicts !== undefined, 'skip 回放批次包含 conflicts')
    assert(replayBatch.conflicts!.some(c => c.conflict_type === 'batch_duplicate'),
      'skip 回放 conflicts 包含 batch_duplicate')
  }

  console.log('\n--- Test 7: overwrite 回放批次包含 affected_event_ids ---')
  {
    const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', 'test-pkg')
    const noteResult = parseNoteCSV(noteCsvContent, 'manual_notes.csv', 'test-pkg')
    const alarmResult = parseAlarmJSON(alarmJsonContent, 'alarm_data.json', 'test-pkg')
    const testThreshold: ThresholdConfig = { ...DEFAULT_THRESHOLD }
    const allSensor = detectSensorAnomalies(sensorResult.records, testThreshold)
    const allNotes = notesToEvidence(noteResult.records)
    const allAlarms = alarmsToEvidence(alarmResult.records)
    const mergeResult = mergeEvents([...allSensor, ...allNotes, ...allAlarms], testThreshold.merge_window_minutes)

    const pkg = exportScenePackage(
      testThreshold,
      sensorResult.records,
      noteResult.records,
      alarmResult.records,
      [],
      mergeResult.events,
      mergeResult.evidences
    )

    const existingEvents: Event[] = mergeResult.events.slice(0, 2).map(e => ({ ...e }))
    const overwriteReplay = replayScenePackage(
      pkg, 'overwrite',
      [], [], [], [], existingEvents, []
    )

    const replayBatch = simulateReplayBatch(pkg, 'overwrite', overwriteReplay.result, [], existingEvents)

    assert(replayBatch.replay_mode === 'overwrite', 'overwrite 回放批次 replay_mode')
    assert(replayBatch.affected_event_ids !== undefined, 'overwrite 回放批次包含 affected_event_ids')
    assert(replayBatch.affected_event_ids!.length === existingEvents.length,
      `overwrite affected_event_ids 数量 = 原有事件数 (${replayBatch.affected_event_ids!.length}/${existingEvents.length})`)
    assert(replayBatch.resolution_summary!.includes('覆盖'), 'resolution_summary 包含覆盖信息')
  }

  console.log('\n--- Test 8: 坏 JSON 解析不产生批次记录 ---')
  {
    const parseBad = parseScenePackage('{ not valid json }')
    assert(parseBad.valid === false, '坏 JSON 解析失败')
    assert(parseBad.data === null, '坏 JSON 不产生数据')
    assert(parseBad.errors.length > 0, '坏 JSON 有错误报告')

    let batchCreated = false
    if (parseBad.data) {
      batchCreated = true
    }
    assert(!batchCreated, '坏 JSON 不产生批次记录')
  }

  console.log('\n--- Test 9: 缺字段场景包解析不产生批次记录 ---')
  {
    const incomplete = { version: 1, exported_at: new Date().toISOString() }
    const parseResult = parseScenePackage(JSON.stringify(incomplete))
    assert(parseResult.valid === false, '缺字段解析失败')
    assert(parseResult.data === null, '缺字段不产生数据')
    assert(parseResult.errors.some(e => e.includes('threshold') || e.includes('sensor_records')),
      '错误信息指出缺失字段')
  }

  console.log('\n--- Test 10: 完整闭环 — 导出含冲突批次 → 序列化 → 反序列化 → 冲突可见 ---')
  {
    const existingSensor: SensorRecord[] = [{
      id: 'existing-sensor-1',
      device_id: 'DEV-001',
      timestamp: '2024-01-15T08:00:00.000Z',
      temperature: 80,
      voltage: 220,
      is_online: true,
      source_file: 'old.csv',
      batch_id: 'old-batch',
    }]
    const conflictCsv = `device_id,timestamp,temperature,voltage,is_online
DEV-001,2024-01-15T08:00:00.500Z,85,220,true
DEV-002,2024-01-15T10:00:00.000Z,90,215,false`
    const preview = generateScenePackagePreview({
      sensorContent: conflictCsv,
      sensorFileName: 'conflict_sensor.csv',
      existingSensorRecords: existingSensor,
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })

    const batches = simulateApplyScenePackage(preview, [])

    const simStore = {
      importBatches: batches,
      threshold: DEFAULT_THRESHOLD,
      sensorRecords: existingSensor,
      manualNotes: [],
      alarmRecords: [],
      events: [] as Event[],
      evidences: [] as Evidence[],
    }

    const serialized = JSON.stringify(simStore)
    const restored = JSON.parse(serialized) as typeof simStore

    assert(restored.importBatches.length === batches.length, '反序列化后批次数不变')
    const restoredBatch = restored.importBatches[0]
    assert(restoredBatch.conflicts !== undefined, '反序列化后冲突明细存在')
    assert(restoredBatch.conflicts!.length > 0, '反序列化后冲突明细非空')
    assert(restoredBatch.resolution_summary !== undefined, '反序列化后 resolution_summary 存在')

    const reExported = exportScenePackage(
      restored.threshold,
      restored.sensorRecords,
      restored.manualNotes,
      restored.alarmRecords,
      restored.importBatches,
      restored.events,
      restored.evidences
    )
    assert(reExported.import_batches[0].conflicts !== undefined, '导出的场景包中批次包含冲突明细')
    assert(reExported.import_batches[0].resolution_summary !== undefined, '导出的场景包中批次包含 resolution_summary')
  }

  console.log('\n--- Test 11: 回放批次序列化/反序列化后 replay_mode 不丢失 ---')
  {
    const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', 'test-pkg')
    const noteResult = parseNoteCSV(noteCsvContent, 'manual_notes.csv', 'test-pkg')
    const alarmResult = parseAlarmJSON(alarmJsonContent, 'alarm_data.json', 'test-pkg')
    const testThreshold: ThresholdConfig = { ...DEFAULT_THRESHOLD }
    const allSensor = detectSensorAnomalies(sensorResult.records, testThreshold)
    const allNotes = notesToEvidence(noteResult.records)
    const allAlarms = alarmsToEvidence(alarmResult.records)
    const mergeResult = mergeEvents([...allSensor, ...allNotes, ...allAlarms], testThreshold.merge_window_minutes)

    const pkg = exportScenePackage(
      testThreshold,
      sensorResult.records,
      noteResult.records,
      alarmResult.records,
      [],
      mergeResult.events,
      mergeResult.evidences
    )

    const mergeReplay = replayScenePackage(pkg, 'merge', [], [], [], [], [], [])
    const replayBatch = simulateReplayBatch(pkg, 'merge', mergeReplay.result, [], mergeResult.events)

    const serialized = JSON.stringify(replayBatch)
    const restored = JSON.parse(serialized) as ImportBatch

    assert(restored.replay_mode === 'merge', '反序列化后 replay_mode 保留为 merge')
    assert(restored.resolution_summary === replayBatch.resolution_summary,
      '反序列化后 resolution_summary 一致')
    assert(restored.file_hash === replayBatch.file_hash,
      '反序列化后 file_hash 一致')
  }

  console.log('\n--- Test 12: 无冲突的首次导入批次 conflicts 为 undefined（不浪费存储） ---')
  {
    const preview = generateScenePackagePreview({
      sensorContent: sensorCsvContent,
      sensorFileName: 'sensor_data.csv',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })
    assert(preview.conflicts.length === 0, '首次导入预览无冲突')
    const batches = simulateApplyScenePackage(preview, [])
    assert(batches[0].conflicts === undefined, '无冲突时 conflicts 为 undefined')
    assert(batches[0].affected_event_ids === undefined, '无受影响事件时 affected_event_ids 为 undefined')
  }

  console.log('\n=== 导入历史持久化回归测试汇总 ===')
  if (errors.length === 0) {
    console.log('✅ 所有回归测试通过！')
  } else {
    console.error(`❌ ${errors.length} 个测试失败：`)
    errors.forEach(e => console.error('  ' + e))
    process.exit(1)
  }
}

runTests().catch(e => {
  console.error('测试运行异常:', e)
  process.exit(1)
})
