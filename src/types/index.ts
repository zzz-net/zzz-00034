export type EventStatus = 'pending' | 'confirmed' | 'false_alarm' | 'closed'

export type EvidenceType = 'sensor_anomaly' | 'manual_note' | 'alarm'

export type FileType = 'sensor' | 'note' | 'alarm'

export type ReplayMode = 'overwrite' | 'merge' | 'skip'

export interface ThresholdConfig {
  temp_min: number
  temp_max: number
  voltage_min: number
  voltage_max: number
  offline_duration_min: number
  merge_window_minutes: number
}

export interface SensorRecord {
  id: string
  device_id: string
  timestamp: string
  temperature: number
  voltage: number
  is_online: boolean
  source_file: string
  batch_id: string
}

export interface ManualNote {
  id: string
  device_id: string
  timestamp: string
  content: string
  author: string
  source_file: string
  batch_id: string
}

export interface AlarmRecord {
  id: string
  device_id: string
  timestamp: string
  alarm_type: string
  level: string
  description: string
  source_file: string
  batch_id: string
}

export interface Evidence {
  id: string
  event_id: string
  device_id: string
  timestamp: string
  type: EvidenceType
  description: string
  anomaly_type?: 'temperature' | 'voltage' | 'offline'
  raw_data: Record<string, unknown>
  source_file: string
}

export interface Event {
  id: string
  device_id: string
  start_time: string
  end_time: string
  status: EventStatus
  handler: string
  remark: string
  close_time: string | null
  created_at: string
  updated_at: string
  evidence_count: number
}

export interface ImportError {
  row: number
  field: string
  value: string
  message: string
}

export interface ImportBatch {
  id: string
  file_type: FileType
  file_name: string
  import_time: string
  record_count: number
  error_count: number
  errors: ImportError[]
  file_hash: string
  conflicts?: ConflictDetail[]
  replay_mode?: ReplayMode
  resolution_summary?: string
  affected_event_ids?: string[]
}

export interface ImportResult {
  success: boolean
  batch: ImportBatch | null
  records: SensorRecord[] | ManualNote[] | AlarmRecord[]
  errors: ImportError[]
  isDuplicate: boolean
}

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
}

export interface ConflictDetail {
  device_id: string
  timestamp: string
  existing_source: string
  new_source: string
  conflict_type: 'same_device_time' | 'batch_duplicate'
  description: string
}

export interface FilePreview {
  file_type: FileType
  file_name: string
  file_hash: string
  total_rows: number
  valid_count: number
  error_count: number
  errors: ImportError[]
  is_duplicate: boolean
}

export interface ScenePackagePreview {
  package_id: string
  files: FilePreview[]
  new_events_count: number
  merged_events_count: number
  conflicts: ConflictDetail[]
  will_create_sensor_records: number
  will_create_note_records: number
  will_create_alarm_records: number
  timestamp: string
  _sensorRecords: SensorRecord[]
  _noteRecords: ManualNote[]
  _alarmRecords: AlarmRecord[]
  _fileHashes: string[]
}

export interface ScenePackageFile {
  name: string
  hash: string
  file_type: FileType
  content: string
}

export interface ScenePackage {
  version: 1
  exported_at: string
  threshold: ThresholdConfig
  sensor_records: SensorRecord[]
  manual_notes: ManualNote[]
  alarm_records: AlarmRecord[]
  import_batches: ImportBatch[]
  events: Event[]
  evidences: Evidence[]
}

export interface ScenePackageReplayResult {
  success: boolean
  mode: ReplayMode
  skipped_batches: number
  skipped_events: number
  merged_events: number
  overwritten_events: number
  errors: string[]
  imported_batches: ImportBatch[]
  replay_batch?: ImportBatch
  resolution_summary?: string
}
