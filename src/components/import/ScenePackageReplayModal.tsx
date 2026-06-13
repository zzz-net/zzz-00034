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
  ArrowRight,
  RefreshCw,
  ArrowLeft,
  Gauge,
  Database,
  History,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { useAppStore } from '../../store/useAppStore'
import { parseScenePackage } from '../../utils/scenePackage'
import { ScenePackage, ReplayMode, ScenePackageReplayResult, ReplayConflictAnalysis, ConflictChoice, ConflictChoiceType } from '../../types'

interface ScenePackageReplayModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ScenePackageReplayModal({ isOpen, onClose }: ScenePackageReplayModalProps) {
  const [step, setStep] = useState<'select' | 'choose' | 'resolve_conflicts' | 'confirm' | 'done'>('select')
  const [fileName, setFileName] = useState<string>('')
  const [parsedPackage, setParsedPackage] = useState<ScenePackage | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [mode, setMode] = useState<ReplayMode>('merge')
  const [isProcessing, setIsProcessing] = useState(false)
  const [replayResult, setReplayResult] = useState<ScenePackageReplayResult | null>(null)
  const [conflictAnalysis, setConflictAnalysis] = useState<ReplayConflictAnalysis | null>(null)
  const [conflictChoices, setConflictChoices] = useState<ConflictChoice[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { replayScenePackageData, analyzeReplayConflictsUI, addToast } = useAppStore()

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

  const handleContinueFromChoose = () => {
    if (!parsedPackage) return
    setIsProcessing(true)
    try {
      const analysis = analyzeReplayConflictsUI(parsedPackage)
      setConflictAnalysis(analysis)
      setConflictChoices(analysis.choices_needed.map(c => ({ ...c })))
      const hasConflicts =
        analysis.same_device_time_conflicts.length > 0 ||
        analysis.batch_duplicates.length > 0 ||
        analysis.undone_sessions.length > 0 ||
        (analysis.threshold_diff && analysis.threshold_diff.differences.length > 0)
      if (hasConflicts) {
        setStep('resolve_conflicts')
      } else {
        setStep('confirm')
      }
    } catch (e) {
      addToast('error', '冲突分析失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setIsProcessing(false)
    }
  }

  const updateConflictChoice = (key: string, choice: ConflictChoiceType) => {
    setConflictChoices(prev =>
      prev.map(c => (c.key === key ? { ...c, choice } : c))
    )
  }

  const getPendingCount = (): number => {
    return conflictChoices.length
  }

  const handleContinueFromResolve = () => {
    setStep('confirm')
  }

  const handleReplay = () => {
    if (!parsedPackage) return
    setIsProcessing(true)
    try {
      const result = replayScenePackageData(parsedPackage, mode, conflictChoices.length > 0 ? conflictChoices : undefined)
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
    setConflictAnalysis(null)
    setConflictChoices([])
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

  const sameDeviceChoices = conflictChoices.filter(c => c.conflict_type === 'same_device_time')
  const batchDupChoices = conflictChoices.filter(c => c.conflict_type === 'batch_duplicate')
  const undoneSessChoices = conflictChoices.filter(c => c.conflict_type === 'undone_session')
  const thresholdDiffChoices = conflictChoices.filter(c => c.conflict_type === 'threshold_diff')

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="回放场景包" size="xl">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6 text-sm flex-wrap">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${step === 'select' ? 'bg-sky-100 text-sky-700' : 'text-slate-500'}`}>
            <Upload className="w-3.5 h-3.5" />
            1. 选择文件
          </div>
          <ArrowRight className="w-3 h-3 text-slate-300" />
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${step === 'choose' ? 'bg-sky-100 text-sky-700' : 'text-slate-500'}`}>
            <ArrowLeftRight className="w-3.5 h-3.5" />
            2. 选择策略
          </div>
          {(step === 'resolve_conflicts' || step === 'confirm' || step === 'done') && (
            <>
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${step === 'resolve_conflicts' ? 'bg-sky-100 text-sky-700' : 'text-slate-500'}`}>
                <AlertTriangle className="w-3.5 h-3.5" />
                3. 解决冲突
              </div>
            </>
          )}
          {(step === 'confirm' || step === 'done') && (
            <>
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${step === 'confirm' ? 'bg-sky-100 text-sky-700' : 'text-slate-500'}`}>
                <CheckCircle className="w-3.5 h-3.5" />
                4. 确认
              </div>
            </>
          )}
          {step === 'done' && (
            <>
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700`}>
                <CheckCheck className="w-3.5 h-3.5" />
                5. 完成
              </div>
            </>
          )}
        </div>

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

