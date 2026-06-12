import { parseSensorCSV, parseNoteCSV, generateId } from '../src/utils/csvParser'
import { parseAlarmJSON } from '../src/utils/jsonParser'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from '../src/utils/anomalyDetector'
import { mergeEvents } from '../src/utils/eventMerger'
import { DEFAULT_THRESHOLD } from '../src/utils/validator'
import { exportEventsToCSV, exportEvidencesToCSV, exportAllToJSON } from '../src/utils/exporter'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error('❌ 测试失败:', message)
    process.exit(1)
  } else {
    console.log('✅', message)
  }
}

async function runTests() {
  console.log('=== 开始核心逻辑测试 ===\n')

  const sensorCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'sensor_data.csv')
  const noteCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'manual_notes.csv')
  const alarmJsonPath = path.join(__dirname, '..', 'public', 'sample_data', 'alarm_data.json')

  const sensorCsvContent = fs.readFileSync(sensorCsvPath, 'utf-8')
  const noteCsvContent = fs.readFileSync(noteCsvPath, 'utf-8')
  const alarmJsonContent = fs.readFileSync(alarmJsonPath, 'utf-8')

  const batchId = generateId()

  console.log('1. 测试 CSV 解析 - 传感器数据')
  const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', batchId)
  assert(sensorResult.errors.length === 0, `传感器数据无解析错误 (错误数: ${sensorResult.errors.length})`)
  assert(sensorResult.records.length === 60, `传感器记录数量正确 (${sensorResult.records.length}/60)`)
  assert(sensorResult.records[0].device_id === 'DEV-001', '设备ID解析正确')
  assert(sensorResult.records[0].temperature === 25.5, '温度解析正确')
  assert(sensorResult.records[0].voltage === 220.5, '电压解析正确')
  assert(sensorResult.records[0].is_online === true, '在线状态解析正确')

  console.log('\n2. 测试 CSV 解析 - 人工备注')
  const noteResult = parseNoteCSV(noteCsvContent, 'manual_notes.csv', batchId)
  assert(noteResult.errors.length === 0, `备注数据无解析错误 (错误数: ${noteResult.errors.length})`)
  assert(noteResult.records.length === 12, `备注记录数量正确 (${noteResult.records.length}/12)`)
  assert(noteResult.records[0].author === '张工', '作者解析正确')

  console.log('\n3. 测试 JSON 解析 - 告警数据')
  const alarmResult = parseAlarmJSON(alarmJsonContent, 'alarm_data.json', batchId)
  assert(alarmResult.errors.length === 0, `告警数据无解析错误 (错误数: ${alarmResult.errors.length})`)
  assert(alarmResult.records.length === 12, `告警记录数量正确 (${alarmResult.records.length}/12)`)
  assert(alarmResult.records[0].alarm_type === '温度过高', '告警类型解析正确')

  console.log('\n4. 测试异常检测 - 传感器')
  const sensorEvidences = detectSensorAnomalies(sensorResult.records as any[], DEFAULT_THRESHOLD)
  console.log(`  检测到 ${sensorEvidences.length} 条传感器异常证据`)
  assert(sensorEvidences.length > 0, '检测到异常证据')

  const noteEvidences = notesToEvidence(noteResult.records as any[])
  assert(noteEvidences.length === 12, '备注转证据数量正确')

  const alarmEvidences = alarmsToEvidence(alarmResult.records as any[])
  assert(alarmEvidences.length === 12, '告警转证据数量正确')

  console.log('\n5. 测试事件归并')
  const allEvidences = [...sensorEvidences, ...noteEvidences, ...alarmEvidences]
  const mergeResult = mergeEvents(allEvidences, DEFAULT_THRESHOLD.merge_window_minutes)
  console.log(`  归并为 ${mergeResult.events.length} 个事件`)
  assert(mergeResult.events.length > 0, '成功归并事件')
  assert(mergeResult.evidences.length === allEvidences.length, '所有证据都被归并')
  
  for (const event of mergeResult.events) {
    const eventEvidences = mergeResult.evidences.filter(e => e.event_id === event.id)
    assert(eventEvidences.length === event.evidence_count, `事件 ${event.device_id} 的证据计数正确`)
  }

  console.log('\n6. 测试事件状态')
  assert(mergeResult.events[0].status === 'pending', '事件初始状态为待处理')
  assert(mergeResult.events[0].handler === '', '事件初始无处理人')

  console.log('\n7. 测试导出功能')
  const csvEvents = exportEventsToCSV(mergeResult.events, mergeResult.evidences)
  assert(csvEvents.includes('事件ID'), 'CSV 包含正确的表头')
  assert(csvEvents.length > 100, '事件 CSV 非空')

  const csvEvidences = exportEvidencesToCSV(mergeResult.events, mergeResult.evidences)
  assert(csvEvidences.includes('证据ID'), '证据 CSV 包含正确的表头')
  assert(csvEvidences.length > 100, '证据 CSV 非空')

  const jsonExport = exportAllToJSON(mergeResult.events, mergeResult.evidences)
  const jsonData = JSON.parse(jsonExport)
  assert(jsonData.event_count === mergeResult.events.length, 'JSON 导出事件数正确')
  assert(jsonData.evidence_count === mergeResult.evidences.length, 'JSON 导出证据数正确')

  console.log('\n8. 测试错误数据处理')
  const badCsv = `device_id,timestamp,temperature,voltage,is_online
,2024-01-15 08:00:00,25.5,220.5,true
DEV-002,invalid_time,25.5,220.5,true
DEV-003,2024-01-15 08:00:00,not_a_number,220.5,true`

  const badResult = parseSensorCSV(badCsv, 'bad.csv', 'test-batch')
  assert(badResult.errors.length >= 3, `检测到错误行 (${badResult.errors.length} 个错误)`)
  assert(badResult.records.length === 0, '错误数据被跳过')
  assert(badResult.errors[0].field === 'device_id', '缺少 device_id 报错')
  assert(badResult.errors[0].row === 2, '报告正确的行号')
  assert(badResult.errors[1].field === 'timestamp', '时间无法解析报错')

  console.log('\n=== 所有测试通过! ===')
}

runTests().catch(console.error)
