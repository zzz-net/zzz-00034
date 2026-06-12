import { parseSensorCSV, parseCSV } from '../src/utils/csvParser'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const sensorCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'sensor_data.csv')
const content = fs.readFileSync(sensorCsvPath, 'utf-8')

console.log('文件内容前500字符:')
console.log(JSON.stringify(content.substring(0, 500)))
console.log()

const rows = parseCSV(content)
console.log(`解析得到 ${rows.length} 行`)
console.log('前3行:')
console.log(rows[0])
console.log(rows[1])
console.log(rows[2])
console.log()
console.log('第24行（DEV-002 第一条离线）:')
console.log(rows[23])
console.log()

const result = parseSensorCSV(content, 'test.csv', 'batch-1')
console.log(`解析得到 ${result.records.length} 条记录`)
console.log(`错误数: ${result.errors.length}`)
if (result.errors.length > 0) {
  console.log('前5个错误:')
  result.errors.slice(0, 5).forEach(e => console.log(e))
}

const devices = new Set(result.records.map(r => r.device_id))
console.log(`设备数: ${devices.size}`)
console.log('设备:', Array.from(devices))
