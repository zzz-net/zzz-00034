import { useState } from 'react'
import { Download, FileJson, FileSpreadsheet, ChevronDown, Package } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { exportEventsToCSV, exportEvidencesToCSV, exportAllToJSON, downloadFile } from '../../utils/exporter'
import { exportScenePackage } from '../../utils/scenePackage'

interface ExportPanelProps {
  onExported?: () => void
}

export function ExportPanel({ onExported }: ExportPanelProps) {
  const { events, evidences, addToast, threshold, sensorRecords, manualNotes, alarmRecords, importBatches, importSessions, undoSnapshots } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [format, setFormat] = useState<'csv' | 'json' | 'scene'>('csv')
  const [scope, setScope] = useState<'events' | 'evidences' | 'all'>('all')
  
  const handleExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    
    if (format === 'scene') {
      const pkg = exportScenePackage(
        threshold,
        sensorRecords,
        manualNotes,
        alarmRecords,
        importBatches,
        events,
        evidences,
        importSessions,
        undoSnapshots
      )
      const json = JSON.stringify(pkg, null, 2)
      downloadFile(json, `scene_package_${timestamp}.json`, 'application/json')
      addToast('success', '场景包导出成功')
    } else if (format === 'csv') {
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
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setFormat('csv')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      format === 'csv'
                        ? 'bg-sky-50 border-sky-200 text-sky-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    CSV（事件/证据）
                  </button>
                  <button
                    onClick={() => setFormat('json')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      format === 'json'
                        ? 'bg-sky-50 border-sky-200 text-sky-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileJson className="w-4 h-4" />
                    JSON（仅事件+证据）
                  </button>
                  <button
                    onClick={() => setFormat('scene')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      format === 'scene'
                        ? 'bg-sky-50 border-sky-200 text-sky-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    场景包（完整可回放）
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

              {format === 'scene' && (
                <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
                  <p>场景包包含完整状态，可在另一台设备/环境中回放：</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>当前阈值配置</li>
                    <li>所有导入批次记录</li>
                    <li>全部原始数据记录</li>
                    <li>事件状态、处理人、备注</li>
                    <li>导入会话与撤销快照</li>
                  </ul>
                </div>
              )}
              
              <div className="text-xs text-slate-400">
                {format === 'scene' ? (
                  <>共 {importBatches.length} 批次，{importSessions.length} 会话，{events.length} 个事件，{evidences.length} 条证据</>
                ) : (
                  <>共 {events.length} 个事件，{evidences.length} 条证据</>
                )}
              </div>
              
              <button
                onClick={handleExport}
                disabled={format !== 'scene' && events.length === 0}
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
