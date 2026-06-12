import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const readmePath = path.join(__dirname, '..', 'README.md')
const content = fs.readFileSync(readmePath, 'utf-8')

const patterns: { regex: RegExp; label: string }[] = [
  { regex: /异常事件（共\s*(\d+)\s*个事件）/, label: '事件总数' },
  { regex: /DEV-001[\s\S]*?(\d+)\s*条证据/, label: 'DEV-001 证据数' },
  { regex: /DEV-002[\s\S]*?(\d+)\s*条证据/, label: 'DEV-002 证据数' },
  { regex: /DEV-004[\s\S]*?09:30[\s\S]{0,80}?(\d+)\s*条证据/, label: 'DEV-004 事件1 (09:30)' },
  { regex: /DEV-004[\s\S]*?10:30~13:30[\s\S]{0,80}?(\d+)\s*条证据/, label: 'DEV-004 事件2 (10:30~13:30)' },
]

// 先打印关键部分
const idx = content.indexOf('查看事件列表')
console.log('### 查看事件列表部分（前 800 字符）:')
console.log(content.slice(idx, idx + 1000))
console.log('\n---\n')

for (const p of patterns) {
  const m = content.match(p.regex)
  console.log(`${p.label}: regex=${p.regex}`)
  if (m) {
    console.log(`  ✓ 匹配数字 = ${m[1]}`)
    console.log(`    匹配上下文: ...${m[0].slice(0, 120).replace(/\n/g, '\\n')}...`)
  } else {
    console.log('  ✗ 未匹配')
    // 检查关键字符串是否存在
    if (p.label === '事件总数') {
      console.log('  检查"异常事件"字符串:', content.includes('异常事件'))
      console.log('  检查"个事件"字符串:', content.includes('个事件'))
      const i = content.indexOf('异常事件')
      if (i >= 0) console.log('  上下文:', JSON.stringify(content.slice(i, i + 50)))
    }
  }
  console.log()
}
