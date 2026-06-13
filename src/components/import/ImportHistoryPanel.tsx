import { useState } from 'react'
import {
  History,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  RotateCcw,
  Undo2,
  Link,
  Database,
  StickyNote,
  Bell,
  Plus,
  ArrowLeftRight,
  RefreshCw,
  SkipForward,
  Settings2,
  CheckCircle2,
  XCircle,
  Calendar,
  Hash,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { useAppStore } from '../../store/useAppStore'
import {
  FileType,
  SessionActionType,
  UndoStatus,
  ImportSession,
} from '../../types'


interface ImportHistoryPanelProps {
  isOpen: boolean
  onClose: () => void
  onRequestUndo?: (sessionId: string) => void
}

const fileTypeLabels: Record<FileType, string> = {
  sensor: '传感器数据',
  note: '人工备注',
  alarm: '告警数据',
}

const fileTypeIcons: Record<FileType, typeof FileSpreadsheet> = {
  sensor: FileSpreadsheet,
  note: FileText,
  alarm: AlertCircle,
}

const actionTypeConfig: Record<SessionActionType, {
  label: string
  icon: typeof RotateCcw
  badge: string
}> = {
  import: {
    label: '场景包导入',
    icon: Database,
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
  },
  replay: {
    label: '场景包回放',
    icon: RotateCcw,
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
  },
  undo: {
    label: '撤销操作',
    icon: Undo2,
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  threshold_change: {
    label: '阈值修改',
    icon: Settings2,
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
  },
}

const undoStatusConfig: Record<UndoStatus, {
  label: string
  dot: string
  badge: string
}> = {
  active: {
    label: '有效',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  undone: {
    label: '已撤销',
    dot: 'bg-slate-400',
    badge: 'bg-slate-50 text-slate-500 border-slate-200 line-through',
  },
  superseded: {
    label: '已覆盖',
    dot: 'bg-orange-500',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
  },
}

function shortId(id: string): string {
  const parts = id.split('_')
  const last = parts[parts.length - 1]
  return last.slice(0, 8)
}

export function ImportHistoryPanel({ isOpen, onClose, onRequestUndo }: ImportHistoryPanelProps) {
  const { importSessions, getUndoImpactPreview, getLatestUndoableSession } = useAppStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sortedSessions = [...importSessions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const latestUndoable = getLatestUndoableSession()
  const latestUndoableId = latestUndoable?.id || null

  const totalSessions = importSessions.length
  const activeSessions = importSessions.filter(s => s.undo_status === 'active').length
  const undoneSessions = importSessions.filter(s => s.undo_status === 'undone').length
  const totalNewEvents = importSessions.reduce((s, sess) => s + sess.breakdown.new_events, 0)
  const totalMergedEvents = importSessions.reduce((s, sess) => s + sess.breakdown.merged_events, 0)

  const canUndoSession = (session: ImportSession): boolean => {
    if (session.undo_status !== 'active') return false
    if (session.action_type === 'undo') return false
    return latestUndoableId === session.id
  }

  const handleUndoClick = (sessionId: string) => {
    getUndoImpactPreview(sessionId)
    onRequestUndo?.(sessionId)
  }

  const breakdownItems = (session: ImportSession) => [
    {
      key: 'new_sensor',
      label: '新增传感器',
      count: session.breakdown.new_sensor_records,
      icon: Database,
      color: 'emerald',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      bar: 'bg-emerald-500',
    },
    {
      key: 'new_note',
      label: '新增备注',
      count: session.breakdown.new_note_records,
      icon: StickyNote,
      color: 'emerald',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      bar: 'bg-emerald-500',
    },
    {
      key: 'new_alarm',
      label: '新增告警',
      count: session.breakdown.new_alarm_records,
      icon: Bell,
      color: 'emerald',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      bar: 'bg-emerald-500',
    },
    {
      key: 'new_events',
      label: '新增事件',
      count: session.breakdown.new_events,
      icon: Plus,
      color: 'emerald',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      bar: 'bg-emerald-500',
    },
    {
      key: 'merged_events',
      label: '合并事件',
      count: session.breakdown.merged_events,
      icon: ArrowLeftRight,
      color: 'sky',
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      text: 'text-sky-700',
      iconBg: 'bg-sky-100',
      iconColor: 'text-sky-600',
      bar: 'bg-sky-500',
    },
    {
      key: 'overwritten_events',
      label: '覆盖事件',
      count: session.breakdown.overwritten_events,
      icon: RefreshCw,
      color: 'orange',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-700',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      bar: 'bg-orange-500',
    },
    {
      key: 'skipped',
      label: '跳过记录',
      count: session.breakdown.skipped_duplicate_records + session.breakdown.skipped_events,
      icon: SkipForward,
      color: 'slate',
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-600',
      iconBg: 'bg-slate-100',
      iconColor: 'text-slate-500',
      bar: 'bg-slate-400',
    },
  ]

  const totalBreakdown = (session: ImportSession) =>
    breakdownItems(session).reduce((s, b) => s + b.count, 0)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="导入会话历史" size="xl">
      <div className="p-6">
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-sky-50 rounded-xl p-4 text-center border border-sky-100">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Database className="w-4 h-4 text-sky-600" />
              <p className="text-2xl font-bold text-sky-700">{totalSessions}</p>
            </div>
            <p className="text-xs text-sky-600">总会话</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <p className="text-2xl font-bold text-emerald-700">{activeSessions}</p>
            </div>
            <p className="text-xs text-emerald-600">有效会话</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-200">
            <div className="flex items-center justify-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-slate-500" />
              <p className="text-2xl font-bold text-slate-600">{undoneSessions}</p>
            </div>
            <p className="text-xs text-slate-500">已撤销</p>
          </div>
          <div className="bg-violet-50 rounded-xl p-4 text-center border border-violet-100">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Plus className="w-4 h-4 text-violet-600" />
              <p className="text-2xl font-bold text-violet-700">
                {totalNewEvents}
                {totalMergedEvents > 0 && (
                  <span className="text-sm ml-1 text-violet-500">(+{totalMergedEvents})</span>
                )}
              </p>
            </div>
            <p className="text-xs text-violet-600">新事件(合并)</p>
          </div>
        </div>

        {sortedSessions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center border border-slate-200">
              <History className="w-10 h-10 text-slate-300" />
            </div>
            <p className="text-base font-medium text-slate-600 mb-1">暂无导入会话历史</p>
            <p className="text-xs text-slate-400">导入场景包或回放后，会话记录将显示在此处</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedSessions.map((session) => {
              const isExpanded = expandedId === session.id
              const actionCfg = actionTypeConfig[session.action_type]
              const ActionIcon = actionCfg.icon
              const undoCfg = undoStatusConfig[session.undo_status]
              const canUndo = canUndoSession(session)
              const isLatest = latestUndoableId === session.id

              return (
                <div
                  key={session.id}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                    session.undo_status === 'undone'
                      ? 'border-slate-200 bg-slate-50/40 opacity-75'
                      : isLatest
                      ? 'border-sky-200 bg-gradient-to-br from-white to-sky-50/30 shadow-sm hover:shadow-md'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : session.id)}
                    className="w-full flex items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                        session.undo_status === 'undone'
                          ? 'bg-slate-100 text-slate-400 border-slate-200'
                          : session.action_type === 'import'
                          ? 'bg-gradient-to-br from-sky-100 to-sky-50 text-sky-600 border-sky-200'
                          : session.action_type === 'replay'
                          ? 'bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 border-violet-200'
                          : session.action_type === 'undo'
                          ? 'bg-gradient-to-br from-slate-100 to-slate-50 text-slate-500 border-slate-200'
                          : 'bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600 border-amber-200'
                      }`}>
                        <ActionIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-700">
                            <Hash className="w-3.5 h-3.5 text-slate-400" />
                            {shortId(session.id)}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${actionCfg.badge}`}>
                            <ActionIcon className="w-3 h-3" />
                            {actionCfg.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${undoCfg.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${undoCfg.dot}`} />
                            {undoCfg.label}
                          </span>
                          {isLatest && canUndo && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-100 text-sky-700 border border-sky-200">
                              <RotateCcw className="w-3 h-3" />
                              可撤销
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(session.created_at).toLocaleString('zh-CN')}
                          </span>
                          {session.source_files.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <FileSpreadsheet className="w-3 h-3" />
                              {session.source_files.length} 个文件
                            </span>
                          )}
                          {session.affected_event_ids.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Link className="w-3 h-3" />
                              影响 {session.affected_event_ids.length} 事件
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {onRequestUndo && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (canUndo) handleUndoClick(session.id)
                          }}
                          disabled={!canUndo}
                          title={
                            !canUndo
                              ? session.undo_status === 'undone'
                                ? '会话已撤销'
                                : session.action_type === 'undo'
                                ? '撤销操作不可撤销'
                                : '仅允许撤销最新可追溯会话'
                              : `撤销此会话`
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            canUndo
                              ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 hover:border-rose-300 active:scale-[0.97]'
                              : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                          }`}
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          撤销
                        </button>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-200/70 bg-white/50 p-4 space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2.5">
                          <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                            <Database className="w-3.5 h-3.5" />
                            审计 Breakdown
                          </p>
                          <p className="text-[11px] text-slate-400">
                            总计 {totalBreakdown(session)} 项操作
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {breakdownItems(session).map((item) => {
                            const ItemIcon = item.icon
                            const percent = totalBreakdown(session) > 0
                              ? Math.round((item.count / totalBreakdown(session)) * 100)
                              : 0
                            return (
                              <div
                                key={item.key}
                                className={`rounded-lg border p-2.5 ${item.bg} ${item.border}`}
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className={`w-7 h-7 rounded-md flex items-center justify-center ${item.iconBg}`}>
                                    <ItemIcon className={`w-3.5 h-3.5 ${item.iconColor}`} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-[11px] font-medium ${item.text} truncate`}>
                                      {item.label}
                                    </p>
                                    <p className={`text-sm font-bold ${item.text}`}>
                                      {item.count}
                                    </p>
                                  </div>
                                </div>
                                <div className="w-full h-1 rounded-full bg-white/60 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${item.bar}`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {session.resolution_summary && (
                        <div className="bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-lg p-3">
                          <p className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            处理摘要
                          </p>
                          <p className="text-sm text-slate-700 leading-relaxed">
                            {session.resolution_summary}
                          </p>
                        </div>
                      )}

                      {session.source_files.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            来源文件 ({session.source_files.length})
                          </p>
                          <div className="space-y-1.5">
                            {session.source_files.map((sf, i) => {
                              const FIcon = fileTypeIcons[sf.file_type]
                              return (
                                <div
                                  key={i}
                                  className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 hover:border-slate-300 transition-colors"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className="w-8 h-8 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                                      <FIcon className="w-4 h-4 text-slate-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-slate-700 truncate">
                                        {sf.file_name}
                                      </p>
                                      <p className="text-[11px] text-slate-500 flex items-center gap-2">
                                        <span className="inline-flex items-center gap-0.5">
                                          <Hash className="w-2.5 h-2.5" />
                                          {fileTypeLabels[sf.file_type]}
                                        </span>
                                        <span className="text-slate-300">|</span>
                                        <span>
                                          哈希 {sf.file_hash.slice(0, 10)}...
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0 ml-3">
                                    {sf.record_count > 0 && (
                                      <p className="text-sm font-semibold text-emerald-600">
                                        {sf.record_count} 条
                                      </p>
                                    )}
                                    {sf.error_count > 0 && (
                                      <p className="text-[11px] text-rose-600 font-medium">
                                        {sf.error_count} 错误
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {session.affected_event_ids.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                            <Link className="w-3.5 h-3.5" />
                            影响事件 ID ({session.affected_event_ids.length})
                          </p>
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {session.affected_event_ids.slice(0, 10).map((eid) => (
                                <span
                                  key={eid}
                                  className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-mono bg-white border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-700 transition-colors"
                                >
                                  #{eid.slice(0, 10)}
                                </span>
                              ))}
                              {session.affected_event_ids.length > 10 && (
                                <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-500">
                                  更多 {session.affected_event_ids.length - 10} 个
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {session.threshold_changed && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                            <Settings2 className="w-3.5 h-3.5" />
                            阈值变化
                          </p>
                          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <p className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                                  <ArrowLeftRight className="w-3 h-3" />
                                  修改前
                                </p>
                                <div className="bg-white rounded-md border border-slate-200 p-2 space-y-0.5">
                                  <p className="text-slate-700">
                                    温度: {session.threshold_before.temp_min} ~ {session.threshold_before.temp_max}°C
                                  </p>
                                  <p className="text-slate-700">
                                    电压: {session.threshold_before.voltage_min} ~ {session.threshold_before.voltage_max}V
                                  </p>
                                  <p className="text-slate-700">
                                    离线≥{session.threshold_before.offline_duration_min}分钟
                                  </p>
                                  <p className="text-slate-700">
                                    合并窗口: {session.threshold_before.merge_window_minutes}分钟
                                  </p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold text-emerald-600 mb-1.5 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  修改后
                                </p>
                                <div className="bg-white rounded-md border border-emerald-200 p-2 space-y-0.5">
                                  <p className="text-slate-700">
                                    温度: {session.threshold_after.temp_min} ~ {session.threshold_after.temp_max}°C
                                  </p>
                                  <p className="text-slate-700">
                                    电压: {session.threshold_after.voltage_min} ~ {session.threshold_after.voltage_max}V
                                  </p>
                                  <p className="text-slate-700">
                                    离线≥{session.threshold_after.offline_duration_min}分钟
                                  </p>
                                  <p className="text-slate-700">
                                    合并窗口: {session.threshold_after.merge_window_minutes}分钟
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {session.undo_status === 'undone' && session.undone_at && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                            <Undo2 className="w-4 h-4 text-slate-500" />
                          </div>
                          <div className="flex-1 text-xs">
                            <p className="font-semibold text-slate-600 mb-0.5">撤销信息</p>
                            <p className="text-slate-500 flex items-center gap-1.5">
                              <Calendar className="w-3 h-3" />
                              {new Date(session.undone_at).toLocaleString('zh-CN')}
                              {session.undone_by_session_id && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span>
                                    由会话 <span className="font-mono">{shortId(session.undone_by_session_id)}</span> 撤销
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                        <div className="text-xs">
                          <p className="text-slate-400 mb-0.5">完整会话 ID</p>
                          <p className="font-mono text-slate-600 text-[11px] break-all">{session.id}</p>
                        </div>
                        <div className="text-xs">
                          <p className="text-slate-400 mb-0.5">Package ID</p>
                          <p className="font-mono text-slate-600 text-[11px] break-all">{session.package_id}</p>
                        </div>
                        <div className="text-xs">
                          <p className="text-slate-400 mb-0.5">关联批次</p>
                          <p className="text-slate-600 font-medium">
                            {session.batch_ids.length} 个批次
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </Modal>
  )
}
