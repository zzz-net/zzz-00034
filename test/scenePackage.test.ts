import {
  generateScenePackagePreview,
  exportScenePackage,
  parseScenePackage,
  replayScenePackage,
  computeContentHash,
  analyzeReplayConflicts,
} from '../src/utils/scenePackage'
import { parseSensorCSV, parseNoteCSV, generateId, parseCSV } from '../src/utils/csvParser'
import { parseAlarmJSON } from '../src/utils/jsonParser'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from '../src/utils/anomalyDetector'
import { mergeEvents } from '../src/utils/eventMerger'
import { DEFAULT_THRESHOLD, validateThresholdConfig } from '../src/utils/validator'
import { useAppStore } from '../src/store/useAppStore'
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
  ReplayMode,
  ScenePackagePreview,
  ImportSession,
  UndoSnapshot,
  ConflictChoice,
  ConflictDetail,
  FileType,
} from '../src/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {}
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
  }
}

const errors: string[] = []

function assert(condition: boolean, message: string) {
  if (!condition) {
    errors.push('❌ ' + message)
    console.error('❌ 测试失败:', message)
  } else {
    console.log('✅', message)
  }
}

async function cleanup() {
  useAppStore.getState().clearAllData()
}

function buildMinimalScenePackage(seed: string): ScenePackage {
  const hashSeed = computeContentHash(seed, seed)
  const packageId = 'pkg_' + seed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) + '_' + Date.now()
  const now = new Date(Date.now() - 86400000).toISOString()

  const deviceId = `DEV-${seed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'SEED'}`
  const baseHour = 8
  const sensorRecords: SensorRecord[] = [
    {
      id: `sr_${seed}_1`,
      device_id: deviceId,
      timestamp: `2024-01-15T${String(baseHour).padStart(2, '0')}:00:00.000Z`,
      temperature: 75,
      voltage: 230,
      is_online: true,
      source_file: `${seed}_sensor.csv`,
      batch_id: `${packageId}-sensor`,
    },
    {
      id: `sr_${seed}_2`,
      device_id: deviceId,
      timestamp: `2024-01-15T${String(baseHour + 1).padStart(2, '0')}:00:00.000Z`,
      temperature: 40,
      voltage: 225,
      is_online: true,
      source_file: `${seed}_sensor.csv`,
      batch_id: `${packageId}-sensor`,
    },
  ]

  const manualNotes: ManualNote[] = [
    {
      id: `mn_${seed}_1`,
      device_id: deviceId,
      timestamp: `2024-01-15T${String(baseHour + 2).padStart(2, '0')}:00:00.000Z`,
      content: `现场巡检记录-${seed}`,
      author: '巡检员A',
      source_file: `${seed}_notes.csv`,
      batch_id: `${packageId}-note`,
    },
  ]

  const alarmRecords: AlarmRecord[] = []

  const sensorEvs = detectSensorAnomalies(sensorRecords, DEFAULT_THRESHOLD)
  const noteEvs = notesToEvidence(manualNotes)
  const allEvs = [...sensorEvs, ...noteEvs, ...alarmsToEvidence(alarmRecords)]
  const mergeRes = mergeEvents(allEvs, DEFAULT_THRESHOLD.merge_window_minutes)

  const events: Event[] = mergeRes.events
  const evidences: Evidence[] = mergeRes.evidences

  const batches: ImportBatch[] = [
    {
      id: `${packageId}-sensor`,
      file_type: 'sensor',
      file_name: `${seed}_sensor.csv`,
      import_time: now,
      record_count: sensorRecords.length,
      error_count: 0,
      errors: [],
      file_hash: computeContentHash(`${seed}_sensor_content`, `${seed}_sensor.csv`),
    },
    {
      id: `${packageId}-note`,
      file_type: 'note',
      file_name: `${seed}_notes.csv`,
      import_time: now,
      record_count: manualNotes.length,
      error_count: 0,
      errors: [],
      file_hash: computeContentHash(`${seed}_notes_content`, `${seed}_notes.csv`),
    },
  ]

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    threshold: { ...DEFAULT_THRESHOLD },
    sensor_records: sensorRecords,
    manual_notes: manualNotes,
    alarm_records: alarmRecords,
    import_batches: batches,
    events,
    evidences,
    import_sessions: [],
    undo_snapshots: [],
    _meta: {
      total_active_sessions: 0,
      total_undone_sessions: 0,
    },
  }
}

