import { ImportError, SensorRecord, ManualNote, FileType } from '../types'

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

export function parseTimestamp(value: string): Date | null {
  if (!value || typeof value !== 'string') return null
  
  const trimmed = value.trim()
  if (!trimmed) return null
  
  const date = new Date(trimmed)
  if (!isNaN(date.getTime())) return date
  
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    /^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})?$/,
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{4})\/(\d{2})\/(\d{2})$/,
  ]
  
  for (const regex of formats) {
    const match = trimmed.match(regex)
    if (match) {
      const [, y, m, d, h = '0', min = '0', s = '0'] = match
      const parsed = new Date(
        parseInt(y),
        parseInt(m) - 1,
        parseInt(d),
        parseInt(h),
        parseInt(min),
        parseInt(s)
      )
      if (!isNaN(parsed.getTime())) return parsed
    }
  }
  
  return null
}

export function parseCSV(content: string): string[][] {
  const lines: string[][] = []
  let currentLine: string[] = []
  let currentField = ''
  let inQuotes = false
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const nextChar = content[i + 1]
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentLine.push(currentField)
        currentField = ''
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') i++
        currentLine.push(currentField)
        if (currentLine.length > 1 || currentLine[0] !== '') {
          lines.push(currentLine)
        }
        currentLine = []
        currentField = ''
      } else {
        currentField += char
      }
    }
  }
  
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField)
    lines.push(currentLine)
  }
  
  return lines
}

export interface CSVParseResult<T> {
  records: T[]
  errors: ImportError[]
  headers: string[]
}

export function parseSensorCSV(
  content: string,
  fileName: string,
  batchId: string
): CSVParseResult<SensorRecord> {
  const rows = parseCSV(content)
  const records: SensorRecord[] = []
  const errors: ImportError[] = []
  
  if (rows.length === 0) {
    return { records, errors, headers: [] }
  }
  
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const requiredFields = ['device_id', 'timestamp', 'temperature', 'voltage', 'is_online']
  
  const missingFields = requiredFields.filter(f => !headers.includes(f))
  if (missingFields.length > 0) {
    errors.push({
      row: 1,
      field: 'header',
      value: headers.join(','),
      message: `缺少必需字段: ${missingFields.join(', ')}`,
    })
    return { records, errors, headers }
  }
  
  const fieldIndex: Record<string, number> = {}
  headers.forEach((h, i) => {
    fieldIndex[h] = i
  })
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    
    if (row.every(cell => !cell.trim())) continue
    
    const deviceId = row[fieldIndex['device_id']]?.trim() || ''
    const timestampStr = row[fieldIndex['timestamp']]?.trim() || ''
    const temperatureStr = row[fieldIndex['temperature']]?.trim() || ''
    const voltageStr = row[fieldIndex['voltage']]?.trim() || ''
    const isOnlineStr = row[fieldIndex['is_online']]?.trim().toLowerCase() || ''
    
    let hasError = false
    
    if (!deviceId) {
      errors.push({
        row: rowNum,
        field: 'device_id',
        value: deviceId,
        message: 'device_id 不能为空',
      })
      hasError = true
    }
    
    const timestamp = parseTimestamp(timestampStr)
    if (!timestamp) {
      errors.push({
        row: rowNum,
        field: 'timestamp',
        value: timestampStr,
        message: '时间格式无法解析',
      })
      hasError = true
    }
    
    const temperature = parseFloat(temperatureStr)
    if (isNaN(temperature)) {
      errors.push({
        row: rowNum,
        field: 'temperature',
        value: temperatureStr,
        message: '温度不是有效数字',
      })
      hasError = true
    }
    
    const voltage = parseFloat(voltageStr)
    if (isNaN(voltage)) {
      errors.push({
        row: rowNum,
        field: 'voltage',
        value: voltageStr,
        message: '电压不是有效数字',
      })
      hasError = true
    }
    
    const isOnline = isOnlineStr === 'true' || isOnlineStr === '1' || isOnlineStr === 'yes'
    
    if (hasError) continue
    
    records.push({
      id: generateId(),
      device_id: deviceId,
      timestamp: timestamp!.toISOString(),
      temperature,
      voltage,
      is_online: isOnline,
      source_file: fileName,
      batch_id: batchId,
    })
  }
  
  return { records, errors, headers }
}

export function parseNoteCSV(
  content: string,
  fileName: string,
  batchId: string
): CSVParseResult<ManualNote> {
  const rows = parseCSV(content)
  const records: ManualNote[] = []
  const errors: ImportError[] = []
  
  if (rows.length === 0) {
    return { records, errors, headers: [] }
  }
  
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const requiredFields = ['device_id', 'timestamp', 'content', 'author']
  
  const missingFields = requiredFields.filter(f => !headers.includes(f))
  if (missingFields.length > 0) {
    errors.push({
      row: 1,
      field: 'header',
      value: headers.join(','),
      message: `缺少必需字段: ${missingFields.join(', ')}`,
    })
    return { records, errors, headers }
  }
  
  const fieldIndex: Record<string, number> = {}
  headers.forEach((h, i) => {
    fieldIndex[h] = i
  })
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    
    if (row.every(cell => !cell.trim())) continue
    
    const deviceId = row[fieldIndex['device_id']]?.trim() || ''
    const timestampStr = row[fieldIndex['timestamp']]?.trim() || ''
    const content = row[fieldIndex['content']]?.trim() || ''
    const author = row[fieldIndex['author']]?.trim() || ''
    
    let hasError = false
    
    if (!deviceId) {
      errors.push({
        row: rowNum,
        field: 'device_id',
        value: deviceId,
        message: 'device_id 不能为空',
      })
      hasError = true
    }
    
    const timestamp = parseTimestamp(timestampStr)
    if (!timestamp) {
      errors.push({
        row: rowNum,
        field: 'timestamp',
        value: timestampStr,
        message: '时间格式无法解析',
      })
      hasError = true
    }
    
    if (!content) {
      errors.push({
        row: rowNum,
        field: 'content',
        value: content,
        message: '备注内容不能为空',
      })
      hasError = true
    }
    
    if (hasError) continue
    
    records.push({
      id: generateId(),
      device_id: deviceId,
      timestamp: timestamp!.toISOString(),
      content,
      author,
      source_file: fileName,
      batch_id: batchId,
    })
  }
  
  return { records, errors, headers }
}

export function getFileTypeFromName(fileName: string): FileType | null {
  const lower = fileName.toLowerCase()
  if (lower.includes('sensor') || lower.includes('传感器')) return 'sensor'
  if (lower.includes('note') || lower.includes('备注') || lower.includes('manual')) return 'note'
  if (lower.includes('alarm') || lower.includes('告警') || lower.includes('alert')) return 'alarm'
  return null
}
