import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const readmePath = path.join(__dirname, '..', 'README.md')
const content = fs.readFileSync(readmePath, 'utf-8')

console.log('--- 第 60-80 行内容 ---')
content.split('\n').slice(59, 80).forEach((l, i) => console.log((60 + i) + ': ' + l))
console.log()

const s1 = content.indexOf('37')
console.log('字符串 37 的位置:', s1, s1 >= 0 ? content.slice(s1 - 20, s1 + 20) : 'none')

const s2 = content.indexOf('查看导入结果')
let i = 0
let idx = s2
while (idx >= 0) {
  console.log(`"查看导入结果" 第 ${++i} 次出现位置 ${idx}:`, content.slice(idx, idx + 60))
  idx = content.indexOf('查看导入结果', idx + 1)
}

const re1 = /导入传感器数据[\s\S]*?查看导入结果[:：]\s*(\d+)\s*条记录成功导入/
const m1 = content.match(re1)
console.log('\n正则导入传感器匹配:', m1 ? m1[1] + ' (完整匹配前100字符: ' + m1[0].slice(0, 100).replace(/\n/g, '\\n') + ')' : 'null')

const re2 = /共\s*(\d+)\s*个事件/
const m2 = content.match(re2)
console.log('共 N 个事件 匹配:', m2 ? m2[1] : 'null', m2 ? '上下文: ' + content.slice(Math.max(0, m2.index! - 20), m2.index! + 60).replace(/\n/g, '\\n') : '')

const re3 = /DEV-001.*?(\d+)\s*条证据/
const m3 = content.match(re3)
console.log('DEV-001 证据数 匹配:', m3 ? m3[1] : 'null', m3 ? '上下文: ' + m3[0].replace(/\n/g, '\\n') : '')
