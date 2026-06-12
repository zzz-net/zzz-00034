import { Event, Evidence, EventStatus } from '../types'

const STATUS_MAP: Record<EventStatus, string> = {
  pending: '待处理',
  confirmed: '已确认',
  false_alarm: '误报',
  closed: '已关闭',
}

const EVIDENCE_TYPE_MAP: Record<string, string> = {
  sensor_anomaly: '传感器异常',
  manual_note: '人工备注',
  alarm: '告警',
}

function toCSVRow(values: string[]): string {
  return values
    .map(v => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return '"' + v.replace(/"/g, '""') + '"'
      }
      return v
    })
    .join(',')
}

export function exportEventsToCSV(
  events: Event[],
  evidences: Evidence[]
): string {
  const headers = [
    '事件ID',
    '设备ID',
    '开始时间',
    '结束时间',
    '状态',
    '处理人',
    '备注',
    '关闭时间',
    '证据数量',
    '创建时间',
    '更新时间',
  ]
  
  const rows: string[] = [toCSVRow(headers)]
  
  for (const event of events) {
    rows.push(toCSVRow([
      event.id,
      event.device_id,
      event.start_time,
      event.end_time,
      STATUS_MAP[event.status] || event.status,
      event.handler,
      event.remark,
      event.close_time || '',
      String(event.evidence_count),
      event.created_at,
      event.updated_at,
    ]))
  }
  
  return '\ufeff' + rows.join('\n')
}

export function exportEvidencesToCSV(
  events: Event[],
  evidences: Evidence[]
): string {
  const headers = [
    '证据ID',
    '事件ID',
    '设备ID',
    '时间',
    '类型',
    '描述',
    '来源文件',
    '事件状态',
    '处理人',
    '备注',
  ]
  
  const eventMap = new Map(events.map(e => [e.id, e]))
  const rows: string[] = [toCSVRow(headers)]
  
  for (const ev of evidences) {
    const event = eventMap.get(ev.event_id)
    rows.push(toCSVRow([
      ev.id,
      ev.event_id,
      ev.device_id,
      ev.timestamp,
      EVIDENCE_TYPE_MAP[ev.type] || ev.type,
      ev.description,
      ev.source_file,
      event ? (STATUS_MAP[event.status] || event.status) : '',
      event?.handler || '',
      event?.remark || '',
    ]))
  }
  
  return '\ufeff' + rows.join('\n')
}

export function exportAllToJSON(
  events: Event[],
  evidences: Evidence[]
): string {
  const data = {
    export_time: new Date().toISOString(),
    event_count: events.length,
    evidence_count: evidences.length,
    events: events.map(e => ({
      ...e,
      status_text: STATUS_MAP[e.status] || e.status,
    })),
    evidences: evidences.map(e => ({
      ...e,
      type_text: EVIDENCE_TYPE_MAP[e.type] || e.type,
    })),
  }
  
  return JSON.stringify(data, null, 2)
}

export function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
