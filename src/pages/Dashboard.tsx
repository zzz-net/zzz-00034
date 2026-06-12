import { useState } from 'react'
import { Upload, AlertTriangle, CheckCircle, XCircle, Clock, Cpu, Trash2 } from 'lucide-react'
import { StatsCard } from '../components/dashboard/StatsCard'
import { ThresholdPanel } from '../components/dashboard/ThresholdPanel'
import { EventList } from '../components/dashboard/EventList'
import { EventDetail } from '../components/dashboard/EventDetail'
import { ImportModal } from '../components/import/ImportModal'
import { ExportPanel } from '../components/export/ExportPanel'
import { ToastContainer } from '../components/common/Toast'
import { useAppStore } from '../store/useAppStore'

export default function Dashboard() {
  const { events, sensorRecords, manualNotes, alarmRecords, clearAllData, getDeviceIds } = useAppStore()
  const [importOpen, setImportOpen] = useState(false)
  
  const pendingCount = events.filter(e => e.status === 'pending').length
  const confirmedCount = events.filter(e => e.status === 'confirmed').length
  const falseAlarmCount = events.filter(e => e.status === 'false_alarm').length
  const closedCount = events.filter(e => e.status === 'closed').length
  const deviceCount = getDeviceIds().length
  
  const handleClear = () => {
    if (window.confirm('确定要清除所有数据吗？此操作不可撤销。')) {
      clearAllData()
    }
  }
  
  return (
    <div className="min-h-screen bg-slate-50">
      <ToastContainer />
      <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} />
      
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">巡检日志分析看板</h1>
                <p className="text-xs text-slate-400">传感器数据 · 人工备注 · 告警信息 统一分析</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleClear}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                清除数据
              </button>
              <ExportPanel />
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4" />
                导入数据
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatsCard
            title="事件总数"
            value={events.length}
            icon={AlertTriangle}
            color="blue"
            subtitle={`${deviceCount} 台设备`}
          />
          <StatsCard
            title="待处理"
            value={pendingCount}
            icon={Clock}
            color="amber"
          />
          <StatsCard
            title="已确认"
            value={confirmedCount}
            icon={CheckCircle}
            color="emerald"
          />
          <StatsCard
            title="误报"
            value={falseAlarmCount}
            icon={XCircle}
            color="gray"
          />
          <StatsCard
            title="已关闭"
            value={closedCount}
            icon={CheckCircle}
            color="gray"
          />
          <StatsCard
            title="数据记录"
            value={sensorRecords.length + manualNotes.length + alarmRecords.length}
            icon={Cpu}
            color="blue"
            subtitle={`传感器 ${sensorRecords.length} · 备注 ${manualNotes.length} · 告警 ${alarmRecords.length}`}
          />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" style={{ height: 'calc(100vh - 240px)' }}>
          <div className="lg:col-span-3 space-y-6 overflow-y-auto">
            <ThresholdPanel />
            
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">使用说明</h3>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
                <li>配置温度、电压、离线阈值和合并窗口</li>
                <li>导入传感器、备注、告警数据文件</li>
                <li>系统自动检测异常并归并事件</li>
                <li>点击事件查看详情，进行复核</li>
                <li>支持 CSV/JSON 格式导出</li>
              </ol>
            </div>
          </div>
          
          <div className="lg:col-span-5">
            <EventList />
          </div>
          
          <div className="lg:col-span-4 hidden lg:block">
            <EventDetail />
          </div>
        </div>
      </main>
    </div>
  )
}
