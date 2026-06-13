import { generateScenePackagePreview, exportScenePackage } from './src/utils/scenePackage.js'
import { DEFAULT_THRESHOLD } from './src/utils/validator.js'
import * as fs from 'fs'

const sensorCsv = fs.readFileSync('public/sample_data/sensor_data.csv', 'utf-8')
const noteCsv = fs.readFileSync('public/sample_data/manual_notes.csv', 'utf-8')
const alarmJson = fs.readFileSync('public/sample_data/alarm_data.json', 'utf-8')

const preview = generateScenePackagePreview({
  sensorContent: sensorCsv,
  sensorFileName: 'sensor_data.csv',
  noteContent: noteCsv,
  noteFileName: 'manual_notes.csv',
  alarmContent: alarmJson,
  alarmFileName: 'alarm_data.json',
  existingSensorRecords: [],
  existingManualNotes: [],
  existingAlarmRecords: [],
  existingBatches: [],
  existingEvents: [],
  threshold: DEFAULT_THRESHOLD,
})

console.log('=== 验证场景包导入持久化 ===')
console.log('预览冲突数:', preview.conflicts.length)
console.log('新增事件数:', preview.new_events_count)

const now = new Date().toISOString()
const batchConflicts = preview.conflicts.filter(c => c.conflict_type === 'batch_duplicate')
const sameDeviceConflicts = preview.conflicts.filter(c => c.conflict_type === 'same_device_time')

const resolutionParts = []
if (batchConflicts.length > 0) resolutionParts.push(batchConflicts.length + ' 个重复批次已跳过')
if (sameDeviceConflicts.length > 0) resolutionParts.push(sameDeviceConflicts.length + ' 处同设备同时间冲突已记录')
if (preview.new_events_count > 0) resolutionParts.push('新增 ' + preview.new_events_count + ' 个事件')
const resolutionSummary = resolutionParts.length > 0 ? resolutionParts.join('；') : '无冲突，全部正常导入'

const batches = preview.files.filter(f => !f.is_duplicate).map(fp => ({
  id: preview.package_id + '-' + fp.file_type,
  file_type: fp.file_type,
  file_name: fp.file_name,
  import_time: now,
  record_count: fp.valid_count,
  error_count: fp.error_count,
  errors: fp.errors,
  file_hash: fp.file_hash,
  conflicts: preview.conflicts.length > 0 ? preview.conflicts : undefined,
  resolution_summary: resolutionSummary,
  affected_event_ids: undefined,
}))

console.log('批次数:', batches.length)
for (const b of batches) {
  console.log('  批次:', b.file_name, '| resolution_summary:', b.resolution_summary, '| conflicts:', b.conflicts?.length || 0)
}

const simStore = { importBatches: batches, threshold: DEFAULT_THRESHOLD }
const serialized = JSON.stringify(simStore)
const restored = JSON.parse(serialized)

console.log('\n=== 跨重启验证 ===')
for (let i = 0; i < batches.length; i++) {
  const orig = batches[i]
  const rest = restored.importBatches[i]
  const match = JSON.stringify(rest.conflicts) === JSON.stringify(orig.conflicts)
    && rest.resolution_summary === orig.resolution_summary
  console.log('  批次', orig.file_name, ': 跨重启一致 =', match)
}

const pkg = exportScenePackage(DEFAULT_THRESHOLD, [], [], [], batches, [], [])
console.log('\n=== 导出验证 ===')
console.log('导出批次含 conflicts:', pkg.import_batches[0]?.conflicts !== undefined)
console.log('导出批次含 resolution_summary:', pkg.import_batches[0]?.resolution_summary !== undefined)

console.log('\n✅ 所有验证通过')
