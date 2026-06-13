import { useState, useEffect } from 'react'
import {
  AlertTriangle,
  Check,
  X,
  ChevronRight,
  RefreshCw,
  Shield,
  SkipForward,
  Zap,
  Clock,
  Info,
  Plus,
  Minus,
  Merge,
  Split,
  Lock,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import {
  RecalcPreview,
  RecalcEventChange,
  EventChangeType,
  StateConflict,
  StateConflictChoiceType,
  StateConflictChoice,
} from '../../types'
import { Modal } from '../common/Modal'

interface RecalcPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  targetSchemeId: string
  onComplete: (success: boolean) => void
}

const changeTypeLabels: Record<EventChangeType, { label: string; icon: any; color: string }> = {
  new: { label: '新增', icon: Plus, color: 'text-green-600 bg-green-50' },
  merged: { label: '合并', icon: Merge, color: 'text-blue-600 bg-blue-50' },
  split: { label: '拆分', icon: Split, color: 'text-purple-600 bg-purple-50' },
  closed: { label: '关闭', icon: Minus, color: 'text-red-600 bg-red-50' },
  unchanged: { label: '保持', icon: Check, color: 'text-slate-500 bg-slate-50' },
  modified: { label: '修改', icon: RefreshCw, color: 'text-amber-600 bg-amber-50' },
}

const choiceLabels: Record<StateConflictChoiceType, { label: string; icon: any; color: string }> = {
  keep_manual: { label: '保留人工状态', icon: Shield, color: 'text-green-600 bg-green-50' },
  recalculate: { label: '按新规则重算', icon: Zap, color: 'text-sky-600 bg-sky-50' },
  skip_batch: { label: '跳过本批次', icon: SkipForward, color: 'text-amber-600 bg-amber-50' },
}

