import { ImportError, AlarmRecord } from '../types'
import { generateId, parseTimestamp } from './csvParser'

export interface JSONParseResult<T> {
  records: T[]
  errors: ImportError[]
}

export function parseAlarmJSON(
  content: string,
  fileName: string,
  batchId: string
): JSONParseResult<AlarmRecord> {
  const records: AlarmRecord[] = []
  const errors: ImportError[] = []
  
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch (e) {
    errors.push({
      row: 0,
      field: 'json',
      value: content.substring(0, 100),
      message: 'JSON 格式解析失败: ' + (e instanceof Error ? e.message : String(e)),
    })
    return { records, errors }
  }
  
  let alarmArray: unknown[] = []
  
  if (Array.isArray(data)) {
    alarmArray = data
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.data)) {
      alarmArray = obj.data
    } else if (Array.isArray(obj.alarms)) {
      alarmArray = obj.alarms
    } else if (Array.isArray(obj.items)) {
      alarmArray = obj.items
    } else {
      errors.push({
        row: 0,
        field: 'json',
        value: '',
        message: 'JSON 格式不正确，应为数组或包含 data/alarms/items 数组的对象',
      })
      return { records, errors }
    }
  } else {
    errors.push({
      row: 0,
      field: 'json',
      value: String(data),
      message: 'JSON 格式不正确，应为数组或对象',
    })
    return { records, errors }
  }
  
  const requiredFields = ['device_id', 'timestamp', 'alarm_type', 'level', 'description']
  
  alarmArray.forEach((item, index) => {
    const rowNum = index + 1
    
    if (typeof item !== 'object' || item === null) {
      errors.push({
        row: rowNum,
        field: 'item',
        value: String(item),
        message: '告警记录不是有效对象',
      })
      return
    }
    
    const obj = item as Record<string, unknown>
    const missingFields = requiredFields.filter(f => obj[f] === undefined || obj[f] === null)
    
    if (missingFields.length > 0) {
      if (missingFields.includes('device_id')) {
        errors.push({
          row: rowNum,
          field: 'device_id',
          value: '',
          message: '缺少 device_id 字段',
        })
      }
      if (missingFields.includes('timestamp')) {
        errors.push({
          row: rowNum,
          field: 'timestamp',
          value: '',
          message: '缺少 timestamp 字段',
        })
      }
      if (missingFields.includes('alarm_type')) {
        errors.push({
          row: rowNum,
          field: 'alarm_type',
          value: '',
          message: '缺少 alarm_type 字段',
        })
      }
      return
    }
    
    const deviceId = String(obj.device_id).trim()
    const timestampStr = String(obj.timestamp).trim()
    const alarmType = String(obj.alarm_type).trim()
    const level = String(obj.level).trim()
    const description = String(obj.description || '').trim()
    
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
    
    if (hasError) return
    
    records.push({
      id: generateId(),
      device_id: deviceId,
      timestamp: timestamp!.toISOString(),
      alarm_type: alarmType,
      level,
      description,
      source_file: fileName,
      batch_id: batchId,
    })
  })
  
  return { records, errors }
}

export async function generateFileHash(file: File): Promise<string> {
  const content = await file.text()
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `${file.name}-${file.size}-${hash}`
}
