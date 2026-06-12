import { useState, useRef } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle, X, FileSpreadsheet } from 'lucide-react'
import { Modal } from '../common/Modal'
import { useAppStore } from '../../store/useAppStore'
import { parseSensorCSV, parseNoteCSV, generateId } from '../../utils/csvParser'
import { parseAlarmJSON, generateFileHash } from '../../utils/jsonParser'
import { FileType, ImportError, ImportBatch } from '../../types'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
}

type ImportTab = 'sensor' | 'note' | 'alarm'

const tabConfig: Record<ImportTab, { label: string; icon: typeof FileText; accept: string; description: string }> = {
  sensor: {
    label: '传感器数据',
    icon: FileSpreadsheet,
    accept: '.csv',
    description: 'CSV 格式，包含 device_id、timestamp、temperature、voltage、is_online',
  },
  note: {
    label: '人工备注',
    icon: FileText,
    accept: '.csv',
    description: 'CSV 格式，包含 device_id、timestamp、content、author',
  },
  alarm: {
    label: '告警数据',
    icon: AlertCircle,
    accept: '.json',
    description: 'JSON 格式，数组或包含 data 数组的对象',
  },
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>('sensor')
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    recordCount: number
    errorCount: number
    errors: ImportError[]
    isDuplicate: boolean
    fileName: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addSensorRecords, addManualNotes, addAlarmRecords, hasBatch, addToast } = useAppStore()
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  
  const handleDragLeave = () => {
    setIsDragging(false)
  }
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      processFile(files[0])
    }
  }
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
  }
  
  const processFile = async (file: File) => {
    setIsProcessing(true)
    setResult(null)
    
    try {
      const fileHash = await generateFileHash(file)
      
      if (hasBatch(fileHash)) {
        setResult({
          success: false,
          recordCount: 0,
          errorCount: 0,
          errors: [],
          isDuplicate: true,
          fileName: file.name,
        })
        addToast('warning', '该文件已导入过，跳过重复导入')
        setIsProcessing(false)
        return
      }
      
      const content = await file.text()
      const batchId = generateId()
      const tab = activeTab
      
      let records: unknown[] = []
      let errors: ImportError[] = []
      
      if (tab === 'sensor') {
        const result = parseSensorCSV(content, file.name, batchId)
        records = result.records
        errors = result.errors
      } else if (tab === 'note') {
        const result = parseNoteCSV(content, file.name, batchId)
        records = result.records
        errors = result.errors
      } else if (tab === 'alarm') {
        const result = parseAlarmJSON(content, file.name, batchId)
        records = result.records
        errors = result.errors
      }
      
      if (records.length === 0 && errors.length > 0) {
        setResult({
          success: false,
          recordCount: 0,
          errorCount: errors.length,
          errors,
          isDuplicate: false,
          fileName: file.name,
        })
        addToast('error', `导入失败: ${errors.length} 条错误`)
      } else {
        const batchInfo: Omit<ImportBatch, 'id' | 'import_time'> = {
          file_type: tab as FileType,
          file_name: file.name,
          record_count: records.length,
          error_count: errors.length,
          errors,
          file_hash: fileHash,
        }
        
        if (tab === 'sensor') {
          addSensorRecords(records as any[], batchId, batchInfo)
        } else if (tab === 'note') {
          addManualNotes(records as any[], batchId, batchInfo)
        } else if (tab === 'alarm') {
          addAlarmRecords(records as any[], batchId, batchInfo)
        }
        
        setResult({
          success: true,
          recordCount: records.length,
          errorCount: errors.length,
          errors,
          isDuplicate: false,
          fileName: file.name,
        })
        
        if (errors.length > 0) {
          addToast('warning', `导入完成: ${records.length} 条成功, ${errors.length} 条错误`)
        } else {
          addToast('success', `导入完成: ${records.length} 条记录`)
        }
      }
    } catch (e) {
      setResult({
        success: false,
        recordCount: 0,
        errorCount: 1,
        errors: [{
          row: 0,
          field: 'file',
          value: file.name,
          message: '文件处理失败: ' + (e instanceof Error ? e.message : String(e)),
        }],
        isDuplicate: false,
        fileName: file.name,
      })
      addToast('error', '文件处理失败')
    }
    
    setIsProcessing(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  const config = tabConfig[activeTab]
  const Icon = config.icon
  
  const handleClose = () => {
    setResult(null)
    setIsProcessing(false)
    onClose()
  }
  
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="导入数据" size="lg">
      <div className="p-6">
        <div className="flex gap-2 mb-6">
          {(Object.keys(tabConfig) as ImportTab[]).map(tab => {
            const TabIcon = tabConfig[tab].icon
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab)
                  setResult(null)
                }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sky-100 text-sky-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                {tabConfig[tab].label}
              </button>
            )
          })}
        </div>
        
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-sky-500 bg-sky-50'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={config.accept}
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {isProcessing ? (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin mb-3" />
              <p className="text-sm text-slate-600">正在处理文件...</p>
            </div>
          ) : result ? (
            <div className="flex flex-col items-center">
              {result.isDuplicate ? (
                <>
                  <AlertCircle className="w-12 h-12 text-amber-500 mb-3" />
                  <p className="text-sm font-medium text-amber-700">文件已导入过</p>
                  <p className="text-xs text-slate-500 mt-1">{result.fileName}</p>
                </>
              ) : result.success ? (
                <>
                  <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
                  <p className="text-sm font-medium text-emerald-700">导入成功</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {result.fileName} - {result.recordCount} 条记录
                  </p>
                  {result.errorCount > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      {result.errorCount} 条错误数据已跳过
                    </p>
                  )}
                </>
              ) : (
                <>
                  <X className="w-12 h-12 text-red-500 mb-3" />
                  <p className="text-sm font-medium text-red-700">导入失败</p>
                  <p className="text-xs text-slate-500 mt-1">{result.fileName}</p>
                </>
              )}
              <p className="text-xs text-slate-400 mt-3">点击或拖拽重新选择文件</p>
            </div>
          ) : (
            <>
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${
                isDragging ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500'
              }`}>
                <Upload className="w-7 h-7" />
              </div>
              <p className="text-sm font-medium text-slate-700 mb-1">
                点击或拖拽文件到此处
              </p>
              <p className="text-xs text-slate-400">
                支持 {config.accept.toUpperCase()} 格式
              </p>
              <p className="text-xs text-slate-400 mt-3 max-w-sm mx-auto">
                {config.description}
              </p>
            </>
          )}
        </div>
        
        {result && result.errors.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-slate-700">
                错误详情 ({result.errors.length} 条)
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">行号</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">字段</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">错误信息</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.errors.slice(0, 50).map((err, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 text-slate-500">{err.row || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono">{err.field}</td>
                      <td className="px-3 py-2 text-red-600">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.errors.length > 50 && (
                <p className="text-xs text-slate-400 text-center py-2 bg-slate-50">
                  仅显示前 50 条错误
                </p>
              )}
            </div>
          </div>
        )}
        
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </Modal>
  )
}
