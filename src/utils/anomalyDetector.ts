import { ThresholdConfig, SensorRecord, ManualNote, AlarmRecord, Evidence } from '../types'
import { generateId } from './csvParser'

export function detectSensorAnomalies(
  records: SensorRecord[],
  config: ThresholdConfig
): Evidence[] {
  const evidences: Evidence[] = []
  
  const deviceRecords = new Map<string, SensorRecord[]>()
  for (const record of records) {
    if (!deviceRecords.has(record.device_id)) {
      deviceRecords.set(record.device_id, [])
    }
    deviceRecords.get(record.device_id)!.push(record)
  }
  
  for (const [deviceId, deviceRecordList] of deviceRecords) {
    const sorted = [...deviceRecordList].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    
    let offlineStart: string | null = null
    
    for (let i = 0; i < sorted.length; i++) {
      const record = sorted[i]
      const anomalies: string[] = []
      const anomalyTypes: Array<'temperature' | 'voltage' | 'offline'> = []
      
      if (record.temperature < config.temp_min) {
        anomalies.push(`温度 ${record.temperature}°C 低于下限 ${config.temp_min}°C`)
        anomalyTypes.push('temperature')
      }
      if (record.temperature > config.temp_max) {
        anomalies.push(`温度 ${record.temperature}°C 高于上限 ${config.temp_max}°C`)
        anomalyTypes.push('temperature')
      }
      
      if (record.voltage < config.voltage_min) {
        anomalies.push(`电压 ${record.voltage}V 低于下限 ${config.voltage_min}V`)
        anomalyTypes.push('voltage')
      }
      if (record.voltage > config.voltage_max) {
        anomalies.push(`电压 ${record.voltage}V 高于上限 ${config.voltage_max}V`)
        anomalyTypes.push('voltage')
      }
      
      if (!record.is_online) {
        if (!offlineStart) {
          offlineStart = record.timestamp
        }
        
        if (i === sorted.length - 1 || sorted[i + 1].is_online) {
          const offlineDuration = 
            (new Date(record.timestamp).getTime() - new Date(offlineStart).getTime()) / 60000
          
          if (offlineDuration >= config.offline_duration_min) {
            anomalies.push(
              `设备离线 ${offlineDuration.toFixed(1)} 分钟（超过阈值 ${config.offline_duration_min} 分钟）`
            )
            anomalyTypes.push('offline')
          }
          offlineStart = null
        }
      } else {
        offlineStart = null
      }
      
      if (anomalies.length > 0) {
        evidences.push({
          id: generateId(),
          event_id: '',
          device_id: deviceId,
          timestamp: record.timestamp,
          type: 'sensor_anomaly',
          description: anomalies.join('; '),
          anomaly_type: anomalyTypes[0],
          raw_data: {
            temperature: record.temperature,
            voltage: record.voltage,
            is_online: record.is_online,
          },
          source_file: record.source_file,
        })
      }
    }
  }
  
  return evidences
}

export function notesToEvidence(notes: ManualNote[]): Evidence[] {
  return notes.map(note => ({
    id: generateId(),
    event_id: '',
    device_id: note.device_id,
    timestamp: note.timestamp,
    type: 'manual_note',
    description: `[${note.author}] ${note.content}`,
    raw_data: {
      content: note.content,
      author: note.author,
    },
    source_file: note.source_file,
  }))
}

export function alarmsToEvidence(alarms: AlarmRecord[]): Evidence[] {
  return alarms.map(alarm => ({
    id: generateId(),
    event_id: '',
    device_id: alarm.device_id,
    timestamp: alarm.timestamp,
    type: 'alarm',
    description: `[${alarm.level}] ${alarm.alarm_type}: ${alarm.description}`,
    raw_data: {
      alarm_type: alarm.alarm_type,
      level: alarm.level,
      description: alarm.description,
    },
    source_file: alarm.source_file,
  }))
}
