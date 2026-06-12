import { useState } from 'react'
import { Download, FileJson, FileSpreadsheet, ChevronDown } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { exportEventsToCSV, exportEvidencesToCSV, exportAllToJSON, downloadFile } from '../../utils/exporter'

interface ExportPanelProps {
  onExported?: () => void
}

export function ExportPanel({ onExported }: ExportPanelProps) {
  const { events, evidences, addToast } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [scope, setScope] = useState<'events' | 'evidences' | 'all'>('all')
  
  const handleExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    
    if (format === 'csv') {
      if (scope === 'events' || scope === 'all') {
        const csv = exportEventsToCSV(events, evidences)
        downloadFile(csv, `events_${timestamp}.csv`, 'text/csv;charset=utf-8')
      }
      if (scope === 'evidences' || scope === 'all') {
        const csv = exportEvidencesToCSV(events, evidences)
        downloadFile(csv, `evidences_${timestamp}.csv`, 'text/csv;charset=utf-8')
      }
    } else {
      const json = exportAllToJSON(events, evidences)
      downloadFile(json, `inspection_report_${timestamp}.json`, 'application/json')
    }
    
    addToast('success', '导出成功')
    setIsOpen(false)
    onExported?.()
  }
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-200 transition-colors"
      >
        <Download className="w-4 h-4" />
        导出数据
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl border border-slate-200 shadow-lg z-20 overflow-hidden">
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  导出格式
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormat('csv')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      format === 'csv'
                        ? 'bg-sky-50 border-sky-200 text-sky-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    CSV
                  </button>
                  <button
                    onClick={() => setFormat('json')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      format === 'json'
                        ? 'bg-sky-50 border-sky-200 text-sky-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileJson className="w-4 h-4" />
                    JSON
                  </button>
                </div>
              </div>
              
              {format === 'csv' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    导出内容
                  </label>
                  <div className="space-y-2">
                    {[
                      { value: 'all', label: '全部（事件 + 证据）' },
                      { value: 'events', label: '仅事件数据' },
                      { value: 'evidences', label: '仅证据数据' },
                    ].map(opt => (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="scope"
                          checked={scope === opt.value}
                          onChange={() => setScope(opt.value as typeof scope)}
                          className="w-4 h-4 text-sky-600 border-slate-300 focus:ring-sky-500"
                        />
                        <span className="text-sm text-slate-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="text-xs text-slate-400">
                共 {events.length} 个事件，{evidences.length} 条证据
              </div>
              
              <button
                onClick={handleExport}
                disabled={events.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Download className="w-4 h-4" />
                开始导出
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
