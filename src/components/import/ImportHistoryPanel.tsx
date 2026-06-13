import { useState } from 'react'
import {
  History,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  XCircle,
  CheckCircle2,
  Package,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { useAppStore } from '../../store/useAppStore'
import { FileType } from '../../types'

interface ImportHistoryPanelProps {
  isOpen: boolean
  onClose: () => void
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

export function ImportHistoryPanel({ isOpen, onClose }: ImportHistoryPanelProps) {
  const { importBatches } = useAppStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sortedBatches = [...importBatches].sort(
    (a, b) => new Date(b.import_time).getTime() - new Date(a.import_time).getTime()
  )

  const totalRecords = importBatches.reduce((s, b) => s + b.record_count, 0)
  const totalErrors = importBatches.reduce((s, b) => s + b.error_count, 0)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="导入历史" size="xl">
      <div className="p-6">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-sky-50 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Package className="w-4 h-4 text-sky-600" />
              <p className="text-2xl font-bold text-sky-700">{importBatches.length}</p>
            </div>
            <p className="text-xs text-sky-600">导入批次</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <p className="text-2xl font-bold text-emerald-700">{totalRecords}</p>
            </div>
            <p className="text-xs text-emerald-600">有效记录</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-amber-600" />
              <p className="text-2xl font-bold text-amber-700">{totalErrors}</p>
            </div>
            <p className="text-xs text-amber-600">错误行</p>
          </div>
        </div>

        {sortedBatches.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">暂无导入记录</p>
            <p className="text-xs text-slate-400 mt-1">导入数据后，历史记录会显示在此处</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {sortedBatches.map((batch) => {
              const Icon = fileTypeIcons[batch.file_type]
              const isExpanded = expandedId === batch.id
              return (
                <div
                  key={batch.id}
                  className="border border-slate-200 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : batch.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        batch.error_count > 0 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{batch.file_name}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                          <span>{fileTypeLabels[batch.file_type]}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(batch.import_time).toLocaleString('zh-CN')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-emerald-600">
                          {batch.record_count} 条
                        </p>
                        {batch.error_count > 0 && (
                          <p className="text-xs text-amber-600">{batch.error_count} 错误</p>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50 p-4">
                      <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
                        <div>
                          <p className="text-slate-400 mb-1">批次ID</p>
                          <p className="text-slate-700 font-mono break-all">{batch.id}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-1">文件哈希</p>
                          <p className="text-slate-700 font-mono text-[10px] break-all">{batch.file_hash}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-1">有效记录</p>
                          <p className="text-slate-700 font-medium">{batch.record_count}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-1">错误行数</p>
                          <p className="text-slate-700 font-medium">{batch.error_count}</p>
                        </div>
                      </div>

                      {batch.errors.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-2">
                            错误明细 ({batch.errors.length} 条)
                          </p>
                          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-slate-600">行号</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-600">字段</th>
                                  <th className="px-3 py-2 text-left font-medium text-slate-600">错误信息</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {batch.errors.map((err, idx) => (
                                  <tr key={idx}>
                                    <td className="px-3 py-2 text-slate-500">{err.row || '-'}</td>
                                    <td className="px-3 py-2 text-slate-600 font-mono">{err.field}</td>
                                    <td className="px-3 py-2 text-red-600">{err.message}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
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