function validatePackage(pkg: ScenePackage | any): { valid: boolean; errors: string[] } {
  const errs: string[] = []

  if (!pkg || typeof pkg !== 'object') {
    return { valid: false, errors: ['场景包不是对象'] }
  }

  if (pkg.version !== 1) {
    errs.push(`版本异常: ${pkg.version}`)
  }

  const tv = validateThresholdConfig(pkg.threshold || {})
  if (!tv.valid) {
    errs.push('阈值无效: ' + tv.errors.map(e => e.message).join(';'))
  }

  const requiredLists: [string, string][] = [
    ['sensor_records', '传感器记录'],
    ['manual_notes', '备注记录'],
    ['alarm_records', '告警记录'],
    ['import_batches', '导入批次'],
    ['events', '事件'],
    ['evidences', '证据'],
  ]

  for (const [key, label] of requiredLists) {
    if (!Array.isArray(pkg[key])) {
      errs.push(`缺少 ${label} 数组字段: ${key}`)
    }
  }

  if (Array.isArray(pkg.sensor_records)) {
    for (let i = 0; i < pkg.sensor_records.length; i++) {
      const r: any = pkg.sensor_records[i]
      if (!r || typeof r !== 'object') {
        errs.push(`sensor_records[${i}] 不是对象`)
        continue
      }
      if (!r.device_id) errs.push(`sensor_records[${i}].device_id 缺失`)
      if (!r.timestamp) errs.push(`sensor_records[${i}].timestamp 缺失`)
      else {
        const ts = new Date(r.timestamp).getTime()
        if (isNaN(ts)) errs.push(`sensor_records[${i}].timestamp 非法: "${r.timestamp}"`)
      }
      if (typeof r.temperature !== 'number' || isNaN(r.temperature)) {
        errs.push(`sensor_records[${i}].temperature 非法: ${String(r.temperature)}`)
      }
      if (typeof r.voltage !== 'number' || isNaN(r.voltage)) {
        errs.push(`sensor_records[${i}].voltage 非法: ${String(r.voltage)}`)
      }
    }
  }

  if (Array.isArray(pkg.manual_notes)) {
    for (let i = 0; i < pkg.manual_notes.length; i++) {
      const r: any = pkg.manual_notes[i]
      if (!r || typeof r !== 'object') {
        errs.push(`manual_notes[${i}] 不是对象`)
        continue
      }
      if (!r.content) errs.push(`manual_notes[${i}].content 缺失`)
      if (!r.timestamp) errs.push(`manual_notes[${i}].timestamp 缺失`)
      else if (isNaN(new Date(r.timestamp).getTime())) {
        errs.push(`manual_notes[${i}].timestamp 非法: "${r.timestamp}"`)
      }
    }
  }

  if (Array.isArray(pkg.events)) {
    for (let i = 0; i < pkg.events.length; i++) {
      const e: any = pkg.events[i]
      if (!e || typeof e !== 'object') {
        errs.push(`events[${i}] 不是对象`)
        continue
      }
      const validStatuses = ['pending', 'confirmed', 'false_alarm', 'closed']
      if (!validStatuses.includes(e.status)) {
        errs.push(`events[${i}].status 非法: ${String(e.status)}`)
      }
      if (!e.device_id) errs.push(`events[${i}].device_id 缺失`)
    }
  }

  return { valid: errs.length === 0, errors: errs }
}

const sensorCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'sensor_data.csv')
const noteCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'manual_notes.csv')
const alarmJsonPath = path.join(__dirname, '..', 'public', 'sample_data', 'alarm_data.json')

const sensorCsvContent = fs.readFileSync(sensorCsvPath, 'utf-8')
const noteCsvContent = fs.readFileSync(noteCsvPath, 'utf-8')
const alarmJsonContent = fs.readFileSync(alarmJsonPath, 'utf-8')

