import {
  generateScenePackagePreview,
  exportScenePackage,
  parseScenePackage,
  replayScenePackage,
  computeContentHash,
} from '../src/utils/scenePackage'
import { parseSensorCSV, parseNoteCSV, generateId, parseCSV } from '../src/utils/csvParser'
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
  ReplayMode,
  ScenePackagePreview,
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