        {step === 'resolve_conflicts' && conflictAnalysis && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800">
                <p className="font-medium mb-1">检测到 {conflictAnalysis.total_conflicts} 处潜在冲突</p>
                <p>请在下方选择每类冲突的处理方式。所有选择将合并到本次回放中。</p>
              </div>
            </div>

            {sameDeviceChoices.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-medium text-slate-700">
                      同设备同时间冲突
                    </span>
                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                      {sameDeviceChoices.length}
                    </span>
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {sameDeviceChoices.slice(0, 10).map((c) => (
                    <div key={c.key} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                            {c.device_id || '-'}
                          </span>
                          <span className="text-slate-500">
                            {(c.timestamp || '').slice(0, 19)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 truncate">{c.description}</p>
                      </div>
                      <select
                        value={c.choice}
                        onChange={(e) => updateConflictChoice(c.key, e.target.value as ConflictChoiceType)}
                        className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                      >
                        <option value="keep_both">保留两者</option>
                        <option value="skip">跳过</option>
                        <option value="overwrite">覆盖</option>
                      </select>
                    </div>
                  ))}
                  {sameDeviceChoices.length > 10 && (
                    <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50">
                      ... 还有 {sameDeviceChoices.length - 10} 条冲突，以上方默认策略处理
                    </div>
                  )}
                </div>
              </div>
            )}

            {batchDupChoices.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-medium text-slate-700">
                      重复批次
                    </span>
                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                      {batchDupChoices.length}
                    </span>
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {batchDupChoices.map((c) => (
                    <div key={c.key} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-700 truncate">
                          {c.new_source}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{c.description}</p>
                      </div>
                      <select
                        value={c.choice}
                        onChange={(e) => updateConflictChoice(c.key, e.target.value as ConflictChoiceType)}
                        className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                      >
                        <option value="skip">跳过</option>
                        <option value="overwrite">覆盖</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {undoneSessChoices.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-medium text-slate-700">
                      已撤销会话
                    </span>
                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                      {undoneSessChoices.length}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <p className="text-xs text-slate-600">
                    该场景包含已撤销会话记录，是否一并恢复？
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
                    {undoneSessChoices.slice(0, 10).map((c) => (
                      <div key={c.key} className="text-xs text-slate-500 flex items-center justify-between gap-2">
                        <span className="truncate">会话 {c.key.slice(0, 10)}...</span>
                        <span className="text-slate-400">{c.description}</span>
                      </div>
                    ))}
                  </div>
                  {undoneSessChoices.map((c) => (
                    <div key={c.key}>
                      <select
                        value={c.choice}
                        onChange={(e) => updateConflictChoice(c.key, e.target.value as ConflictChoiceType)}
                        className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                      >
                        <option value="skip">跳过（保持已撤销状态）</option>
                        <option value="overwrite">恢复（重新激活）</option>
                      </select>
                    </div>
                  ))[0]}
                </div>
              </div>
            )}

            {thresholdDiffChoices.length > 0 && conflictAnalysis.threshold_diff && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-medium text-slate-700">
                      阈值差异
                    </span>
                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                      {conflictAnalysis.threshold_diff.differences.length}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {conflictAnalysis.threshold_diff.differences.map((diff, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-1">
                      <div className="flex-1 flex items-center gap-2 text-xs">
                        <span className="font-medium text-slate-700 min-w-[120px]">{diff.field}</span>
                        <span className="text-slate-500">{String(diff.current)}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span className="text-sky-700 font-medium">{String(diff.imported)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-slate-100">
                    <label className="text-xs text-slate-500 block mb-1">整体处理方式</label>
                    {thresholdDiffChoices.length > 0 && (
                      <select
                        value={thresholdDiffChoices[0].choice}
                        onChange={(e) => {
                          const val = e.target.value as ConflictChoiceType
                          thresholdDiffChoices.forEach((c) => updateConflictChoice(c.key, val))
                        }}
                        className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                      >
                        <option value="merge">合并（对每个差异取更严格值）</option>
                        <option value="skip">保留当前（不导入阈值）</option>
                        <option value="overwrite">覆盖（使用导入的阈值）</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && parsedPackage && (
          <div className="space-y-5">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <FileJson className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">{fileName}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-400 mb-0.5">回放策略</p>
                  <p className="text-slate-700 font-medium">
                    {mode === 'overwrite' ? '覆盖' : mode === 'merge' ? '合并' : '跳过'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 mb-0.5">冲突处理</p>
                  <p className="text-slate-700 font-medium">
                    {conflictChoices.length > 0 ? `${conflictChoices.length} 项已选择` : '无冲突'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 mb-0.5">待导入批次</p>
                  <p className="text-slate-700">{parsedPackage.import_batches.length} 个</p>
                </div>
                <div>
                  <p className="text-slate-400 mb-0.5">待处理事件</p>
                  <p className="text-slate-700">{parsedPackage.events.length} 个</p>
                </div>
              </div>
            </div>

            {conflictChoices.length > 0 && (
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-sky-600" />
                  <span className="text-sm font-medium text-sky-700">冲突处理摘要</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-white rounded p-2">
                    <p className="text-base font-bold text-slate-700">{sameDeviceChoices.length}</p>
                    <p className="text-slate-500 mt-0.5">时间冲突</p>
                  </div>
                  <div className="bg-white rounded p-2">
                    <p className="text-base font-bold text-slate-700">{batchDupChoices.length}</p>
                    <p className="text-slate-500 mt-0.5">重复批次</p>
                  </div>
                  <div className="bg-white rounded p-2">
                    <p className="text-base font-bold text-slate-700">{undoneSessChoices.length}</p>
                    <p className="text-slate-500 mt-0.5">撤销会话</p>
                  </div>
                  <div className="bg-white rounded p-2">
                    <p className="text-base font-bold text-slate-700">{thresholdDiffChoices.length}</p>
                    <p className="text-slate-500 mt-0.5">阈值差异</p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
              ⚠️ 点击「确认回放」后将写入批次日志。回放前已自动生成撤销快照，可在导入历史中撤销本次操作。
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
                  onClick={handleContinueFromChoose}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  继续
                </button>
              </div>
            </>
          )}
          {step === 'resolve_conflicts' && (
            <>
              <button
                onClick={() => setStep('choose')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
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
                  onClick={handleContinueFromResolve}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <CheckCheck className="w-4 h-4" />
                  继续导入（{getPendingCount()} 个待确认）
                </button>
              </div>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button
                onClick={() => setStep(conflictAnalysis ? 'resolve_conflicts' : 'choose')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
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
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  确认回放
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
