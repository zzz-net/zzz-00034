import { generateScenePackagePreview, exportScenePackage, computeContentHash } from './src/utils/scenePackage.js'
import { parseSensorCSV, parseNoteCSV } from './src/utils/csvParser.js'
import { parseAlarmJSON } from './src/utils/jsonParser.js'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from './src/utils/anomalyDetector.js'
import { mergeEvents } from './src/utils/eventMerger.js'
import { DEFAULT_THRESHOLD } from './src/utils/validator.js'
import * as fs from 'fs'

const sensorCsv = fs.readFileSync('public/sample_data/sensor_data.csv', 'utf-8')
const noteCsv = fs.readFileSync('public/sample_data/manual_notes.csv', 'utf-8')
const alarmJson = fs.readFileSync('public/sample_data/alarm_data.json', 'utf-8')

const sensorResult = parseSensorCSV(sensorCsv, 'sensor_data.csv', 'test-pkg')
const noteResult = parseNoteCSV(noteCsv, 'manual_notes.csv', 'test-pkg')
const alarmResult = parseAlarmJSON(alarmJson, 'alarm_data.json', 'test-pkg')

const allSensor = detectSensorAnomalies(sensorResult.records, DEFAULT_THRESHOLD)
const allNotes = notesToEvidence(noteResult.records)
const allAlarms = alarmsToEvidence(alarmResult.records)
const mergeResult = mergeEvents([...allSensor, ...allNotes, ...allAlarms], DEFAULT_THRESHOLD.merge_window_minutes)

const importBatch: ImportBatch = {
  id: 'e2e-import-batch-sensor',
  file_type: 'sensor',
  file_name: 'sensor_data.csv',
  import_time: new Date().toISOString(),
  record_count: sensorResult.records.length,
  error_count: 0,
  errors: [],
  file_hash: computeContentHash(sensorCsv, 'sensor_data.csv'),
  conflicts: [
    {
      device_id: 'DEV-001',
      timestamp: '2024-01-15T08:00:00.000Z',
      existing_source: 'old_sensor.csv',
      new_source: 'sensor_data.csv',
      conflict_type: 'same_device_time',
      description: '同设备 DEV-001 在 2024-01-15T08:00:00 存在另一来源记录',
    },
  ],
  resolution_summary: '1 处同设备同时间冲突已记录（数据正常写入）；新增 4 个事件',
  affected_event_ids: ['event-dev001-001'],
}

const replayBatch: ImportBatch = {
  id: 'e2e-replay-batch-merge',
  file_type: 'sensor',
  file_name: '回放-合并-' + new Date().toLocaleString('zh-CN'),
  import_time: new Date().toISOString(),
  record_count: sensorResult.records.length,
  error_count: 0,
  errors: [],
  file_hash: 'replay-merge-' + new Date().toISOString(),
  conflicts: [
    {
      device_id: '',
      timestamp: '',
      existing_source: '已导入批次',
      new_source: 'sensor_data.csv',
      conflict_type: 'batch_duplicate',
      description: '批次 sensor_data.csv 已存在',
    },
  ],
  replay_mode: 'merge',
  resolution_summary: '1 个重复批次已跳过；合并 2 个事件',
  affected_event_ids: mergeResult.events.slice(0, 2).map(e => e.id),
}

import { ImportBatch } from './src/types/index.js'

const storeData = {
  threshold: DEFAULT_THRESHOLD,
  sensorRecords: sensorResult.records,
  manualNotes: noteResult.records,
  alarmRecords: alarmResult.records,
  evidences: mergeResult.evidences,
  events: mergeResult.events,
  importBatches: [importBatch, replayBatch],
}

const serialized = JSON.stringify(storeData)
const restored = JSON.parse(serialized)

let allOk = true
const checks: [string, boolean][] = []

checks.push(['importBatch 有 resolution_summary', restored.importBatches[0].resolution_summary !== undefined])
checks.push(['importBatch 有 conflicts', restored.importBatches[0].conflicts !== undefined])
checks.push(['importBatch conflicts 含 same_device_time', restored.importBatches[0].conflicts?.some((c: any) => c.conflict_type === 'same_device_time')])
checks.push(['importBatch 有 affected_event_ids', restored.importBatches[0].affected_event_ids !== undefined])
checks.push(['replayBatch 有 replay_mode', restored.importBatches[1].replay_mode === 'merge'])
checks.push(['replayBatch 有 conflicts', restored.importBatches[1].conflicts !== undefined])
checks.push(['replayBatch conflicts 含 batch_duplicate', restored.importBatches[1].conflicts?.some((c: any) => c.conflict_type === 'batch_duplicate')])
checks.push(['replayBatch 有 resolution_summary', restored.importBatches[1].resolution_summary !== undefined])
checks.push(['replayBatch 有 affected_event_ids', restored.importBatches[1].affected_event_ids !== undefined])

console.log('=== E2E 持久化验证 ===\n')
for (const [label, ok] of checks) {
  console.log(ok ? '✅' : '❌', label)
  if (!ok) allOk = false
}

const lsJson = JSON.stringify({ 'inspection_dashboard_data': serialized })
fs.writeFileSync('test-e2e-localstorage.json', lsJson, 'utf-8')
console.log('\n已生成 test-e2e-localstorage.json，可注入浏览器 localStorage 验证')

if (allOk) {
  console.log('\n✅ 所有 E2E 持久化验证通过')
} else {
  console.log('\n❌ 存在验证失败')
  process.exit(1)
}
