import { useState } from 'react'
import { AlertTriangle, Filter, ChevronLeft, ChevronRight, Clock, Thermometer } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { StatusBadge } from '../common/StatusBadge'
import { Event, EventStatus } from '../../types'

const PAGE_SIZE = 8

export function EventList() {
  const { events, selectedEventId, selectEvent, getDeviceIds } = useAppStore()
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all')
  const [deviceFilter, setDeviceFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  
  const deviceIds = getDeviceIds()
  
  const filteredEvents = events.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (deviceFilter !== 'all' && e.device_id !== deviceFilter) return false
    return true
  })
  
  const totalPages = Math.ceil(filteredEvents.length / PAGE_SIZE)
  const currentPage = Math.min(page, totalPages || 1)
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )
  
  const formatTime = (iso: string) => {
    const date = new Date(iso)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  
  const getDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime()
    const minutes = Math.round(diff / 60000)
    if (minutes < 60) return `${minutes} 分钟`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours} 小时 ${mins} 分`
  }
  
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-slate-800">事件列表</h3>
            <span className="text-sm text-slate-400">({filteredEvents.length})</span>
          </div>
          <Filter className="w-4 h-4 text-slate-400" />
        </div>
        
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value as EventStatus | 'all')
              setPage(1)
            }}
            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 bg-white"
          >
            <option value="all">全部状态</option>
            <option value="pending">待处理</option>
            <option value="confirmed">已确认</option>
            <option value="false_alarm">误报</option>
            <option value="closed">已关闭</option>
          </select>
          
          <select
            value={deviceFilter}
            onChange={e => {
              setDeviceFilter(e.target.value)
              setPage(1)
            }}
            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 bg-white"
          >
            <option value="all">全部设备</option>
            {deviceIds.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {paginatedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Thermometer className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无事件</p>
            <p className="text-xs mt-1">导入数据后自动检测异常</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {paginatedEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                isSelected={event.id === selectedEventId}
                onClick={() => selectEvent(event.id)}
                formatTime={formatTime}
                getDuration={getDuration}
              />
            ))}
          </div>
        )}
      </div>
      
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            第 {currentPage} / {totalPages} 页
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface EventCardProps {
  event: Event
  isSelected: boolean
  onClick: () => void
  formatTime: (iso: string) => string
  getDuration: (start: string, end: string) => string
}

function EventCard({ event, isSelected, onClick, formatTime, getDuration }: EventCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 cursor-pointer transition-all hover:bg-slate-50 ${
        isSelected ? 'bg-sky-50 border-l-4 border-l-sky-500' : 'border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-medium text-slate-800 text-sm">{event.device_id}</h4>
          <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
            <Clock className="w-3 h-3" />
            <span>{formatTime(event.start_time)}</span>
          </div>
        </div>
        <StatusBadge status={event.status} size="sm" />
      </div>
      
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">
          持续 {getDuration(event.start_time, event.end_time)}
        </span>
        <span className="text-slate-400">
          {event.evidence_count} 条证据
        </span>
      </div>
      
      {event.handler && (
        <div className="mt-2 text-xs text-slate-500">
          处理人: {event.handler}
        </div>
      )}
    </div>
  )
}
