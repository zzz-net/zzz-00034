import { useState, useEffect } from 'react'
import {
  X,
  Clock,
  User,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Archive,
  FileText,
  Link2,
  Layers,
  Activity,
  Database,
  FileSpreadsheet,
  Bell,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { StatusBadge } from '../common/StatusBadge'
import { EventTimeline } from './EventTimeline'
import { EventStatus, FileType } from '../../types'

const actionTypeBadge: Record<string, { label: string; color: string }> = {
  import: { label: '导入', color: 'bg-sky-100 text-sky-700' },
  replay: { label: '回放', color: 'bg-violet-100 text-violet-700' },
  undo: { label: '撤销', color: 'bg-amber-100 text-amber-700' },
  threshold_change: { label: '阈值', color: 'bg-emerald-100 text-emerald-700' },
}

const fileTypeBadge: Record<FileType, { label: string; badgeColor: string; iconBg: string; iconColor: string; icon: typeof Database }> = {
  sensor: { label: '传感器', badgeColor: 'bg-sky-100 text-sky-700', iconBg: 'bg-sky-50', iconColor: 'text-sky-600', icon: Database },
  note: { label: '备注', badgeColor: 'bg-indigo-100 text-indigo-700', iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600', icon: FileSpreadsheet },
  alarm: { label: '告警', badgeColor: 'bg-amber-100 text-amber-700', iconBg: 'bg-amber-50', iconColor: 'text-amber-600', icon: Bell },
}

export function EventDetail() {
  const {
    selectedEventId,
    events,
    selectEvent,
    updateEventStatus,
    updateEventRemark,
    closeEvent,
    getEventEvidences,
    importSessions,
    importBatches,
  } = useAppStore()
  
  const [handler, setHandler] = useState('')
  const [remark, setRemark] = useState('')
  const [isEditingRemark, setIsEditingRemark] = useState(false)
  
  const event = events.find(e => e.id === selectedEventId)
  const evidences = selectedEventId ? getEventEvidences(selectedEventId) : []
  
  useEffect(() => {
    if (event) {
      setHandler(event.handler)
      setRemark(event.remark)
      setIsEditingRemark(false)
    }
  }, [event?.id])
  
  if (!event) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">事件详情</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
          <FileText className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-sm">选择一个事件查看详情</p>
          <p className="text-xs mt-1">点击左侧事件列表中的事件</p>
        </div>
      </div>
    )
  }
  
  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }
  
  const getDuration = () => {
    const diff = new Date(event.end_time).getTime() - new Date(event.start_time).getTime()
    const minutes = Math.round(diff / 60000)
    if (minutes < 60) return `${minutes} 分钟`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours} 小时 ${mins} 分`
  }
  
  const handleStatusChange = (status: EventStatus) => {
    updateEventStatus(event.id, status, handler)
  }
  
  const handleSaveRemark = () => {
    updateEventRemark(event.id, remark)
    setIsEditingRemark(false)
  }
  
  const handleClose = () => {
    closeEvent(event.id, handler)
  }

  const shortSessionId = (id: string) => id.slice(-8).toUpperCase()

  const sourceSessions = (event.source_session_ids || [])
    .map(sid => importSessions.find(s => s.id === sid))
    .filter(Boolean)

  const sourceBatches = (event.source_batch_ids || [])
    .map(bid => importBatches.find(b => b.id === bid))
    .filter(Boolean)

  const uniqueSourceFiles = Array.from(new Set(evidences.map(e => e.source_file).filter(Boolean)))
  
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">事件详情</h3>
        <button
          onClick={() => selectEvent(null)}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-slate-800 text-lg">{event.device_id}</h4>
              <StatusBadge status={event.status} />
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{formatTime(event.start_time)}</span>
              </div>
              <span>持续 {getDuration()}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">证据数量</p>
              <p className="font-semibold text-slate-700">{event.evidence_count}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">创建时间</p>
              <p className="font-medium text-slate-600 text-xs">
                {formatTime(event.created_at)}
              </p>
            </div>
          </div>
          
          {event.close_time && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-slate-400 text-xs mb-1">关闭时间</p>
              <p className="font-medium text-slate-600 text-sm">
                {formatTime(event.close_time)}
              </p>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-slate-600" />
              <h4 className="font-semibold text-slate-700 text-sm">数据溯源</h4>
            </div>

            {event._is_from_undone_session && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm font-semibold text-rose-700">
                  ⚠️ 该事件来自已撤销会话，建议删除
                </span>
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-medium text-slate-600">来源会话</span>
              </div>
              {sourceSessions.length > 0 ? (
                <div className="space-y-1.5">
                  {sourceSessions.map((s) => s && (
                    <div key={s.id} className="flex items-center gap-2 text-xs bg-white rounded-lg p-2 border border-slate-200">
                      <code className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                        {shortSessionId(s.id)}
                      </code>
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${actionTypeBadge[s.action_type]?.color || 'bg-slate-100 text-slate-700'}`}>
                        {actionTypeBadge[s.action_type]?.label || s.action_type}
                      </span>
                      <span className="text-slate-500 ml-auto">
                        {formatTime(s.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 bg-white rounded-lg p-2 border border-dashed border-slate-200">
                  未知（版本兼容）
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Database className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-medium text-slate-600">来源批次</span>
              </div>
              {sourceBatches.length > 0 ? (
                <div className="space-y-1.5">
                  {sourceBatches.map((b) => {
                    if (!b) return null
                    const ftCfg = fileTypeBadge[b.file_type]
                    const FIcon = ftCfg?.icon || Database
                    return (
                      <div key={b.id} className="flex items-center gap-2 text-xs bg-white rounded-lg p-2 border border-slate-200">
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${ftCfg?.iconBg || 'bg-slate-100'} flex-shrink-0`}>
                          <FIcon className={`w-3 h-3 ${ftCfg?.iconColor || 'text-slate-600'}`} />
                        </div>
                        <span className="text-slate-700 font-medium truncate max-w-[160px]" title={b.file_name}>
                          {b.file_name}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${ftCfg?.badgeColor || 'bg-slate-100 text-slate-700'} ml-auto`}>
                          {ftCfg?.label || b.file_type}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 bg-white rounded-lg p-2 border border-dashed border-slate-200">
                  未知（版本兼容）
                </p>
              )}
            </div>

            {uniqueSourceFiles.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Link2 className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-600">证据来源文件</span>
                </div>
                <div className="space-y-1">
                  {uniqueSourceFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs bg-white rounded-lg p-2 border border-slate-200">
                      <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span className="text-sky-600 hover:text-sky-700 underline decoration-dotted cursor-default truncate" title={file}>
                        {file}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              <User className="w-4 h-4 inline mr-1" />
              处理人
            </label>
            <input
              type="text"
              value={handler}
              onChange={e => setHandler(e.target.value)}
              placeholder="请输入处理人姓名"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-slate-600">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                备注
              </label>
              {!isEditingRemark && (
                <button
                  onClick={() => setIsEditingRemark(true)}
                  className="text-xs text-sky-600 hover:text-sky-700"
                >
                  编辑
                </button>
              )}
            </div>
            {isEditingRemark ? (
              <div className="space-y-2">
                <textarea
                  value={remark}
                  onChange={e => setRemark(e.target.value)}
                  placeholder="请输入备注信息"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveRemark}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setRemark(event.remark)
                      setIsEditingRemark(false)
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg min-h-[3rem]">
                {event.remark || <span className="text-slate-400">暂无备注</span>}
              </p>
            )}
          </div>
          
          <div className="pt-2">
            <p className="text-sm font-medium text-slate-600 mb-3">状态操作</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleStatusChange('confirmed')}
                disabled={event.status === 'confirmed'}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                确认异常
              </button>
              <button
                onClick={() => handleStatusChange('false_alarm')}
                disabled={event.status === 'false_alarm'}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <XCircle className="w-4 h-4" />
                标记误报
              </button>
              <button
                onClick={() => handleStatusChange('pending')}
                disabled={event.status === 'pending'}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <AlertTriangle className="w-4 h-4" />
                待处理
              </button>
              <button
                onClick={handleClose}
                disabled={event.status === 'closed'}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Archive className="w-4 h-4" />
                关闭事件
              </button>
            </div>
          </div>
        </div>
        
        <div className="px-5 py-4 border-t border-slate-100">
          <h4 className="font-semibold text-slate-800 mb-4">证据时间线</h4>
          <EventTimeline evidences={evidences} />
        </div>
      </div>
    </div>
  )
}
