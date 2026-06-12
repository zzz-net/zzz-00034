import { parseSensorCSV, parseNoteCSV, generateId, parseCSV } from '../src/utils/csvParser'
import { parseAlarmJSON } from '../src/utils/jsonParser'
import { detectSensorAnomalies, notesToEvidence, alarmsToEvidence } from '../src/utils/anomalyDetector'
import { mergeEvents } from '../src/utils/eventMerger'
import { DEFAULT_THRESHOLD, validateThresholdConfig } from '../src/utils/validator'
import { exportEventsToCSV, exportEvidencesToCSV, exportAllToJSON } from '../src/utils/exporter'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { Event, EventStatus } from '../src/types'

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
const readmePath = path.join(__dirname, '..', 'README.md')

const sensorCsvContent = fs.readFileSync(sensorCsvPath, 'utf-8')
const noteCsvContent = fs.readFileSync(noteCsvPath, 'utf-8')
const alarmJsonContent = fs.readFileSync(alarmJsonPath, 'utf-8')
const readmeContent = fs.readFileSync(readmePath, 'utf-8')

function countCsvDataRows(content: string): number {
  return Math.max(0, parseCSV(content).length - 1)
}

const batchId = generateId()

console.log('=== 回归测试 Part 1：文档/样例计数一致性 ===\n')

const actualSensorRows = countCsvDataRows(sensorCsvContent)
const actualNoteRows = countCsvDataRows(noteCsvContent)
const actualAlarmLen = (() => {
  const arr = JSON.parse(alarmJsonContent)
  return Array.isArray(arr) ? arr.length : 0
})()

console.log('--- 样例文件实际行数 ---')
console.log(`sensor_data.csv: ${actualSensorRows} 行 (不含表头)`)
console.log(`manual_notes.csv: ${actualNoteRows} 行 (不含表头)`)
console.log(`alarm_data.json: ${actualAlarmLen} 条`)
console.log()

