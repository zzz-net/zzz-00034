import { useMemo } from 'react'
import {
  AlertTriangle,
  Trash2,
  Info,
  ArrowRight,
  Database,
  Layers,
  Activity,
  Settings,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { useAppStore } from '../../store/useAppStore'

interface UndoConfirmModalProps {
  open: boolean
  sessionId?: string
  onClose: () => void
  onConfirm: () => void
}

const actionTypeLabel: Record<string, { label: string; color: string }> = {
  import: { label: '导入', color: 'bg-sky-100 text-sky-700' },
  replay: { label: '回放', color: 'bg-violet-100 text-violet-700' },
  undo: { label: '撤销', color: 'bg-amber-100 text-amber-700' },
  threshold_change: { label: '阈值', color: 'bg-emerald-100 text-emerald-700' },
}

export function UndoConfirmModal({ open, sessionId, onClose, onConfirm }: UndoConfirmModalProps) {
  const { getUndoImpactPreview, undoSnapshots, sensorRecords, manualNotes, alarmRecords, importSessions } = useAppStore()

  const preview = useMemo(() => {
    if (!sessionId) return null
    return getUndoImpactPreview(sessionId)
  }, [sessionId, getUndoImpactPreview])

  const snapshot = useMemo(() => {
    if (!sessionId) return null
    return undoSnapshots.find(s => s.session_id === sessionId) || null
  }, [sessionId, undoSnapshots])

  const targetSession = useMemo(() => {
    if (!sessionId) return null
    return importSessions.find(s => s.id === sessionId) || null
  }, [sessionId, importSessions])

  const shouldPreventUndo = preview ? preview.dependent_sessions.length > 0 : false
  const isConfirmDisabled = !preview || !preview.can_undo || shouldPreventUndo

  const sensorBefore = sensorRecords.length
  const sensorAfter = snapshot ? snapshot.full_sensor_records.length : Math.max(0, sensorBefore - (preview?.sensor_records_to_remove || 0))
  const noteBefore = manualNotes.length
  const noteAfter = snapshot ? snapshot.full_manual_notes.length : Math.max(0, noteBefore - (preview?.note_records_to_remove || 0))
  const alarmBefore = alarmRecords.length
  const alarmAfter = snapshot ? snapshot.full_alarm_records.length : Math.max(0, alarmBefore - (preview?.alarm_records_to_remove || 0))

  const shortSessionId = (id: string) => id.slice(-8).toUpperCase()

  return (
    <Modal isOpen={open} onClose={onClose} title="⚠️ 确认撤销本次导入？" size="md">
      <div className="p-6">
        {targetSession && (
          <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-sm">
              <Info className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span className="text-slate-500">目标会话：</span>
              <code className="text-xs font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                {shortSessionId(targetSession.id)}
              </code>
              <span className={`text-xs px-2 py-0.5 rounded-full ${actionTypeLabel[targetSession.action_type]?.color || 'bg-slate-100 text-slate-700'}`}>
                {actionTypeLabel[targetSession.action_type]?.label || targetSession.action_type}
              </span>
              <span className="text-xs text-slate-400 ml-auto">
                {new Date(targetSession.created_at).toLocaleString('zh-CN')}
              </span>
            </div>
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
                <Activity className="w-4 h-4 text-rose-600" />
              </div>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">将删除事件</span>
                  <span className={`text-sm font-semibold ${preview.events_to_remove > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                    {preview.events_to_remove} 个
                  </span>
                </div>
                {preview.events_to_restore > 0 && (
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-slate-500">将恢复快照事件</span>
                    <span className="text-xs font-medium text-emerald-600">
                      +{preview.events_to_restore} 个
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Layers className="w-4 h-4 text-orange-600" />
              </div>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">将删除导入批次</span>
                  <span className="text-sm font-semibold text-slate-700">
                    {preview.batches_to_remove} 个
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                <Database className="w-4 h-4 text-sky-600" />
              </div>
              <div className="flex-1 pt-0.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">传感器记录</span>
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <span>{sensorBefore} 条</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className={sensorAfter < sensorBefore ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                      {sensorAfter} 条
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">备注记录</span>
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <span>{noteBefore} 条</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className={noteAfter < noteBefore ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                      {noteAfter} 条
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">告警记录</span>
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <span>{alarmBefore} 条</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className={alarmAfter < alarmBefore ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                      {alarmAfter} 条
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Settings className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">阈值配置</span>
                  <span className={`text-sm font-semibold ${preview.threshold_will_change ? 'text-amber-600' : 'text-slate-600'}`}>
                    {preview.threshold_will_change ? '会变化' : '不会变化'}
                  </span>
                </div>
                {preview.threshold_will_change && preview.threshold_before && preview.threshold_after && (
                  <div className="mt-2 text-xs space-y-1 bg-white rounded p-2 border border-slate-200">
                    <div className="text-slate-500">合并窗口：{preview.threshold_before.merge_window_minutes} 分 → <span className="text-amber-700 font-medium">{preview.threshold_after.merge_window_minutes} 分</span></div>
                    <div className="text-slate-500">温度范围：[{preview.threshold_before.temp_min}, {preview.threshold_before.temp_max}] → <span className="text-amber-700 font-medium">[{preview.threshold_after.temp_min}, {preview.threshold_after.temp_max}]</span></div>
                    <div className="text-slate-500">电压范围：[{preview.threshold_before.voltage_min}, {preview.threshold_before.voltage_max}] → <span className="text-amber-700 font-medium">[{preview.threshold_after.voltage_min}, {preview.threshold_after.voltage_max}]</span></div>
                    <div className="text-slate-500">离线阈值：{preview.threshold_before.offline_duration_min} 分 → <span className="text-amber-700 font-medium">{preview.threshold_after.offline_duration_min} 分</span></div>
                  </div>
                )}
              </div>
            </div>

            {preview.dependent_sessions.length > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 mb-2">
                    ⚠️ 该会话之后存在其他操作，撤销会导致会话链断裂
                  </p>
                  <div className="space-y-1">
                    {preview.dependent_sessions.map(sid => {
                      const dep = importSessions.find(s => s.id === sid)
                      return (
                        <div key={sid} className="flex items-center gap-2 text-xs text-amber-700 bg-white/60 rounded px-2 py-1">
                          <code className="font-mono bg-white px-1 rounded border border-amber-200">
                            {shortSessionId(sid)}
                          </code>
                          <span className={`px-1.5 py-0.5 rounded-full ${actionTypeLabel[dep?.action_type || '']?.color || 'bg-slate-100 text-slate-700'}`}>
                            {actionTypeLabel[dep?.action_type || '']?.label || dep?.action_type || '未知'}
                          </span>
                          {dep && (
                            <span className="text-amber-600 ml-auto">
                              {new Date(dep.created_at).toLocaleString('zh-CN')}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {!preview.can_undo && preview.reason_if_cannot && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-rose-800 mb-1">无法撤销</p>
                  <p className="text-sm text-rose-700">{preview.reason_if_cannot}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between gap-2 mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className="flex items-center gap-2 px-5 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            确认撤销
          </button>
        </div>
      </div>
    </Modal>
  )
}
