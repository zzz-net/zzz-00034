export type EventStatus = 'pending' | 'confirmed' | 'false_alarm' | 'closed'

export type EvidenceType = 'sensor_anomaly' | 'manual_note' | 'alarm'

export type FileType = 'sensor' | 'note' | 'alarm'

export type ReplayMode = 'overwrite' | 'merge' | 'skip'

export type SessionActionType = 'import' | 'replay' | 'undo' | 'threshold_change'

export type UndoStatus = 'active' | 'undone' | 'superseded'

export type ConflictChoiceType = 'merge' | 'skip' | 'overwrite' | 'keep_both'

export interface ConflictChoice {
  conflict_type: 'same_device_time' | 'batch_duplicate' | 'undone_session' | 'threshold_diff'
  key: string
  device_id?: string
  timestamp?: string
  existing_source: string
  new_source: string
  choice: ConflictChoiceType
  description: string
}

export interface SessionAuditBreakdown {
  new_sensor_records: number
  new_note_records: number
  new_alarm_records: number
  skipped_duplicate_records: number
  new_events: number
  merged_events: number
  overwritten_events: number
  skipped_events: number
  conflicts_detected: number
  conflicts_resolved: number
}

export interface ImportSession {
  id: string
  action_type: SessionActionType
  package_id: string
  created_at: string
  batch_ids: string[]
  affected_event_ids: string[]
  new_event_ids: string[]
  merged_event_ids: string[]
  overwritten_event_ids: string[]
  skipped_event_ids: string[]
  new_sensor_record_ids: string[]
  new_note_record_ids: string[]
  new_alarm_record_ids: string[]
  skipped_sensor_record_ids: string[]
  skipped_note_record_ids: string[]
  skipped_alarm_record_ids: string[]
  threshold_before: ThresholdConfig
  threshold_after: ThresholdConfig
  threshold_changed: boolean
  breakdown: SessionAuditBreakdown
  resolution_summary: string
  source_files: Array<{
    file_type: FileType
    file_name: string
    file_hash: string
    record_count: number
    error_count: number
  }>
  replay_mode?: ReplayMode
  undo_status: UndoStatus
  undone_by_session_id?: string
  undone_at?: string
  conflict_choices?: ConflictChoice[]
  user_note?: string
}

export interface UndoSnapshot {
  id: string
  session_id: string
  created_at: string
  threshold: ThresholdConfig
  sensor_record_ids: string[]
  manual_note_ids: string[]
  alarm_record_ids: string[]
  event_ids: string[]
  evidence_ids: string[]
  import_batch_ids: string[]
  full_sensor_records: SensorRecord[]
  full_manual_notes: ManualNote[]
  full_alarm_records: AlarmRecord[]
  full_events: Event[]
  full_evidences: Evidence[]
  full_import_batches: ImportBatch[]
  full_sessions: ImportSession[]
  can_undo: boolean
  undo_reason: string | null
}

export interface UndoImpactPreview {
  session_id: string
  can_undo: boolean
  reason_if_cannot?: string
  events_to_remove: number
  events_to_restore: number
  batches_to_remove: number
  sensor_records_to_remove: number
  note_records_to_remove: number
  alarm_records_to_remove: number
  threshold_will_change: boolean
  threshold_before?: ThresholdConfig
  threshold_after?: ThresholdConfig
  dependent_sessions: string[]
}

export interface ReplayConflictAnalysis {
  same_device_time_conflicts: ConflictDetail[]
  batch_duplicates: ConflictDetail[]
  undone_sessions: Array<{ session_id: string; conflict_description: string }>
  threshold_diff: {
    current: ThresholdConfig
    imported: ThresholdConfig
    differences: Array<{ field: string; current: number | string; imported: number | string }>
  } | null
  total_conflicts: number
  choices_needed: ConflictChoice[]
}

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
  session_id?: string
  _skip_write?: boolean
}

export interface ManualNote {
  id: string
  device_id: string
  timestamp: string
  content: string
  author: string
  source_file: string
  batch_id: string
  session_id?: string
  _skip_write?: boolean
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
  session_id?: string
  _skip_write?: boolean
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
  session_id?: string
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
  source_session_ids?: string[]
  source_batch_ids?: string[]
  _is_from_undone_session?: boolean
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
  session_id?: string
  conflicts?: ConflictDetail[]
  replay_mode?: ReplayMode
  resolution_summary?: string
  affected_event_ids?: string[]
  new_record_ids?: string[]
  skipped_record_ids?: string[]
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
  conflict_type: 'same_device_time' | 'batch_duplicate' | 'undone_session' | 'threshold_diff'
  description: string
  resolved_choice?: ConflictChoiceType
  existing_session_id?: string
  new_session_id?: string
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
  import_sessions: ImportSession[]
  undo_snapshots: UndoSnapshot[]
  _meta?: {
    exported_by_session_id?: string
    total_active_sessions: number
    total_undone_sessions: number
  }
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
  session_id?: string
  conflict_analysis?: ReplayConflictAnalysis
  applied_choices?: ConflictChoice[]
}

export interface ApplyUndoResult {
  success: boolean
  reason?: string
  undoSessionId?: string
  restored_threshold?: ThresholdConfig
  restored_sensor_count?: number
  restored_note_count?: number
  restored_alarm_count?: number
  restored_event_count?: number
  restored_batch_count?: number
  mark_undone_session_id?: string
}
