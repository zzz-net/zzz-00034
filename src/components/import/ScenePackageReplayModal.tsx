import { useState, useRef } from 'react'
import {
  Upload,
  FileJson,
  AlertTriangle,
  CheckCircle,
  X,
  CheckCheck,
  RotateCcw,
  ArrowLeftRight,
  SkipForward,
  AlertCircle,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { useAppStore } from '../../store/useAppStore'
import { parseScenePackage } from '../../utils/scenePackage'
import { ScenePackage, ReplayMode, ScenePackageReplayResult } from '../../types'

interface ScenePackageReplayModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ScenePackageReplayModal({ isOpen, onClose }: ScenePackageReplayModalProps) {
  const [step, setStep] = useState<'select' | 'choose' | 'done'>('select')
  const [fileName, setFileName] = useState<string>('')
  const [parsedPackage, setParsedPackage] = useState<ScenePackage | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [mode, setMode] = useState<ReplayMode>('merge')
  const [isProcessing, setIsProcessing] = useState(false)
  const [replayResult, setReplayResult] = useState<ScenePackageReplayResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { replayScenePackageData, addToast } = useAppStore()

  const handleFileSelect = async (file: File | null) => {
    if (!file) return
    setFileName(file.name)
    setParseErrors([])
    setIsProcessing(true)
    try {
      const content = await file.text()
      const result = parseScenePackage(content)
      if (!result.valid || !result.data) {
        setParseErrors(result.errors)
        addToast('error', `场景包解析失败: ${result.errors.length} 个错误`)
      } else {
        setParsedPackage(result.data)
        setStep('choose')
      }
    } catch (e) {
      setParseErrors(['文件读取失败: ' + (e instanceof Error ? e.message : String(e))])
      addToast('error', '文件读取失败')
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleReplay = () => {
    if (!parsedPackage) return
    setIsProcessing(true)
    try {
      const result = replayScenePackageData(parsedPackage, mode)
      setReplayResult(result)
      setStep('done')
    } catch (e) {
      addToast('error', '回放失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setIsProcessing(false)
    }
  }

  const resetAll = () => {
    setStep('select')
    setFileName('')
    setParsedPackage(null)
    setParseErrors([])
    setMode('merge')
    setReplayResult(null)
    setIsProcessing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    resetAll()
    onClose()
  }

  const modeOptions: Array<{
    value: ReplayMode
    label: string
    icon: typeof RotateCcw
    description: string
    color: string
  }> = [
    {
      value: 'overwrite',
      label: '覆盖',
      icon: RotateCcw,
      description: '用场景包数据完全替换当前数据',
      color: 'red',
    },
    {
      value: 'merge',
      label: '合并',
      icon: ArrowLeftRight,
      description: '合并数据，已处理状态会保留或被场景包覆盖',
      color: 'sky',
    },
    {
      value: 'skip',
      label: '跳过',
      icon: SkipForward,
      description: '仅导入不存在的批次和事件，跳过重复项',
      color: 'slate',
    },
  ]

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="回放场景包" size="lg">
      <div className="p-6">
        {step === 'select' && (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={async (e) => {
                e.preventDefault()
                const file = e.dataTransfer.files[0]
                if (file) await handleFileSelect(file)
              }}
              onClick={() => fileInputRef.current?.click()}
              className="relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all hover:border-slate-300 hover:bg-slate-50"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  await handleFileSelect(file || null)
                }}
                className="hidden"
              />
              {isProcessing ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin mb-3" />
                  <p className="text-sm text-slate-600">正在解析场景包...</p>
                </div>
              ) : fileName ? (
                <div className="flex flex-col items-center">
                  {parseErrors.length > 0 ? (
                    <>
                      <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
                      <p className="text-sm font-medium text-amber-700">解析失败</p>
                      <p className="text-xs text-slate-500 mt-1">{fileName}</p>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
                      <p className="text-sm font-medium text-emerald-700">文件就绪</p>
                      <p className="text-xs text-slate-500 mt-1">{fileName}</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-7 h-7 text-slate-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 mb-1">
                    点击或拖拽场景包 JSON 文件
                  </p>
                  <p className="text-xs text-slate-400">支持 JSON 格式的场景包导出文件</p>
                </>
              )}
            </div>

            {parseErrors.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium text-slate-700">
                    解析错误 ({parseErrors.length} 条)
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 p-3 text-xs">
                  {parseErrors.slice(0, 30).map((err, i) => (
                    <div key={i} className="py-0.5 text-amber-800">{err}</div>
                  ))}
                  {parseErrors.length > 30 && (
                    <div className="py-0.5 text-amber-600">... 还有 {parseErrors.length - 30} 条错误</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'choose' && parsedPackage && (
          <div className="space-y-5">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <FileJson className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">{fileName}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-slate-400 mb-0.5">导出于</p>
                  <p className="text-slate-700">{new Date(parsedPackage.exported_at).toLocaleString('zh-CN')}</p>
                </div>
                <div>
                  <p className="text-slate-400 mb-0.5">数据规模</p>
                  <p className="text-slate-700">
                    {parsedPackage.sensor_records.length + parsedPackage.manual_notes.length + parsedPackage.alarm_records.length} 条记录
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 mb-0.5">事件数</p>
                  <p className="text-slate-700">{parsedPackage.events.length} 个事件</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">选择回放策略</p>
              <div className="space-y-2">
                {modeOptions.map((opt) => {
                  const Icon = opt.icon
                  const isSelected = mode === opt.value
                  const colorClasses: Record<string, string> = {
                    red: isSelected ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:border-red-200',
                    sky: isSelected ? 'border-sky-300 bg-sky-50' : 'border-slate-200 hover:border-sky-200',
                    slate: isSelected ? 'border-slate-300 bg-slate-100' : 'border-slate-200 hover:border-slate-300',
                  }
                  const iconColors: Record<string, string> = {
                    red: isSelected ? 'text-red-600' : 'text-slate-500',
                    sky: isSelected ? 'text-sky-600' : 'text-slate-500',
                    slate: isSelected ? 'text-slate-700' : 'text-slate-500',
                  }
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setMode(opt.value)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${colorClasses[opt.color]}`}
                    >
                      <Icon className={`w-5 h-5 mt-0.5 ${iconColors[opt.color]}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                      </div>
                      {isSelected && <CheckCheck className="w-5 h-5 text-sky-600 mt-0.5" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {step === 'done' && replayResult && (
          <div className="text-center py-6">
            <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
            <p className="text-lg font-semibold text-slate-800 mb-2">场景包回放完成</p>
            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mt-4">
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xl font-bold text-emerald-700">{replayResult.imported_batches.length}</p>
                <p className="text-xs text-emerald-600 mt-0.5">已导入批次</p>
              </div>
              {replayResult.mode === 'overwrite' ? (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-red-700">{replayResult.overwritten_events}</p>
                  <p className="text-xs text-red-600 mt-0.5">覆盖事件</p>
                </div>
              ) : replayResult.mode === 'merge' ? (
                <div className="bg-sky-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-sky-700">{replayResult.merged_events}</p>
                  <p className="text-xs text-sky-600 mt-0.5">合并事件</p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-slate-700">{replayResult.skipped_events}</p>
                  <p className="text-xs text-slate-500 mt-0.5">跳过事件</p>
                </div>
              )}
              <div className="bg-amber-50 rounded-lg p-3 col-span-2">
                <p className="text-xl font-bold text-amber-700">{replayResult.skipped_batches}</p>
                <p className="text-xs text-amber-600 mt-0.5">跳过重复批次</p>
              </div>
            </div>
            {replayResult.resolution_summary && (
              <div className="mt-4 max-w-md mx-auto bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-left">
                <p className="font-medium text-sky-700 mb-1">处理结果</p>
                <p className="text-sky-800">{replayResult.resolution_summary}</p>
              </div>
            )}
            {replayResult.errors.length > 0 && (
              <div className="mt-4 max-w-md mx-auto">
                <p className="text-xs font-medium text-slate-600 mb-2 text-left">提示信息</p>
                <div className="max-h-32 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-left">
                  {replayResult.errors.map((err, i) => (
                    <div key={i} className="py-0.5 text-amber-800">{err}</div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-4">
              回放记录已保存在本地，刷新或重开页面后可在导入历史中查看
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
              <div />
            </>
          )}
          {step === 'choose' && (
            <>
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                返回
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleReplay}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  开始回放
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