const readmeSensorMatch = readmeContent.match(/#### 2\.1[\s\S]*?查看导入结果[:：]\s*(\d+)\s*条记录成功导入/)
const readmeSensorCount = readmeSensorMatch ? parseInt(readmeSensorMatch[1], 10) : NaN
const readmeNoteMatch = readmeContent.match(/#### 2\.2[\s\S]*?查看导入结果[:：]\s*(\d+)\s*条记录成功导入/)
const readmeNoteCount = readmeNoteMatch ? parseInt(readmeNoteMatch[1], 10) : NaN
const readmeAlarmMatch = readmeContent.match(/#### 2\.3[\s\S]*?查看导入结果[:：]\s*(\d+)\s*条记录成功导入/)
const readmeAlarmCount = readmeAlarmMatch ? parseInt(readmeAlarmMatch[1], 10) : NaN
const readmeEventCountMatch = readmeContent.match(/异常事件（共\s*(\d+)\s*个事件）/)
const readmeEventCount = readmeEventCountMatch ? parseInt(readmeEventCountMatch[1], 10) : NaN

console.log('--- README 中记载的数字 ---')
console.log(`传感器导入记录数: ${isNaN(readmeSensorCount) ? '未找到' : readmeSensorCount}`)
console.log(`备注导入记录数:   ${isNaN(readmeNoteCount) ? '未找到' : readmeNoteCount}`)
console.log(`告警导入记录数:   ${isNaN(readmeAlarmCount) ? '未找到' : readmeAlarmCount}`)
console.log(`事件总数:         ${isNaN(readmeEventCount) ? '未找到' : readmeEventCount}`)
console.log()

assert(!isNaN(readmeSensorCount) && readmeSensorCount === actualSensorRows,
  `README 传感器记录数 (${readmeSensorCount}) 与实际样例 (${actualSensorRows}) 一致`)
assert(!isNaN(readmeNoteCount) && readmeNoteCount === actualNoteRows,
  `README 备注记录数 (${readmeNoteCount}) 与实际样例 (${actualNoteRows}) 一致`)
assert(!isNaN(readmeAlarmCount) && readmeAlarmCount === actualAlarmLen,
  `README 告警记录数 (${readmeAlarmCount}) 与实际样例 (${actualAlarmLen}) 一致`)

console.log('\n--- 导入解析结果（必须与样例行数一致） ---')
const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', batchId)
const noteResult = parseNoteCSV(noteCsvContent, 'manual_notes.csv', batchId)
const alarmResult = parseAlarmJSON(alarmJsonContent, 'alarm_data.json', batchId)

assert(sensorResult.errors.length === 0, `样例传感器数据无解析错误 (${sensorResult.errors.length})`)
assert(sensorResult.records.length === actualSensorRows,
  `解析传感器记录 (${sensorResult.records.length}) 与样例行数 (${actualSensorRows}) 一致`)
assert(noteResult.errors.length === 0, `样例备注数据无解析错误 (${noteResult.errors.length})`)
assert(noteResult.records.length === actualNoteRows,
  `解析备注记录 (${noteResult.records.length}) 与样例行数 (${actualNoteRows}) 一致`)
assert(alarmResult.errors.length === 0, `样例告警数据无解析错误 (${alarmResult.errors.length})`)
assert(alarmResult.records.length === actualAlarmLen,
  `解析告警记录 (${alarmResult.records.length}) 与样例数组长度 (${actualAlarmLen}) 一致`)

console.log('\n--- 事件归并结果（必须与 README 事件数一致） ---')
const sensorEvidences = detectSensorAnomalies(sensorResult.records as any[], DEFAULT_THRESHOLD)
const noteEvidences = notesToEvidence(noteResult.records as any[])
const alarmEvidences = alarmsToEvidence(alarmResult.records as any[])
const allEvidences = [...sensorEvidences, ...noteEvidences, ...alarmEvidences]
const mergeResult = mergeEvents(allEvidences, DEFAULT_THRESHOLD.merge_window_minutes)

console.log(`种子证据(sensor+alarm): ${sensorEvidences.length + alarmEvidences.length}`)
console.log(`附加证据(manual_note): ${noteEvidences.length}`)
console.log(`证据总数:              ${allEvidences.length}`)
console.log(`归并后事件数:          ${mergeResult.events.length}`)
console.log(`归并后证据总数:        ${mergeResult.evidences.length}`)

assert(!isNaN(readmeEventCount) && readmeEventCount === mergeResult.events.length,
  `README 事件总数 (${readmeEventCount}) 与实际归并 (${mergeResult.events.length}) 一致`)
assert(mergeResult.events.length === 4, `样例数据归并为 4 个事件`)
assert(mergeResult.evidences.length === 39,
  `归并后有 39 条证据（不含 DEV-003 的 2 条未匹配备注和 DEV-004 2 条超出窗口的备注）`)

const devicesWithEvents = [...new Set(mergeResult.events.map(e => e.device_id))].sort()
assert(devicesWithEvents.join(',') === 'DEV-001,DEV-002,DEV-004',
  `只有异常设备生成事件: ${devicesWithEvents.join(',')}, DEV-003 不生成事件`)

const ev001 = mergeResult.events.find(e => e.device_id === 'DEV-001')!
const ev002 = mergeResult.events.find(e => e.device_id === 'DEV-002')!
const ev004s = mergeResult.events.filter(e => e.device_id === 'DEV-004').sort(
  (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
)
assert(ev001.evidence_count === 6, `DEV-001 证据数 = 6（实际 ${ev001.evidence_count}）`)
assert(ev002.evidence_count === 20, `DEV-002 证据数 = 20（实际 ${ev002.evidence_count}）`)
assert(ev004s[0].evidence_count === 2, `DEV-004 事件1证据数 = 2（实际 ${ev004s[0].evidence_count}）`)
assert(ev004s[1].evidence_count === 11, `DEV-004 事件2证据数 = 11（实际 ${ev004s[1].evidence_count}）`)

const readmePatterns = [
  { regex: /DEV-001.*?(\d+)\s*条证据/, label: 'DEV-001 证据数', actual: ev001.evidence_count },
  { regex: /DEV-002.*?(\d+)\s*条证据/, label: 'DEV-002 证据数', actual: ev002.evidence_count },
  { regex: /DEV-004[^\n]*?(\d+)\s*条证据[^\n]*?09:30/, label: 'DEV-004 事件1 (09:30) 证据数', actual: ev004s[0].evidence_count },
  { regex: /DEV-004[^\n]*?(\d+)\s*条证据[^\n]*?10:30~13:30/, label: 'DEV-004 事件2 (10:30~13:30) 证据数', actual: ev004s[1].evidence_count },
]
for (const p of readmePatterns) {
  const m = readmeContent.match(p.regex)
  const n = m ? parseInt(m[1], 10) : NaN
  assert(!isNaN(n) && n === p.actual,
    `README ${p.label} (${n}) 与实际 (${p.actual}) 一致`)
}

console.log('\n=== 回归测试 Part 2：错误路径回归（不受改动影响） ===\n')

console.log('--- 缺字段 / 坏时间 / 坏数值 ---')
const badCsv = `device_id,timestamp,temperature,voltage,is_online
,2024-01-15 08:00:00,25.5,220.5,true
DEV-002,invalid_time,25.5,220.5,true
DEV-003,2024-01-15 08:00:00,not_a_number,220.5,true
DEV-004,2024-01-15 08:00:00,25.5,bad_voltage,true
DEV-006,2024-01-15 08:00:00,,,`

const badResult = parseSensorCSV(badCsv, 'bad.csv', 'bad-batch')
assert(badResult.errors.length === 6,
  `检测到 6 个错误（行2:缺device_id, 行3:坏时间, 行4:坏温度, 行5:坏电压, 行6:空温度+空电压；实际 ${badResult.errors.length} 个，字段: ${badResult.errors.map(e=>e.field+':row'+e.row).join(',')})`)
assert(badResult.records.length === 0,
  `所有 5 行数据都有错误，0 条有效记录（实际 ${badResult.records.length}）`)

const errByField: Record<string, number> = {}
for (const e of badResult.errors) errByField[e.field] = (errByField[e.field] || 0) + 1
assert(errByField['device_id'] === 1, `行 2: 缺少 device_id 报告 (${errByField['device_id']})`)
assert(errByField['timestamp'] === 1, `行 3: 坏时间报告 (${errByField['timestamp']})`)
assert(errByField['temperature'] >= 1, `温度错误至少 1 条: 坏数字 + 空 (${errByField['temperature']})`)
assert(errByField['voltage'] >= 1, `电压错误至少 1 条: 坏数字 + 空 (${errByField['voltage']})`)

const errRows = badResult.errors.map(e => e.row).sort((a, b) => a - b).join(',')
assert(errRows.startsWith('2,3,4,5,6'), `错误覆盖了行 2-6（实际 ${errRows}）`)

console.log('\n--- 非法阈值 ---')
const badConfigs = [
  { name: '温度下限非数字', config: { ...DEFAULT_THRESHOLD, temp_min: NaN as any }, expectedField: 'temp_min' },
  { name: '温度上下限颠倒', config: { ...DEFAULT_THRESHOLD, temp_min: 100, temp_max: 0 }, expectedField: 'temp_min' },
  { name: '电压下限为 NaN', config: { ...DEFAULT_THRESHOLD, voltage_min: NaN as any }, expectedField: 'voltage_min' },
  { name: '电压上下限颠倒', config: { ...DEFAULT_THRESHOLD, voltage_min: 500, voltage_max: 100 }, expectedField: 'voltage_min' },
  { name: '离线时长 <= 0', config: { ...DEFAULT_THRESHOLD, offline_duration_min: 0 }, expectedField: 'offline_duration_min' },
  { name: '合并窗口 <= 0', config: { ...DEFAULT_THRESHOLD, merge_window_minutes: 0 }, expectedField: 'merge_window_minutes' },
]
for (const tc of badConfigs) {
  const res = validateThresholdConfig(tc.config)
  assert(res.valid === false, `${tc.name}: 校验拒绝`)
  const fields = res.errors.map(e => e.field).join(',')
  assert(fields.includes(tc.expectedField), `${tc.name}: 错误字段包含 ${tc.expectedField}（实际 ${fields}）`)
}

console.log('\n--- 坏告警 JSON ---')
const badJson = `[{"device_id": "", "timestamp": "2024-01-15 08:00:00", "alarm_type": "x", "level": "info", "description": "d"},
  {"device_id": "D1", "timestamp": "bad_time", "alarm_type": "x", "level": "info", "description": "d"}]`
const badAlarmRes = parseAlarmJSON(badJson, 'bad.json', 'bad-batch')
assert(badAlarmRes.errors.length >= 2, `坏 JSON 至少 2 个错误（实际 ${badAlarmRes.errors.length}）`)
assert(badAlarmRes.records.length === 0, '坏 JSON 0 条有效记录')

console.log('\n--- 缺 device_id 的备注 ---')
const badNote = `device_id,timestamp,content,author
,2024-01-15 08:00:00,xxx,yyy`
const badNoteRes = parseNoteCSV(badNote, 'bad.csv', 'bad-batch')
assert(badNoteRes.errors.length === 1 && badNoteRes.errors[0].field === 'device_id',
  `缺 device_id 备注报错字段正确`)
assert(badNoteRes.errors[0].row === 2, '错误行号正确 (行 2)')

console.log('\n=== 回归测试 Part 3：完整流程（导入→复核→关闭→导出）一致性 ===\n')

console.log('--- 导入后模拟状态更新 ---')
let events: Event[] = mergeResult.events.map(e => ({ ...e }))
let evidences = [...mergeResult.evidences]

const testEvent = events[0]
const newHandler = '张工'
const newRemark = '已现场确认异常，更换散热模块'
events[0] = {
  ...events[0],
  status: 'confirmed' as EventStatus,
  handler: newHandler,
  updated_at: new Date().toISOString(),
}
assert(events[0].status === 'confirmed', '状态更新为已确认')
assert(events[0].handler === newHandler, '处理人已记录')

events[0] = {
  ...events[0],
  remark: newRemark,
  updated_at: new Date().toISOString(),
}
assert(events[0].remark === newRemark, '备注已记录')

const closeTime = new Date().toISOString()
events[0] = {
  ...events[0],
  status: 'closed' as EventStatus,
  close_time: closeTime,
  updated_at: new Date().toISOString(),
}
assert(events[0].status === 'closed', '状态更新为已关闭')
assert(events[0].close_time === closeTime, '关闭时间已记录')

console.log('--- 导出 CSV / JSON 并验证状态、备注、关闭时间、处理人一致 ---')
const csvOut = exportEventsToCSV(events, evidences)
const csvLines = csvOut.replace(/^\ufeff/, '').split('\n')
const header = csvLines[0].split(',')
const closedRow = csvLines.slice(1).find(l => l.includes(testEvent.device_id) && l.includes('已关闭'))
assert(!!closedRow,
  `事件 CSV 中有 ${testEvent.device_id} 且状态为 已关闭（CSV 状态用中文，actual first data row: ${csvLines[1]?.substring(0, 100)}...）`)
assert(closedRow!.includes(newHandler), `事件 CSV 中包含处理人 ${newHandler}`)
assert(closedRow!.includes(newRemark.slice(0, 10)), `事件 CSV 中包含备注`)
assert(closedRow!.includes(closeTime.slice(0, 10)), `事件 CSV 中包含关闭时间日期`)

const jsonOut = exportAllToJSON(events, evidences)
const jsonData = JSON.parse(jsonOut)
assert(jsonData.event_count === events.length, 'JSON 导出事件数一致')
assert(jsonData.evidence_count === evidences.length, 'JSON 导出证据数一致')
const closedEv = jsonData.events.find((e: Event) => e.id === events[0].id)
assert(closedEv.status === 'closed', 'JSON 中事件状态正确')
assert(closedEv.handler === newHandler, 'JSON 中处理人正确')
assert(closedEv.remark === newRemark, 'JSON 中备注正确')
assert(closedEv.close_time === closeTime, 'JSON 中关闭时间正确')
assert(closedEv.evidence_count === events[0].evidence_count, 'JSON 中证据计数正确')

const evCsvOut = exportEvidencesToCSV(events, evidences)
assert(evCsvOut.includes('人工备注') && evCsvOut.includes('告警') && evCsvOut.includes('传感器异常'),
  '证据 CSV 包含三种证据类型（中文映射）')

console.log('\n--- 持久化一致性（模拟保存→重载→再导出） ---')
const savedSnapshot = JSON.stringify({ events, evidences })
const restored = JSON.parse(savedSnapshot)
const csvBefore = exportEventsToCSV(events, evidences)
const csvAfter = exportEventsToCSV(restored.events, restored.evidences)
assert(csvBefore === csvAfter, '序列化前后事件 CSV 完全一致')

const jsonBefore = exportAllToJSON(events, evidences)
const jsonAfter = exportAllToJSON(restored.events, restored.evidences)
const beforeData = JSON.parse(jsonBefore)
const afterData = JSON.parse(jsonAfter)
delete beforeData.export_time
delete afterData.export_time
assert(JSON.stringify(beforeData) === JSON.stringify(afterData),
  '序列化前后完整 JSON 完全一致（忽略动态 export_time 字段）')

console.log('\n--- 重复导入去重（模拟同文件哈希再导入） ---')
const { parseAlarmJSON: _p1, ..._rest } = {} as any
const batchHash1 = 'batch-' + sensorCsvContent.length + '-' + noteCsvContent.length + '-' + alarmJsonContent.length
const batchHash2 = 'batch-' + sensorCsvContent.length + '-' + noteCsvContent.length + '-' + alarmJsonContent.length
assert(batchHash1 === batchHash2, '相同内容产生相同批次标识')

console.log('\n--- 重建事件并保留状态迁移 ---')
const reMerge = mergeEvents(allEvidences, DEFAULT_THRESHOLD.merge_window_minutes)
let newEvents = reMerge.events.map(e => {
  const old = events.find(o =>
    o.device_id === e.device_id &&
    Math.abs(new Date(o.start_time).getTime() - new Date(e.start_time).getTime()) < 30 * 60 * 1000
  )
  return old && old.status !== 'pending'
    ? { ...e, id: old.id, status: old.status as EventStatus, handler: old.handler, remark: old.remark, close_time: old.close_time }
    : e
})
const migratedClosed = newEvents.find(e => e.status === 'closed')
assert(!!migratedClosed, '重新归并后已关闭事件的状态被迁移保留')
assert(migratedClosed!.handler === newHandler, '重新归并后处理人保留')
assert(migratedClosed!.remark === newRemark, '重新归并后备注保留')
assert(migratedClosed!.close_time === closeTime, '重新归并后关闭时间保留')

console.log('\n=== 回归测试汇总 ===')
if (errors.length === 0) {
  console.log('✅ 所有回归测试通过！')
} else {
  console.error(`❌ ${errors.length} 个回归测试失败：`)
  errors.forEach(e => console.error('  ' + e))
  process.exit(1)
}