async function runTests() {
  console.log('=== 场景包核心逻辑测试 ===\n')

  console.log('\n--- Test 1: computeContentHash 一致性 ---')
  const h1 = computeContentHash(sensorCsvContent, 'sensor_data.csv')
  const h2 = computeContentHash(sensorCsvContent, 'sensor_data.csv')
  const h3 = computeContentHash(sensorCsvContent, 'different_name.csv')
  assert(h1 === h2, '相同内容+相同文件名产生相同哈希')
  assert(h1 !== h3, '不同文件名产生不同哈希')

  console.log('\n--- Test 2: generateScenePackagePreview - 空数据首次预览 ---')
  const emptyPreview = generateScenePackagePreview({
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
  assert(emptyPreview.files.length === 3, '3 个文件都被解析')
  assert(emptyPreview.will_create_sensor_records > 0, '将创建传感器记录')
  assert(emptyPreview.will_create_note_records > 0, '将创建备注记录')
  assert(emptyPreview.will_create_alarm_records > 0, '将创建告警记录')
  assert(emptyPreview.new_events_count > 0, '将产生新事件')
  assert(emptyPreview.conflicts.length === 0, '首次导入无冲突')

  for (const fp of emptyPreview.files) {
    assert(fp.valid_count > 0, `${fp.file_name}: 有效记录 > 0`)
    assert(fp.error_count === 0, `${fp.file_name}: 样例文件 0 错误`)
    assert(fp.is_duplicate === false, `${fp.file_name}: 非重复批次`)
  }

  console.log('\n--- Test 3: 预览取消后不影响后续 ---')
  const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', emptyPreview.package_id)
  const noteResult = parseNoteCSV(noteCsvContent, 'manual_notes.csv', emptyPreview.package_id)
  const alarmResult = parseAlarmJSON(alarmJsonContent, 'alarm_data.json', emptyPreview.package_id)
  assert(sensorResult.records.length === emptyPreview.will_create_sensor_records,
    `预览中传感器记录数 (${emptyPreview.will_create_sensor_records}) 与直接解析一致 (${sensorResult.records.length})`)
  assert(noteResult.records.length === emptyPreview.will_create_note_records,
    `预览中备注记录数与直接解析一致`)
  assert(alarmResult.records.length === emptyPreview.will_create_alarm_records,
    `预览中告警记录数与直接解析一致`)

  console.log('\n--- Test 4: 检测重复批次冲突 ---')
  const dupBatch: ImportBatch = {
    id: 'existing-batch-id',
    file_type: 'sensor',
    file_name: 'sensor_data.csv',
    import_time: new Date().toISOString(),
    record_count: sensorResult.records.length,
    error_count: 0,
    errors: [],
    file_hash: computeContentHash(sensorCsvContent, 'sensor_data.csv'),
  }
  const dupPreview = generateScenePackagePreview({
    sensorContent: sensorCsvContent,
    sensorFileName: 'sensor_data.csv',
    noteContent: noteCsvContent,
    noteFileName: 'manual_notes.csv',
    existingSensorRecords: sensorResult.records,
    existingManualNotes: [],
    existingAlarmRecords: [],
    existingBatches: [dupBatch],
    existingEvents: [],
    threshold: DEFAULT_THRESHOLD,
  })
  const sensorFp = dupPreview.files.find(f => f.file_type === 'sensor')!
  assert(sensorFp.is_duplicate === true, '重复传感器文件被识别为重复批次')
  assert(dupPreview.will_create_sensor_records === 0, '重复批次不创建传感器记录')
  assert(dupPreview.conflicts.some(c => c.conflict_type === 'batch_duplicate'),
    '冲突列表中包含 batch_duplicate')

  console.log('\n--- Test 5: 检测同设备同时间证据冲突 ---')
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
  const conflictSensorCsv = `device_id,timestamp,temperature,voltage,is_online
DEV-001,2024-01-15T08:00:00.000Z,85,220,true`
  const timeConflictPreview = generateScenePackagePreview({
    sensorContent: conflictSensorCsv,
    sensorFileName: 'conflict_sensor.csv',
    existingSensorRecords: existingSensor,
    existingManualNotes: [],
    existingAlarmRecords: [],
    existingBatches: [],
    existingEvents: [],
    threshold: DEFAULT_THRESHOLD,
  })
  assert(timeConflictPreview.conflicts.some(c => c.conflict_type === 'same_device_time'),
    '同设备同时间被识别为 same_device_time 冲突')
  assert(timeConflictPreview.conflicts[0].device_id === 'DEV-001', '冲突设备 ID 正确')

  console.log('\n--- Test 6: 导出场景包包含完整状态 ---')
  const testThreshold: ThresholdConfig = { ...DEFAULT_THRESHOLD, temp_max: 50 }
  const testSensor: SensorRecord[] = sensorResult.records.slice(0, 2)
  const testNotes: ManualNote[] = noteResult.records.slice(0, 2)
  const testAlarms: AlarmRecord[] = alarmResult.records.slice(0, 2)
  const testBatches: ImportBatch[] = [dupBatch]
  const testSensorEvs = detectSensorAnomalies(testSensor, testThreshold)
  const testNoteEvs = notesToEvidence(testNotes)
  const testAlarmEvs = alarmsToEvidence(testAlarms)
  const testMerge = mergeEvents([...testSensorEvs, ...testNoteEvs, ...testAlarmEvs], testThreshold.merge_window_minutes)
  const testEvents: Event[] = testMerge.events.map((e, i) => ({
    ...e,
    status: (i === 0 ? 'confirmed' : 'pending') as EventStatus,
    handler: i === 0 ? '测试员甲' : '',
    remark: i === 0 ? '已现场确认' : '',
    close_time: i === 0 ? new Date().toISOString() : null,
  }))
  const testEvidences: Evidence[] = testMerge.evidences

  const pkg = exportScenePackage(
    testThreshold,
    testSensor,
    testNotes,
    testAlarms,
    testBatches,
    testEvents,
    testEvidences
  )
  assert(pkg.version === 1, '场景包 version = 1')
  assert(pkg.threshold.temp_max === 50, '阈值配置被正确导出')
  assert(pkg.sensor_records.length === testSensor.length, '传感器记录数一致')
  assert(pkg.manual_notes.length === testNotes.length, '备注记录数一致')
  assert(pkg.alarm_records.length === testAlarms.length, '告警记录数一致')
  assert(pkg.import_batches.length === testBatches.length, '批次记录数一致')
  assert(pkg.events.length === testEvents.length, '事件数一致')
  assert(pkg.evidences.length === testEvidences.length, '证据数一致')
  const confirmedEv = pkg.events.find(e => e.status === 'confirmed')
  assert(confirmedEv?.handler === '测试员甲', '事件处理人被导出')
  assert(confirmedEv?.remark === '已现场确认', '事件备注被导出')
  assert(confirmedEv?.close_time !== null, '事件关闭时间被导出')

  console.log('\n--- Test 7: parseScenePackage - 有效场景包 ---')
  const validPkgStr = JSON.stringify(pkg)
  const parseValid = parseScenePackage(validPkgStr)
  assert(parseValid.valid === true, '有效场景包解析成功')
  assert(parseValid.data !== null, '解析结果非空')
  assert(parseValid.errors.length === 0, '无解析错误')

  console.log('\n--- Test 8: parseScenePackage - 坏 JSON ---')
  const parseBad = parseScenePackage('{ this is not json }')
  assert(parseBad.valid === false, '坏 JSON 被拒绝')
  assert(parseBad.data === null, '坏 JSON 返回 null 数据')
  assert(parseBad.errors.length >= 1, '至少报告 1 个错误')

  console.log('\n--- Test 9: parseScenePackage - 缺字段 ---')
  const incomplete: Partial<ScenePackage> = { version: 1, exported_at: new Date().toISOString() }
  const parseIncomplete = parseScenePackage(JSON.stringify(incomplete))
  assert(parseIncomplete.valid === false, '缺字段场景包被拒绝')
  assert(parseIncomplete.errors.some(e => e.includes('threshold') || e.includes('sensor_records')),
    '错误信息包含缺失字段名')

  console.log('\n--- Test 10: parseScenePackage - 非法阈值 ---')
  const badThresholdPkg: ScenePackage = {
    ...pkg,
    threshold: { ...pkg.threshold, temp_min: 100, temp_max: 0 },
  }
  const parseBadThreshold = parseScenePackage(JSON.stringify(badThresholdPkg))
  assert(parseBadThreshold.valid === false, '颠倒阈值被拒绝')
  assert(parseBadThreshold.errors.some(e => e.includes('阈值')),
    '错误信息提及阈值无效')

  console.log('\n--- Test 11: parseScenePackage - 错误版本 ---')
  const wrongVersion: ScenePackage = { ...pkg, version: 2 as any }
  const parseWrongVersion = parseScenePackage(JSON.stringify(wrongVersion))
  assert(parseWrongVersion.valid === false || parseWrongVersion.errors.some(e => e.includes('版本')),
    '不支持版本被识别并报告')

  console.log('\n--- Test 12: replayScenePackage - overwrite 模式 ---')
  const currentSensor: SensorRecord[] = [{
    id: 'old-1',
    device_id: 'OLD-DEV',
    timestamp: new Date().toISOString(),
    temperature: 25,
    voltage: 220,
    is_online: true,
    source_file: 'old.csv',
    batch_id: 'old-batch',
  }]
  const overwriteReplay = replayScenePackage(
    pkg,
    'overwrite',
    currentSensor,
    [],
    [],
    [],
    [],
    []
  )
  assert(overwriteReplay.result.mode === 'overwrite', '回放模式为 overwrite')
  assert(overwriteReplay.result.overwritten_events === pkg.events.length,
    '覆盖事件数等于场景包事件数')
  assert(overwriteReplay.sensorRecords.length === pkg.sensor_records.length,
    '覆盖后传感器记录为场景包中的数量')
  assert(!overwriteReplay.sensorRecords.some(r => r.device_id === 'OLD-DEV'),
    '原有传感器记录被清除')

  console.log('\n--- Test 13: replayScenePackage - skip 模式 ---')
  const existingBatchesForSkip: ImportBatch[] = pkg.import_batches.map(b => ({ ...b }))
  const existingEventsForSkip: Event[] = pkg.events.slice(0, 1).map(e => ({ ...e, status: 'pending' as EventStatus }))
  const skipReplay = replayScenePackage(
    pkg,
    'skip',
    [],
    [],
    [],
    existingBatchesForSkip,
    existingEventsForSkip,
    []
  )
  assert(skipReplay.result.mode === 'skip', '回放模式为 skip')
  assert(skipReplay.result.skipped_batches >= 1, `跳过重复批次 (${skipReplay.result.skipped_batches})`)
  assert(skipReplay.result.skipped_events >= 1, `跳过重复事件 (${skipReplay.result.skipped_events})`)

  console.log('\n--- Test 14: replayScenePackage - merge 模式保留处理状态 ---')
  const existingEventForMerge: Event = {
    ...pkg.events[0],
    status: 'pending' as EventStatus,
    handler: '',
    remark: '',
    close_time: null,
  }
  const mergeReplay = replayScenePackage(
    pkg,
    'merge',
    [], [], [], [],
    [existingEventForMerge],
    []
  )
  assert(mergeReplay.result.mode === 'merge', '回放模式为 merge')
  assert(mergeReplay.result.merged_events >= 1, `至少合并 1 个事件 (${mergeReplay.result.merged_events})`)
  const mergedEvent = mergeReplay.events.find(e => e.id === existingEventForMerge.id)
  assert(mergedEvent !== undefined, '合并后事件存在')
  if (pkg.events[0].status !== 'pending') {
    assert(mergedEvent?.status === pkg.events[0].status, 'pending 旧状态被场景包的非 pending 状态覆盖')
    assert(mergedEvent?.handler === pkg.events[0].handler, '处理人被带入')
    assert(mergedEvent?.remark === pkg.events[0].remark, '备注被带入')
  }

  console.log('\n--- Test 15: 跨重启一致性（模拟序列化/反序列化） ---')
  const simStore = {
    sensorRecords: testSensor,
    manualNotes: testNotes,
    alarmRecords: testAlarms,
    importBatches: testBatches,
    events: testEvents,
    evidences: testEvidences,
    threshold: testThreshold,
  }
  const serialized = JSON.stringify(simStore)
  const restored = JSON.parse(serialized)
  const restoredPkg = exportScenePackage(
    restored.threshold,
    restored.sensorRecords,
    restored.manualNotes,
    restored.alarmRecords,
    restored.importBatches,
    restored.events,
    restored.evidences
  )
  const beforeEvents = exportScenePackage(
    testThreshold, testSensor, testNotes, testAlarms, testBatches, testEvents, testEvidences
  )
  assert(restoredPkg.sensor_records.length === beforeEvents.sensor_records.length,
    '序列化/反序列化后传感器记录数不变')
  assert(restoredPkg.events.length === beforeEvents.events.length,
    '序列化/反序列化后事件数不变')
  assert(restoredPkg.events[0]?.handler === beforeEvents.events[0]?.handler,
    '序列化/反序列化后处理人不变')
  assert(restoredPkg.threshold.temp_max === beforeEvents.threshold.temp_max,
    '序列化/反序列化后阈值不变')

  console.log('\n--- Test 16: 导出再导入（完整闭环） ---')
  const originalPkg = exportScenePackage(
    testThreshold, testSensor, testNotes, testAlarms, testBatches, testEvents, testEvidences
  )
  const roundTripStr = JSON.stringify(originalPkg)
  const roundTripParsed = parseScenePackage(roundTripStr)
  assert(roundTripParsed.valid === true, '导出 JSON 可被重新解析')
  const replayed = replayScenePackage(
    roundTripParsed.data!,
    'overwrite',
    [{
      id: 'dummy',
      device_id: 'DUMMY',
      timestamp: new Date().toISOString(),
      temperature: 0,
      voltage: 0,
      is_online: true,
      source_file: 'dummy',
      batch_id: 'dummy',
    }], [], [], [], [], []
  )
  assert(replayed.sensorRecords.length === testSensor.length,
    `覆盖回放后记录数正确 (${replayed.sensorRecords.length}/${testSensor.length})`)
  assert(replayed.events.length === testEvents.length, '覆盖回放后事件数正确')
  assert(replayed.batches.length === testBatches.length, '覆盖回放后批次记录数正确')

  console.log('\n--- Test 17: 空预览边界 ---')
  const emptyFilesPreview = generateScenePackagePreview({
    existingSensorRecords: [],
    existingManualNotes: [],
    existingAlarmRecords: [],
    existingBatches: [],
    existingEvents: [],
    threshold: DEFAULT_THRESHOLD,
  })
  assert(emptyFilesPreview.files.length === 0, '不选文件则 files 为空')
  assert(emptyFilesPreview.new_events_count === 0, '不选文件则新事件为 0')
  assert(emptyFilesPreview.conflicts.length === 0, '不选文件则冲突为 0')

  console.log('\n--- Test 18: 仅部分文件预览 ---')
  const partialPreview = generateScenePackagePreview({
    sensorContent: sensorCsvContent,
    sensorFileName: 'sensor_data.csv',
    existingSensorRecords: [],
    existingManualNotes: [],
    existingAlarmRecords: [],
    existingBatches: [],
    existingEvents: [],
    threshold: DEFAULT_THRESHOLD,
  })
  assert(partialPreview.files.length === 1, '仅选传感器文件 files.length = 1')
  assert(partialPreview.files[0].file_type === 'sensor', '文件类型正确')
  assert(partialPreview.will_create_note_records === 0, '未选备注文件则 0')
  assert(partialPreview.will_create_alarm_records === 0, '未选告警文件则 0')

  console.log('\n--- Test 19: 坏传感器数据预览 ---')
  const badCsv = `device_id,timestamp,temperature,voltage,is_online
,2024-01-15 08:00:00,25.5,220.5,true
DEV-002,bad_time,25.5,220.5,true`
  const badPreview = generateScenePackagePreview({
    sensorContent: badCsv,
    sensorFileName: 'bad.csv',
    existingSensorRecords: [],
    existingManualNotes: [],
    existingAlarmRecords: [],
    existingBatches: [],
    existingEvents: [],
    threshold: DEFAULT_THRESHOLD,
  })
  assert(badPreview.files.length === 1, '坏 CSV 仍产生一个文件预览')
  assert(badPreview.files[0].error_count >= 2, `至少检测到 2 个错误 (实际 ${badPreview.files[0].error_count})`)
  assert(badPreview.files[0].valid_count === 0, '无有效记录')
  assert(badPreview.will_create_sensor_records === 0, '不创建坏记录')

  console.log('\n--- Test 20: parseScenePackage - items 数据类型错误 ---')
  const malformed = {
    version: 1,
    exported_at: new Date().toISOString(),
    threshold: DEFAULT_THRESHOLD,
    sensor_records: [{ not_device_id: 'X' }],
    manual_notes: [],
    alarm_records: [],
    import_batches: [],
    events: [],
    evidences: [],
  }
  const parseMalformed = parseScenePackage(JSON.stringify(malformed))
  assert(parseMalformed.valid === false, '缺失必要字段的记录被检测')
  assert(parseMalformed.errors.some(e => e.includes('sensor_records')),
    '错误信息指出 sensor_records 有问题')

  await cleanup()

  console.log('\n========== 新增链路测试 ==========\n')

  console.log('\n--- Test 21: 导入后重启状态一致 ---')
  {
    const minCsv = `device_id,timestamp,temperature,voltage,is_online
DEV-RESTART,2024-01-15T10:00:00.000Z,80,230,true`
    const minNoteCsv = `device_id,timestamp,content,author
DEV-RESTART,2024-01-15T10:30:00.000Z,启动测试,巡检员A`

    const preview21 = generateScenePackagePreview({
      sensorContent: minCsv,
      sensorFileName: 'restart_sensor.csv',
      noteContent: minNoteCsv,
      noteFileName: 'restart_note.csv',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })
    assert(preview21.will_create_sensor_records > 0, '预览：传感器记录数 > 0')

    const applyRes21 = useAppStore.getState().applyScenePackage(preview21)
    const state21 = useAppStore.getState()
    assert(state21.importSessions.length === 1, '导入后会话数 = 1')
    const session21 = state21.importSessions[0]
    assert(session21.undo_status === 'active', 'session.undo_status = active')

    const eventsHaveSource = state21.events.every(ev =>
      !session21.new_event_ids.includes(ev.id)
      || (ev.source_session_ids && ev.source_session_ids.includes(session21.id))
    )
    assert(eventsHaveSource, '新事件的 source_session_ids 包含新会话ID')

    const sensorCount = state21.sensorRecords.length
    const noteCount = state21.manualNotes.length
    const eventCount = state21.events.length
    const batchCount = state21.importBatches.length
    const snapshotCount = state21.undoSnapshots.length

    const savedState = {
      threshold: state21.threshold,
      sensorRecords: state21.sensorRecords,
      manualNotes: state21.manualNotes,
      alarmRecords: state21.alarmRecords,
      events: state21.events,
      evidences: state21.evidences,
      importBatches: state21.importBatches,
      importSessions: state21.importSessions,
      undoSnapshots: state21.undoSnapshots,
    }
    const serialStr = JSON.stringify(savedState)

    await cleanup()
    assert(useAppStore.getState().importSessions.length === 0, '清空后会话数 = 0')

    const restoredState = JSON.parse(serialStr)
    useAppStore.setState({
      threshold: restoredState.threshold,
      sensorRecords: restoredState.sensorRecords,
      manualNotes: restoredState.manualNotes,
      alarmRecords: restoredState.alarmRecords,
      events: restoredState.events,
      evidences: restoredState.evidences,
      importBatches: restoredState.importBatches,
      importSessions: restoredState.importSessions,
      undoSnapshots: restoredState.undoSnapshots,
    })

    const state21After = useAppStore.getState()
    assert(state21After.importSessions.length === 1, '还原后会话数 = 1')
    assert(state21After.sensorRecords.length === sensorCount,
      `还原后传感器记录数一致 (${state21After.sensorRecords.length}/${sensorCount})`)
    assert(state21After.manualNotes.length === noteCount,
      `还原后备注记录数一致 (${state21After.manualNotes.length}/${noteCount})`)
    assert(state21After.events.length === eventCount,
      `还原后事件数一致 (${state21After.events.length}/${eventCount})`)
    assert(state21After.importBatches.length === batchCount,
      `还原后批次数一致 (${state21After.importBatches.length}/${batchCount})`)
    assert(state21After.undoSnapshots.length === snapshotCount,
      `还原后快照数一致 (${state21After.undoSnapshots.length}/${snapshotCount})`)
    assert(state21After.importSessions[0].undo_status === 'active',
      '还原后 session.undo_status 仍为 active')
    const restoredEventsHaveSource = state21After.events.every(ev =>
      !state21After.importSessions[0].new_event_ids.includes(ev.id)
      || (ev.source_session_ids && ev.source_session_ids.includes(state21After.importSessions[0].id))
    )
    assert(restoredEventsHaveSource, '还原后事件的 source_session_ids 仍包含会话ID')
  }
  await cleanup()

  console.log('\n--- Test 22: 导出再回放完整 ---')
  {
    const csvA = `device_id,timestamp,temperature,voltage,is_online
DEV-ALPHA,2024-02-01T08:00:00.000Z,70,230,true
DEV-ALPHA,2024-02-01T09:00:00.000Z,80,220,true
DEV-BETA,2024-02-01T08:00:00.000Z,25,210,true`

    const previewA = generateScenePackagePreview({
      sensorContent: csvA,
      sensorFileName: 'alpha_sensor.csv',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })
    assert(previewA.will_create_sensor_records === 3, '场景包A 含 3 条 sensor 记录')

    const applyA = useAppStore.getState().applyScenePackage(previewA)
    assert(applyA.session.action_type === 'import', '导入会话 action_type = import')

    const stateAfterA = useAppStore.getState()
    const eventCountA = stateAfterA.events.length
    assert(eventCountA >= 1, `导入A后事件数 >= 1 (实际 ${eventCountA})`)
    const sessionCountA = stateAfterA.importSessions.length
    assert(sessionCountA === 1, '导入A后会话数 = 1')
    const importSessionA = stateAfterA.importSessions[0]

    const pkgA = exportScenePackage(
      stateAfterA.threshold,
      stateAfterA.sensorRecords,
      stateAfterA.manualNotes,
      stateAfterA.alarmRecords,
      stateAfterA.importBatches,
      stateAfterA.events,
      stateAfterA.evidences,
      stateAfterA.importSessions,
      stateAfterA.undoSnapshots,
      applyA.sessionId
    )
    assert(pkgA.import_sessions.length >= 1, '导出包含 sessions')
    assert(pkgA.undo_snapshots.length >= 1, '导出包含 undo snapshots')

    await cleanup()
    assert(useAppStore.getState().events.length === 0, '清空后 0 事件')

    const pkgAJson = JSON.stringify(pkgA)
    const parseA = parseScenePackage(pkgAJson)
    assert(parseA.valid === true, 'parseScenePackage 成功解析导出的 JSON')

    const storeForAnalysis = useAppStore.getState()
    const conflictAnalysis = analyzeReplayConflicts(
      parseA.data!,
      storeForAnalysis.sensorRecords,
      storeForAnalysis.manualNotes,
      storeForAnalysis.alarmRecords,
      storeForAnalysis.importBatches,
      storeForAnalysis.threshold,
      storeForAnalysis.importSessions
    )
    assert(conflictAnalysis !== null, 'analyzeReplayConflicts 返回结果')
    assert(typeof conflictAnalysis.total_conflicts === 'number',
      'conflict 分析含 total_conflicts 字段')

    const replayRes = useAppStore.getState().replayScenePackageData(parseA.data!, 'merge')
    assert(replayRes.success === true, '回放成功')
    assert(replayRes.session_id !== undefined, 'replay_result.session_id 存在')
    assert(replayRes.session_id.length > 0, '回放会话ID非空')

    const stateAfterReplay = useAppStore.getState()
    assert(stateAfterReplay.importSessions.length === 2,
      `回放后会话数 = 2 (1导入+1回放) (实际 ${stateAfterReplay.importSessions.length})`)

    const replaySession = stateAfterReplay.importSessions.find(s => s.id === replayRes.session_id)
    assert(replaySession !== undefined, '回放会话存在于 importSessions')
    assert(replaySession?.action_type === 'replay', '回放会话 action_type = replay')
    assert(replaySession?.undo_status === 'active', '回放会话 undo_status = active')

    const importedOriginalSession = stateAfterReplay.importSessions.find(s =>
      s.action_type === 'import'
    )
    assert(importedOriginalSession !== undefined, '原导入会话被保留')
    assert(importedOriginalSession?.undo_status !== 'undone',
      '原导入会话在回放后保持 undone=false')
  }
  await cleanup()

  console.log('\n--- Test 23: 冲突选择写入会话历史 ---')
  {
    const baseCsv = `device_id,timestamp,temperature,voltage,is_online
DEV-CONFLICT,2024-03-01T08:00:00.000Z,70,230,true
DEV-CONFLICT,2024-03-01T09:00:00.000Z,25,220,true`

    const previewBase = generateScenePackagePreview({
      sensorContent: baseCsv,
      sensorFileName: 'base_conflict.csv',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })
    useAppStore.getState().applyScenePackage(previewBase)
    const baseEvents = useAppStore.getState().events
    assert(baseEvents.length > 0, '基础导入产生事件')

    const conflictCsv = `device_id,timestamp,temperature,voltage,is_online
DEV-CONFLICT,2024-03-01T08:00:00.000Z,95,260,true
DEV-CONFLICT,2024-03-01T10:00:00.000Z,90,255,true`

    const strictThreshold: ThresholdConfig = {
      ...DEFAULT_THRESHOLD,
      temp_max: 50,
      voltage_max: 240,
    }
    const previewConflict = generateScenePackagePreview({
      sensorContent: conflictCsv,
      sensorFileName: 'conflict_pkg.csv',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: strictThreshold,
    })
    const applyB = useAppStore.getState().applyScenePackage(previewConflict)

    const pkgBSource = useAppStore.getState()
    const pkgB = exportScenePackage(
      strictThreshold,
      pkgBSource.sensorRecords,
      pkgBSource.manualNotes,
      pkgBSource.alarmRecords,
      pkgBSource.importBatches,
      pkgBSource.events,
      pkgBSource.evidences,
      pkgBSource.importSessions,
      pkgBSource.undoSnapshots,
      applyB.sessionId
    )
    pkgB.threshold = { ...strictThreshold }
    pkgBSource.clearAllData()

    const basePreview2 = generateScenePackagePreview({
      sensorContent: baseCsv,
      sensorFileName: 'base_conflict.csv',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })
    useAppStore.getState().applyScenePackage(basePreview2)
    const existingIds = [...useAppStore.getState().events.map(e => e.id)]

    const analysis = useAppStore.getState().analyzeReplayConflictsUI(pkgB)
    assert(analysis.same_device_time_conflicts.length > 0,
      `same_device_time_conflicts.length > 0 (实际 ${analysis.same_device_time_conflicts.length})`)
    assert(analysis.threshold_diff !== null,
      'threshold_diff 非空（导入阈值严格于当前）')

    const choices: ConflictChoice[] = []
    for (const c of analysis.same_device_time_conflicts) {
      choices.push({
        conflict_type: 'same_device_time',
        key: `same_device_time:${c.device_id}:${c.timestamp}`,
        device_id: c.device_id,
        timestamp: c.timestamp,
        existing_source: c.existing_source,
        new_source: c.new_source,
        choice: 'overwrite',
        description: c.description,
      })
    }
    if (analysis.threshold_diff) {
      for (const d of analysis.threshold_diff.differences) {
        choices.push({
          conflict_type: 'threshold_diff',
          key: `threshold:${d.field}`,
          existing_source: `当前: ${d.current}`,
          new_source: `导入: ${d.imported}`,
          choice: 'overwrite',
          description: `阈值字段 ${d.field} 覆盖`,
        })
      }
    }
    assert(choices.length >= 2,
      `至少构造 2 个 ConflictChoice (同时间+阈值) (实际 ${choices.length})`)

    const replayRes = useAppStore.getState().replayScenePackageData(pkgB, 'merge', choices)
    assert(replayRes.applied_choices !== undefined, '回放结果包含 applied_choices')
    assert((replayRes.applied_choices?.length || 0) === choices.length,
      `result.conflict_choices 长度正确 (${replayRes.applied_choices?.length}/${choices.length})`)

    const stateAfterReplay = useAppStore.getState()
    const replaySession = stateAfterReplay.importSessions.find(s => s.id === replayRes.session_id)
    assert(replaySession !== undefined, '回放会话存在')
    assert((replaySession?.conflict_choices?.length || 0) === choices.length,
      `会话的 conflict_choices 已写入 (${replaySession?.conflict_choices?.length}/${choices.length})`)

    if (replaySession) {
      assert(replaySession.breakdown.overwritten_events >= 0,
        `会话 breakdown.overwritten_events 非负 (${replaySession.breakdown.overwritten_events})`)
      if (replaySession.breakdown.overwritten_events > 0) {
        assert(replaySession.overwritten_event_ids.length > 0,
          'overwritten_event_ids 填充')
      }
    }

    if (replaySession && replaySession.breakdown.overwritten_events > 0) {
      const overlap = replaySession.affected_event_ids.filter(eid => existingIds.includes(eid))
      assert(overlap.length > 0,
        `affected_event_ids 包含被覆盖事件ID (${overlap.length}/${replaySession.affected_event_ids.length})`)
    }
  }
  await cleanup()

  console.log('\n--- Test 24: 撤销后再导入不受影响 ---')
  {
    const csvFirst = `device_id,timestamp,temperature,voltage,is_online
DEV-UNDO,2024-04-01T08:00:00.000Z,80,220,true
DEV-UNDO,2024-04-01T09:00:00.000Z,85,218,true`

    const previewFirst = generateScenePackagePreview({
      sensorContent: csvFirst,
      sensorFileName: 'undo_first.csv',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })
    const applyFirst = useAppStore.getState().applyScenePackage(previewFirst)
    const firstSessionId = applyFirst.sessionId
    const eventsBefore = [...useAppStore.getState().events]
    assert(eventsBefore.length > 0, '首次导入产生事件')
    const firstEventCount = eventsBefore.length

    const firstSession = useAppStore.getState().importSessions.find(s => s.id === firstSessionId)
    assert(firstSession?.undo_status === 'active', '首次导入会话 undo_status=active')

    const undoImpact = useAppStore.getState().getUndoImpactPreview(firstSessionId)
    assert(undoImpact.can_undo === true, '首次导入会话可撤销')

    const undoRes = useAppStore.getState().undoSession(firstSessionId)
    assert(undoRes.success === true, '撤销成功')

    const stateAfterUndo = useAppStore.getState()
    const firstSessionAfterUndo = stateAfterUndo.importSessions.find(s => s.id === firstSessionId)
    assert(firstSessionAfterUndo?.undo_status === 'undone',
      '被撤销会话 undo_status=undone')

    const undoActionSession = stateAfterUndo.importSessions.find(s => s.action_type === 'undo')
    assert(undoActionSession !== undefined, '存在 action_type=undo 的会话')
    assert(undoActionSession?.undo_status === 'active',
      '撤销动作会话本身 undo_status=active')

    const eventsAfterUndo = stateAfterUndo.events.filter(e => !e._is_from_undone_session)
    assert(eventsAfterUndo.length === 0,
      `撤销后除被标记会话外事件数=0 (实际 ${eventsAfterUndo.length})`)

    const lastSessionBefore = stateAfterUndo.importSessions
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    assert(lastSessionBefore.action_type === 'undo', '最后会话是撤销动作')

    const csvSecond = `device_id,timestamp,temperature,voltage,is_online
DEV-NEW,2024-05-01T10:00:00.000Z,90,255,true
DEV-NEW,2024-05-01T11:00:00.000Z,20,200,true`

    const previewSecond = generateScenePackagePreview({
      sensorContent: csvSecond,
      sensorFileName: 'second_after_undo.csv',
      existingSensorRecords: stateAfterUndo.sensorRecords,
      existingManualNotes: stateAfterUndo.manualNotes,
      existingAlarmRecords: stateAfterUndo.alarmRecords,
      existingBatches: stateAfterUndo.importBatches,
      existingEvents: stateAfterUndo.events,
      threshold: DEFAULT_THRESHOLD,
    })
    const applySecond = useAppStore.getState().applyScenePackage(previewSecond)
    assert(applySecond.sessionId !== firstSessionId, '新会话 ID 不同')

    const stateAfterSecond = useAppStore.getState()
    const allSessions = stateAfterSecond.importSessions
    assert(allSessions.length >= 3,
      `会话链连续 (导入1→撤销→导入2)，会话数 >= 3 (实际 ${allSessions.length})`)

    const secondSession = allSessions.find(s => s.id === applySecond.sessionId)
    assert(secondSession !== undefined, '第二次导入会话存在')
    assert(secondSession?.undo_status === 'active',
      '第二次导入会话 undo_status=active')

    const undoImpactSecond = useAppStore.getState().getUndoImpactPreview(applySecond.sessionId)
    assert(undoImpactSecond.can_undo === true,
      '新会话 can_undo=true（链连续，可直接撤销最新）')

    const activeEvents = stateAfterSecond.events.filter(e => !e._is_from_undone_session)
    assert(activeEvents.length === applySecond.session.new_event_ids.length,
      `撤销后第二次导入事件数正确 (${activeEvents.length}/${applySecond.session.new_event_ids.length})`)

    const importedUndoneSession = allSessions.find(s => s.id === firstSessionId)
    assert(importedUndoneSession?.undo_status === 'undone',
      '首次导入会话在后续导入后仍保持 undone 状态')
  }
  await cleanup()

  console.log('\n--- Test 25: 坏 JSON 部分跳过 ---')
  {
    const goodPkg = buildMinimalScenePackage('badjson_seed')
    assert(goodPkg.sensor_records.length >= 1, '构造的场景包有传感器记录')
    const goodPkgCopy = JSON.parse(JSON.stringify(goodPkg))
    goodPkgCopy.sensor_records[0].timestamp = 'INVALID'
    const pkgStr = JSON.stringify(goodPkgCopy)

    const parseRes = parseScenePackage(pkgStr)
    assert(parseRes.valid === true, 'parseScenePackage 不验证 timestamp 合法性（结构上字段存在）')
    assert(parseRes.data !== null, 'parseScenePackage 得到数据')

    const vp = validatePackage(parseRes.data)
    assert(vp.errors.some(e => e.includes('timestamp') && e.includes('非法')),
      'validatePackage 检测出 timestamp="INVALID" 的错误')
    assert(vp.valid === false, '含非法 timestamp 的包 validatePackage 返回无效')

    const partialBadCsv = `device_id,timestamp,temperature,voltage,is_online
DEV-PARTIAL,2024-06-01T08:00:00.000Z,75,230,true
DEV-PARTIAL,INVALID_TIMESTAMP,75,230,true
DEV-PARTIAL,2024-06-01T10:00:00.000Z,95,260,true`

    const previewPartial = generateScenePackagePreview({
      sensorContent: partialBadCsv,
      sensorFileName: 'partial_bad.csv',
      existingSensorRecords: [],
      existingManualNotes: [],
      existingAlarmRecords: [],
      existingBatches: [],
      existingEvents: [],
      threshold: DEFAULT_THRESHOLD,
    })
    assert(previewPartial.files.length === 1, '部分坏 CSV 产生预览')
    const fp = previewPartial.files[0]
    assert(fp.valid_count >= 1 && fp.valid_count <= 2,
      `合法部分被识别 (valid_count=${fp.valid_count})`)
    assert(fp.error_count >= 1,
      `非法部分被识别为错误 (error_count=${fp.error_count})`)
    assert(previewPartial.will_create_sensor_records === fp.valid_count,
      '仅合法行将被创建为记录')

    const applyRes = useAppStore.getState().applyScenePackage(previewPartial)
    const stateAfterImport = useAppStore.getState()

    assert(stateAfterImport.importSessions.length === 1, '部分导入后会话数=1')
    const session = stateAfterImport.importSessions[0]
    const totalSkipped =
      session.skipped_sensor_record_ids.length
      + session.skipped_note_record_ids.length
      + session.skipped_alarm_record_ids.length
    assert(session.new_sensor_record_ids.length === fp.valid_count,
      `会话 new_sensor_record_ids 数量正确 (${session.new_sensor_record_ids.length}/${fp.valid_count})`)

    const batch = stateAfterImport.importBatches[0]
    assert(batch !== undefined, '批次存在')
    assert(batch.error_count >= 1,
      `批次记录错误数 (${batch.error_count})`)
    if (batch.skipped_record_ids) {
      assert(batch.skipped_record_ids.length >= 0,
        `批次 skipped_record_ids 定义 (长度=${batch.skipped_record_ids.length})`)
    }

    const totalValidImported = session.new_sensor_record_ids.length
      + session.new_note_record_ids.length
      + session.new_alarm_record_ids.length
    assert(totalValidImported >= fp.valid_count,
      `合法记录成功导入 (${totalValidImported}/${fp.valid_count})`)
  }
  await cleanup()

  console.log('\n=== 场景包测试汇总 ===')
  if (errors.length === 0) {
    console.log('✅ 所有场景包测试通过！')
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
