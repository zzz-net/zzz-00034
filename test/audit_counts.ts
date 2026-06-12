import { parseSensorCSV, parseNoteCSV, generateId, parseCSV } from '../src/utils/csvParser'
import { parseAlarmJSON } from '../src/utils/jsonParser'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from '../src/utils/anomalyDetector'
import { mergeEvents } from '../src/utils/eventMerger'
import { DEFAULT_THRESHOLD } from '../src/utils/validator'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function countCsvLines(content: string): number {
  const rows = parseCSV(content)
  return Math.max(0, rows.length - 1)
}

function groupByDevice(records: { device_id: string }[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const r of records) {
    result[r.device_id] = (result[r.device_id] || 0) + 1
  }
  return result
}

const sensorCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'sensor_data.csv')
const noteCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'manual_notes.csv')
const alarmJsonPath = path.join(__dirname, '..', 'public', 'sample_data', 'alarm_data.json')

const sensorCsvContent = fs.readFileSync(sensorCsvPath, 'utf-8')
const noteCsvContent = fs.readFileSync(noteCsvPath, 'utf-8')
const alarmJsonContent = fs.readFileSync(alarmJsonPath, 'utf-8')

const batchId = generateId()

console.log('===== 实际样例数据统计 =====')
console.log()

console.log('传感器 CSV 实际行数（不含表头）:', countCsvLines(sensorCsvContent))
console.log('备注 CSV 实际行数（不含表头）:', countCsvLines(noteCsvContent))
const alarmData = JSON.parse(alarmJsonContent)
console.log('告警 JSON 数组长度:', Array.isArray(alarmData) ? alarmData.length : '非数组')
console.log()

const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', batchId)
const noteResult = parseNoteCSV(noteCsvContent, 'manual_notes.csv', batchId)
const alarmResult = parseAlarmJSON(alarmJsonContent, 'alarm_data.json', batchId)

console.log('===== 导入结果（含错误） =====')
console.log(`传感器: 成功 ${sensorResult.records.length} 条, 错误 ${sensorResult.errors.length} 条`)
console.log(`按设备分:`, JSON.stringify(groupByDevice(sensorResult.records as any[])))
console.log(`备注:   成功 ${noteResult.records.length} 条, 错误 ${noteResult.errors.length} 条`)
console.log(`按设备分:`, JSON.stringify(groupByDevice(noteResult.records as any[])))
console.log(`告警:   成功 ${alarmResult.records.length} 条, 错误 ${alarmResult.errors.length} 条`)
console.log(`按设备分:`, JSON.stringify(groupByDevice(alarmResult.records as any[])))
console.log()

const sensorEvidences = detectSensorAnomalies(sensorResult.records as any[], DEFAULT_THRESHOLD)
const noteEvidences = notesToEvidence(noteResult.records as any[])
const alarmEvidences = alarmsToEvidence(alarmResult.records as any[])

console.log('===== 异常检测生成证据 =====')
console.log(`传感器异常证据: ${sensorEvidences.length} 条`)
const sensorByDevice: Record<string, number> = {}
const sensorByType: Record<string, number> = {}
for (const e of sensorEvidences) {
  sensorByDevice[e.device_id] = (sensorByDevice[e.device_id] || 0) + 1
  sensorByType[e.sub_type] = (sensorByType[e.sub_type] || 0) + 1
}
console.log(`  按设备:`, JSON.stringify(sensorByDevice))
console.log(`  按类型:`, JSON.stringify(sensorByType))
console.log(`备注转证据:     ${noteEvidences.length} 条`)
console.log(`告警转证据:     ${alarmEvidences.length} 条`)
console.log(`证据总计:       ${sensorEvidences.length + noteEvidences.length + alarmEvidences.length} 条`)
console.log()

const allEvidences = [...sensorEvidences, ...noteEvidences, ...alarmEvidences]
const mergeResult = mergeEvents(allEvidences, DEFAULT_THRESHOLD.merge_window_minutes)

console.log('===== 事件归并结果（默认阈值） =====')
console.log(`事件总数: ${mergeResult.events.length} 个`)
for (const ev of mergeResult.events) {
  const evds = mergeResult.evidences.filter(e => e.event_id === ev.id)
  const types = [...new Set(evds.map(e => `${e.type}${e.sub_type ? ':' + e.sub_type : ''}`))]
  console.log(`  [${ev.id.slice(0, 8)}] ${ev.device_id} - ${ev.evidence_count} 条证据, 状态: ${ev.status}, 类型: [${types.join(', ')}]`)
  console.log(`      时间: ${new Date(ev.start_time).toLocaleString('zh-CN')} ~ ${new Date(ev.end_time).toLocaleString('zh-CN')}`)
}
console.log()
console.log(`阈值配置: 温度 ${DEFAULT_THRESHOLD.temp_min}~${DEFAULT_THRESHOLD.temp_max}°C, 电压 ${DEFAULT_THRESHOLD.voltage_min}~${DEFAULT_THRESHOLD.voltage_max}V, 离线 ${DEFAULT_THRESHOLD.offline_minutes}分钟, 合并窗口 ${DEFAULT_THRESHOLD.merge_window_minutes}分钟`)
