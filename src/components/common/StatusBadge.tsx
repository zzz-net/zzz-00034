import { EventStatus } from '../../types'

interface StatusBadgeProps {
  status: EventStatus
  size?: 'sm' | 'md'
}

const statusConfig: Record<EventStatus, { label: string; className: string }> = {
  pending: {
    label: '待处理',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  confirmed: {
    label: '已确认',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  false_alarm: {
    label: '误报',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  closed: {
    label: '已关闭',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status]
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'
  
  return (
    <span
      className={`inline-flex items-center font-medium rounded-md border ${sizeClass} ${config.className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          status === 'pending' ? 'bg-amber-500' :
          status === 'confirmed' ? 'bg-emerald-500' :
          status === 'false_alarm' ? 'bg-gray-400' : 'bg-slate-400'
        }`}
      />
      {config.label}
    </span>
  )
}