export function RecalcPreviewModal({
  isOpen,
  onClose,
  targetSchemeId,
  onComplete,
}: RecalcPreviewModalProps) {
  const {
    ruleSchemes,
    sensorRecords,
    manualNotes,
    alarmRecords,
    events,
    importBatches,
    switchRuleScheme,
    calculateRecalcPreview,
    recalcPreviews,
    pendingStateConflicts,
    detectStateConflictsForPreview,
    conflictChoices,
    resolveStateConflict,
    addToast,
  } = useAppStore()

  const [preview, setPreview] = useState<RecalcPreview | null>(null)
  const [conflicts, setConflicts] = useState<StateConflict[]>([])
  const [activeTab, setActiveTab] = useState<'summary' | 'conflicts'>('summary')
  const [isCalculating, setIsCalculating] = useState(false)
  const [selectedChangeType, setSelectedChangeType] = useState<EventChangeType | 'all'>('all')
  const [localChoices, setLocalChoices] = useState<Map<string, StateConflictChoiceType>>(new Map())
  const [isApplying, setIsApplying] = useState(false)

  const targetScheme = ruleSchemes.find(s => s.id === targetSchemeId)
  const oldScheme = ruleSchemes.find(s => s.is_active)

  useEffect(() => {
    if (isOpen && targetSchemeId) {
      setIsCalculating(true)
      setPreview(null)
      setConflicts([])
      setLocalChoices(new Map())

      setTimeout(() => {
        const result = calculateRecalcPreview(targetSchemeId)
        if (result) {
          setPreview(result)
          const conflictList = detectStateConflictsForPreview(result.id)
          setConflicts(conflictList)
        }
        setIsCalculating(false)
      }, 50)
    }
  }, [isOpen, targetSchemeId])

  const handleChoiceChange = (conflictId: string, choice: StateConflictChoiceType) => {
    setLocalChoices(prev => {
      const next = new Map(prev)
      next.set(conflictId, choice)
      return next
    })
  }

  const applyAllChoice = (choice: StateConflictChoiceType) => {
    const next = new Map<string, StateConflictChoiceType>()
    conflicts.forEach(c => next.set(c.id, choice))
    setLocalChoices(next)
  }

  const handleApply = () => {
    if (!preview) return
    setIsApplying(true)

    const choices: StateConflictChoice[] = []
    conflicts.forEach(conflict => {
      const choice = localChoices.get(conflict.id) || 'keep_manual'
      choices.push({
        conflict_id: conflict.id,
        event_id: conflict.event_id,
        choice,
        batch_id: conflict.batch_id,
        created_at: new Date().toISOString(),
      })
    })

    setTimeout(() => {
      const result = switchRuleScheme(targetSchemeId, choices, false)
      setIsApplying(false)
      if (result.success) {
        addToast('success', `已切换到方案「${targetScheme?.name}」`)
        onComplete(true)
      } else {
        addToast('error', `切换失败: ${result.error}`)
      }
    }, 100)
  }

  const handleCancel = () => {
    if (preview) {
      useAppStore.getState().cancelRecalcPreview(preview.id)
    }
    onClose()
  }

  const filteredChanges = preview
    ? selectedChangeType === 'all'
      ? preview.changes
      : preview.changes.filter(c => c.change_type === selectedChangeType)
    : []

  const unresolvedCount = conflicts.filter(c => !localChoices.has(c.id)).length

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="切换方案 - 回算预览"
      size="xl"
    >
      {isCalculating ? (
        <div className="flex flex-col items-center justify-center py-12">
          <RefreshCw className="w-10 h-10 text-sky-500 animate-spin mb-4" />
          <p className="text-slate-600">正在计算回算结果...</p>
        </div>
      ) : preview ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-slate-500">原方案</p>
                <p className="font-medium text-slate-700">{oldScheme?.name}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">新方案</p>
                <p className="font-medium text-sky-600">{targetScheme?.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-800">
                {preview.old_event_count}
                <ChevronRight className="w-5 h-5 inline mx-1 text-slate-400" />
                {preview.new_event_count}
              </p>
              <p className="text-xs text-slate-500">事件总数变化</p>
            </div>
          </div>

          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setActiveTab('summary')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'summary'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              回算结果
              <span className="ml-1 text-xs text-slate-400">({preview.changes.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('conflicts')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors relative ${
                activeTab === 'conflicts'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              状态冲突
              {conflicts.length > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center min-w-5 h-5 text-xs font-medium rounded-full ${
                  unresolvedCount > 0
                    ? 'bg-amber-500 text-white'
                    : 'bg-green-500 text-white'
                }`}>
                  {conflicts.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'summary' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedChangeType('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    selectedChangeType === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  全部 ({preview.changes.length})
                </button>
                {(Object.keys(changeTypeLabels) as EventChangeType[]).map(type => {
                  const count = preview.changes.filter(c => c.change_type === type).length
                  if (count === 0) return null
                  const { label, icon: Icon, color } = changeTypeLabels[type]
                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedChangeType(type)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${
                        selectedChangeType === type
                          ? color.replace('text-', 'bg-').replace('-600', '-600 text-white')
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label} ({count})
                    </button>
                  )
                })}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">类型</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">设备</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">时间</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">说明</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500">人工状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredChanges.map((change, idx) => {
                      const { label, icon: Icon, color } = changeTypeLabels[change.change_type]
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${color}`}>
                              <Icon className="w-3 h-3" />
                              {label}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">
                            {change.device_id}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            {change.new_start_time
                              ? new Date(change.new_start_time).toLocaleString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : change.old_start_time
                              ? new Date(change.old_start_time).toLocaleString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            {change.description}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {change.has_manual_state ? (
                              <Lock className="w-4 h-4 text-amber-500 mx-auto" />
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{preview.new_events}</p>
                  <p className="text-xs text-green-700">新增事件</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{preview.merged_events}</p>
                  <p className="text-xs text-blue-700">合并事件</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">{preview.split_events}</p>
                  <p className="text-xs text-purple-700">拆分事件</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'conflicts' && (
            <div className="space-y-3">
              {conflicts.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Check className="w-10 h-10 mx-auto mb-2 text-green-400" />
                  <p>没有检测到状态冲突</p>
                  <p className="text-xs mt-1">所有事件都可以安全切换</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                      共 <span className="font-medium">{conflicts.length}</span> 个事件存在人工状态
                      （已确认/误报/关闭），请选择处理方式
                    </p>
                    <div className="flex gap-1">
                      {(Object.keys(choiceLabels) as StateConflictChoiceType[]).map(choice => {
                        const { label, icon: Icon, color } = choiceLabels[choice]
                        return (
                          <button
                            key={choice}
                            onClick={() => applyAllChoice(choice)}
                            className={`px-2 py-1 text-xs rounded-md flex items-center gap-1 ${color}`}
                          >
                            <Icon className="w-3 h-3" />
                            全部{label.replace('人工状态', '保留')}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {conflicts.map(conflict => {
                      const selectedChoice = localChoices.get(conflict.id)
                      return (
                        <div
                          key={conflict.id}
                          className="p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium text-slate-700">
                                  {conflict.event_device_id}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {new Date(conflict.event_start_time).toLocaleString('zh-CN')}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {conflict.description}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                原: {conflict.old_status}
                              </span>
                              <ChevronRight className="w-3 h-3 text-slate-400" />
                              <span className="text-xs px-2 py-0.5 bg-sky-50 text-sky-600 rounded">
                                新: {conflict.new_status}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {(Object.keys(choiceLabels) as StateConflictChoiceType[]).map(choice => {
                              const { label, icon: Icon, color } = choiceLabels[choice]
                              const isSelected = selectedChoice === choice
                              return (
                                <button
                                  key={choice}
                                  onClick={() => handleChoiceChange(conflict.id, choice)}
                                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                                    isSelected
                                      ? color.replace('text-', 'bg-').replace('-600', '-600 text-white')
                                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <Icon className="w-3 h-3" />
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            {conflicts.length > 0 && unresolvedCount > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                还有 {unresolvedCount} 个冲突未处理，默认将保留人工状态
              </p>
            )}
            {conflicts.length > 0 && unresolvedCount === 0 && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                所有冲突已处理
              </p>
            )}
            {conflicts.length === 0 && (
              <span></span>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={isApplying}
                className="px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying}
                className="px-6 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {isApplying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    应用中...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    确认切换
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
