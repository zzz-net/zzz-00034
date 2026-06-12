import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const readmePath = path.join(__dirname, '..', 'README.md')
let content = fs.readFileSync(readmePath, 'utf-8')

console.log('修改前，第 80-100 行：')
content.split('\n').slice(79, 100).forEach((l, i) => console.log((80 + i) + ': ' + JSON.stringify(l)))
console.log()

const oldEventSection = `导入完成后，中间「事件列表」区域会显示自动检测出的异常事件：

- **DEV-001**：温度异常事件（待处理）
- **DEV-002**：电压异常 + 离线事件（待处理）
- **DEV-004**：温度异常事件（待处理）
- **DEV-003**：无异常（运行正常）`

const newEventSection = `导入完成后，中间「事件列表」区域会显示自动检测出的异常事件（共 4 个事件）：

- **DEV-001**：温度异常 + 告警 + 备注，6 条证据，08:45~09:30（待处理）
- **DEV-002**：电压异常 + 离线 + 告警 + 备注，20 条证据，08:20~10:35（待处理）
- **DEV-004**：温度异常 + 告警 + 备注，2 条证据，09:30（待处理）
- **DEV-004**：温度异常 + 告警 + 备注，11 条证据，10:30~13:30（待处理）
- **DEV-003**：无异常（运行正常，仅有正常巡检备注，不触发事件）`

const oldSensorLine = '3. 查看导入结果：37 条记录成功导入'
const newSensorLine = '3. 查看导入结果：60 条记录成功导入（DEV-001:13条、DEV-002:19条、DEV-003:9条、DEV-004:19条）'

if (content.includes(oldSensorLine)) {
  content = content.replace(oldSensorLine, newSensorLine)
  console.log('✓ 已替换传感器记录数：37 → 60')
} else if (content.includes(newSensorLine)) {
  console.log('（传感器记录数已是 60，无需修改）')
} else {
  console.error('✗ 找不到传感器记录数的目标行')
}

if (content.includes(oldEventSection)) {
  content = content.replace(oldEventSection, newEventSection)
  console.log('✓ 已替换事件列表说明（添加证据计数+时间范围）')
} else if (content.includes('6 条证据') && content.includes('20 条证据')) {
  console.log('（事件列表说明已是新版本，无需修改）')
} else {
  console.error('✗ 找不到事件列表的目标段落，当前内容：')
  const i = content.indexOf('导入完成后')
  if (i >= 0) console.log(JSON.stringify(content.slice(i, i + 300)))
}

fs.writeFileSync(readmePath, content, 'utf-8')
console.log('\n✓ 已写入 README.md')

console.log('\n验证修改：')
const again = fs.readFileSync(readmePath, 'utf-8')
const m1 = again.match(/异常事件（共\s*(\d+)\s*个事件）/)
const m2 = again.match(/#### 2\.1[\s\S]*?查看导入结果[:：]\s*(\d+)\s*条记录成功导入/)
console.log('  共 N 个事件 →', m1 ? m1[1] : '未找到')
console.log('  传感器导入记录数 →', m2 ? m2[1] : '未找到')
const m3 = again.match(/DEV-001[\s\S]*?(\d+)\s*条证据/)
const m4 = again.match(/DEV-002[\s\S]*?(\d+)\s*条证据/)
console.log('  DEV-001 证据数 →', m3 ? m3[1] : '未找到')
console.log('  DEV-002 证据数 →', m4 ? m4[1] : '未找到')
