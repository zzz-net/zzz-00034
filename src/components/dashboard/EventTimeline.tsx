import { Evidence } from '../../types'
import { Thermometer, Zap, WifiOff, FileText, Bell } from 'lucide-react'

interface EventTimelineProps {
  evidences: Evidence[]
}

const typeConfig: Record<string, { icon: typeof Thermometer; color: string; bgColor: string; label: string }> = {
  sensor_anomaly: {
    icon: Thermometer,
    color: 'text-rose-600',
    bgColor: 'bg-rose-100',
    label: '传感器异常',
  },
  manual_note: {
    icon: FileText,
    color: 'text-sky-600',
    bgColor: 'bg-sky-100',
    label: '人工备注',
  },
  alarm: {
    icon: Bell,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    label: '告警',
  },
}

const anomalyTypeIcons: Record<string, typeof Thermometer> = {
  temperature: Thermometer,
  voltage: Zap,
  offline: WifiOff,
}

export function EventTimeline({ evidences }: EventTimelineProps) {
  const formatTime = (iso: string) => {
    const date = new Date(iso)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }
  
  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
      
      <div className="space-y-4">
        {evidences.map(evidence => {
          const config = typeConfig[evidence.type] || typeConfig.sensor_anomaly
          const Icon = evidence.anomaly_type && anomalyTypeIcons[evidence.anomaly_type]
            ? anomalyTypeIcons[evidence.anomaly_type]
            : config.icon
          
          return (
            <div key={evidence.id} className="relative flex gap-3 pl-0">
              <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${config.bgColor}`}>
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>
              
              <div className="flex-1 pb-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatTime(evidence.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {evidence.description}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  来源: {evidence.source_file}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
