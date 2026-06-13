import { useState, useRef } from 'react'
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  X,
  FileSpreadsheet,
  AlertTriangle,
  CheckCheck,
  Eye,
  ArrowRight,
  Trash2,
  Package,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { useAppStore } from '../../store/useAppStore'
import { generateScenePackagePreview } from '../../utils/scenePackage'
import { ScenePackagePreview, FileType } from '../../types'

interface ScenePackageImportModalProps {
  isOpen: boolean
  onClose: () => void
}

interface SelectedFile {
  file_type: FileType
  file: File
  content: string
}

const typeLabels: Record<FileType, { label: string; icon: typeof FileText; accept: string; description: string }> = {
  sensor: {
    label: '传感器数据',
    icon: FileSpreadsheet,
    accept: '.csv',
    description: 'CSV: device_id, timestamp, temperature, voltage, is_online',
  },
  note: {
    label: '人工备注',
    icon: FileText,
    accept: '.csv',
    description: 'CSV: device_id, timestamp, content, author',
  },
  alarm: {
    label: '告警数据',
    icon: AlertCircle,
    accept: '.json',
    description: 'JSON: 数组或包含 data 数组的对象',
  },
}

export function ScenePackageImportModal({ isOpen, onClose }: ScenePackageImportModalProps) {
  const [step, setStep] = useState<'select' | 'preview' | 'done'>('select')
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<FileType, SelectedFile>>>({})
  const [preview, setPreview] = useState<ScenePackagePreview | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [applyResult, setApplyResult] = useState<{
    batches: number
    newEvents: number
    totalRecords: number
    conflictCount: number
    affectedEventCount: number
    resolutionSummary: string
  } | null>(null)
  const sensorInputRef = useRef<HTMLInputElement>(null)
  const noteInputRef = useRef<HTMLInputElement>(null)
  const alarmInputRef = useRef<HTMLInputElement>(null)

  const appState = useAppStore()
  const { applyScenePackage, addToast } = appState

  const handleFileSelect = async (fileType: FileType, file: File | null) => {
    if (!file) {
      const next = { ...selectedFiles }
      delete next[fileType]
      setSelectedFiles(next)
      return
    }
    try {
      const content = await file.text()
      setSelectedFiles((prev) => ({
        ...prev,
        [fileType]: { file_type: fileType, file, content },
      }))
    } catch (e) {
      addToast('error', `读取文件失败: ${file.name}`)
    }
  }

  const canPreview = Object.keys(selectedFiles).length > 0

  const handlePreview = () => {
    if (!canPreview) return
    setIsProcessing(true)
    try {
      const result = generateScenePackagePreview({
        sensorContent: selectedFiles.sensor?.content,
        sensorFileName: selectedFiles.sensor?.file.name,
        noteContent: selectedFiles.note?.content,
        noteFileName: selectedFiles.note?.file.name,
        alarmContent: selectedFiles.alarm?.content,
        alarmFileName: selectedFiles.alarm?.file.name,
        existingSensorRecords: appState.sensorRecords,
        existingManualNotes: appState.manualNotes,
        existingAlarmRecords: appState.alarmRecords,
        existingBatches: appState.importBatches,
        existingEvents: appState.events,
        threshold: appState.threshold,
      })
      setPreview(result)
      setStep('preview')
    } catch (e) {
      addToast('error', '生成预览失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirmImport = () => {
    if (!preview) return
    setIsProcessing(true)
    try {
      const result = applyScenePackage(preview)
      setApplyResult({
        batches: result.batches.length,
        newEvents: result.newEvents,
        totalRecords: result.totalRecords,
        conflictCount: result.conflicts.length,
        affectedEventCount: result.affectedEventIds.length,
        resolutionSummary: result.resolutionSummary,
      })
      setStep('done')
    } catch (e) {
      addToast('error', '导入失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setIsProcessing(false)
    }
  }

  const resetAll = () => {
    setStep('select')
    setSelectedFiles({})
    setPreview(null)
    setApplyResult(null)
    setIsProcessing(false)
    if (sensorInputRef.current) sensorInputRef.current.value = ''
    if (noteInputRef.current) noteInputRef.current.value = ''
    if (alarmInputRef.current) alarmInputRef.current.value = ''
  }

  const handleClose = () => {
    resetAll()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="导入场景包" size="xl">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6 text-sm">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${step === 'select' ? 'bg-sky-100 text-sky-700' : 'text-slate-500'}`}>
            <Package className="w-3.5 h-3.5" />
            1. 选择文件
          </div>
          <ArrowRight className="w-3 h-3 text-slate-300" />
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${step === 'preview' ? 'bg-sky-100 text-sky-700' : 'text-slate-500'}`}>
            <Eye className="w-3.5 h-3.5" />
            2. 预览确认
          </div>
          <ArrowRight className="w-3 h-3 text-slate-300" />
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${step === 'done' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500'}`}>
            <CheckCheck className="w-3.5 h-3.5" />
            3. 完成
          </div>
        </div>

        {step === 'select' && (
          <div className="space-y-3">
            {(Object.keys(typeLabels) as FileType[]).map((ft) => {
              const cfg = typeLabels[ft]
              const Icon = cfg.icon
              const sel = selectedFiles[ft]
              const inputRef =
                ft === 'sensor' ? sensorInputRef :
                ft === 'note' ? noteInputRef : alarmInputRef
              return (
                <div
                  key={ft}
                  onClick={() => inputRef.current?.click()}
                  className="relative border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all hover:border-slate-300 hover:bg-slate-50"
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept={cfg.accept}
                    onChange={(e) => handleFileSelect(ft, e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        sel ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{cfg.label}</p>
                        <p className="text-xs text-slate-400">{cfg.description}</p>
                        {sel && (
                          <p className="text-xs text-emerald-600 mt-0.5 font-medium">
                            已选择: {sel.file.name} ({(sel.file.size / 1024).toFixed(1)} KB)
                          </p>
                        )}
                      </div>
                    </div>
                    {sel && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleFileSelect(ft, null)
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {!sel && (
                      <div className="flex items-center gap-1 text-xs text-sky-600">
                        <Upload className="w-3.5 h-3.5" />
                        选择
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            <p className="text-xs text-slate-400 text-center mt-4">
              至少选择一个文件，可以同时选择传感器、备注和告警文件
            </p>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-sky-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-sky-700">{preview.new_events_count}</p>
                <p className="text-xs text-sky-600 mt-1">新增事件</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-amber-700">{preview.merged_events_count}</p>
                <p className="text-xs text-amber-600 mt-1">合并事件</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-700">
                  {preview.will_create_sensor_records + preview.will_create_note_records + preview.will_create_alarm_records}
                </p>
                <p className="text-xs text-slate-500 mt-1">新记录总数</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">文件解析结果</p>
              <div className="space-y-2">
                {preview.files.map((fp, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {fp.is_duplicate ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        ) : fp.error_count > 0 ? (
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        )}
                        <span className="text-sm font-medium text-slate-800">{fp.file_name}</span>
                        <span className="text-xs text-slate-400">({typeLabels[fp.file_type].label})</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-emerald-600 font-medium">{fp.valid_count} 有效</span>
                        {fp.error_count > 0 && (
                          <span className="text-amber-600 ml-2 font-medium">{fp.error_count} 错误</span>
                        )}
                        {fp.is_duplicate && (
                          <span className="text-amber-600 ml-2 font-medium">重复批次</span>
                        )}
                      </div>
                    </div>
                    {fp.errors.length > 0 && (
                      <div className="max-h-32 overflow-y-auto bg-slate-50 rounded-lg p-2 text-xs">
                        {fp.errors.slice(0, 20).map((err, j) => (
                          <div key={j} className="text-slate-600 py-0.5">
                            行{err.row} · {err.field}: {err.message}
                          </div>
                        ))}
                        {fp.errors.length > 20 && (
                          <div className="text-slate-400 py-0.5">... 还有 {fp.errors.length - 20} 条错误</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {preview.conflicts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-medium text-slate-700">
                    检测到 {preview.conflicts.length} 处冲突
                  </p>
                </div>
                <div className="max-h-32 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs">
                  {preview.conflicts.slice(0, 30).map((c, i) => (
                    <div key={i} className="py-0.5 text-amber-800">
                      {c.conflict_type === 'batch_duplicate'
                        ? `重复批次: ${c.description}`
                        : `${c.device_id} @ ${c.timestamp.slice(0, 19)}: ${c.description}`}
                    </div>
                  ))}
                  {preview.conflicts.length > 30 && (
                    <div className="text-amber-600 py-0.5">... 还有 {preview.conflicts.length - 30} 处冲突</div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
              ⚠️ 确认导入前不会修改任何现有数据。点击「确认导入」后将写入统一批次日志，刷新页面仍可在导入历史中查看。
            </div>
          </div>
        )}

        {step === 'done' && applyResult && (
          <div className="text-center py-6">
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <p className="text-lg font-semibold text-slate-800 mb-2">场景包导入成功</p>
            <p className="text-sm text-slate-500 mb-4">
              {applyResult.totalRecords} 条记录 · {applyResult.newEvents} 个新事件 · {applyResult.batches} 个批次
            </p>
            {applyResult.conflictCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-left max-w-md mx-auto">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="font-medium text-amber-700">冲突处理结果</span>
                </div>
                <p className="text-amber-800">{applyResult.resolutionSummary}</p>
                {applyResult.affectedEventCount > 0 && (
                  <p className="text-amber-700 mt-1">涉及 {applyResult.affectedEventCount} 个已有事件</p>
                )}
              </div>
            )}
            <p className="text-xs text-slate-400">
              导入记录已保存在本地，刷新或重开页面后可在导入历史中查看冲突处理结果
            </p>
          </div>
        )}

        <div className="flex justify-between gap-2 mt-6 pt-4 border-t border-slate-100">
          {step === 'select' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handlePreview}
                disabled={!canPreview || isProcessing}
                className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                生成预览
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                返回修改
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  取消导入
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCheck className="w-4 h-4" />
                  )}
                  确认导入
                </button>
              </div>
            </>
          )}
          {step === 'done' && (
            <div className="flex justify-end w-full">
              <button
                onClick={handleClose}
                className="px-5 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 transition-colors"
              >
                关闭
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
