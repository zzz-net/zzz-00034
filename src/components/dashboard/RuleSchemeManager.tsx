import { useState } from 'react'
import {
  Settings,
  Plus,
  Copy,
  Edit3,
  Trash2,
  Check,
  X,
  ChevronRight,
  AlertTriangle,
  Eye,
  RotateCcw,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { RuleScheme, ThresholdConfig, RuleSchemeDiff } from '../../types'
import { getFieldLabel, getFieldUnit } from '../../utils/ruleScheme'
import { Modal } from '../common/Modal'
import { RecalcPreviewModal } from './RecalcPreviewModal'

export function RuleSchemeManager() {
  const {
    ruleSchemes,
    activeSchemeId,
    createRuleScheme,
    copyRuleScheme,
    renameRuleScheme,
    deleteRuleScheme,
    compareRuleSchemes,
    switchRuleScheme,
    addToast,
  } = useAppStore()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showDiffModal, setShowDiffModal] = useState(false)
  const [showRecalcModal, setShowRecalcModal] = useState(false)
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null)
  const [compareWithId, setCompareWithId] = useState<string | null>(null)
  const [newSchemeName, setNewSchemeName] = useState('')
  const [newSchemeDesc, setNewSchemeDesc] = useState('')
  const [renameName, setRenameName] = useState('')
  const [schemeDiff, setSchemeDiff] = useState<RuleSchemeDiff | null>(null)
  const [switchTargetId, setSwitchTargetId] = useState<string | null>(null)
  const [editingThreshold, setEditingThreshold] = useState<ThresholdConfig | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const activeScheme = ruleSchemes.find(s => s.id === activeSchemeId)

  const handleCreateScheme = () => {
    if (!newSchemeName.trim()) {
      addToast('error', '请输入方案名称')
      return
    }
    const result = createRuleScheme(
      newSchemeName.trim(),
      activeScheme ? { ...activeScheme.threshold } : {} as ThresholdConfig,
      newSchemeDesc.trim() || undefined
    )
    if (result.success) {
      setShowCreateModal(false)
      setNewSchemeName('')
      setNewSchemeDesc('')
    }
  }

  const handleCopyScheme = (schemeId: string) => {
    const scheme = ruleSchemes.find(s => s.id === schemeId)
    if (!scheme) return
    const newName = `${scheme.name} 副本`
    const result = copyRuleScheme(schemeId, newName)
    if (result.success) {
      setSelectedSchemeId(result.scheme?.id || null)
    }
  }

  const handleRenameScheme = () => {
    if (!selectedSchemeId || !renameName.trim()) {
      addToast('error', '请输入新名称')
      return
    }
    const result = renameRuleScheme(selectedSchemeId, renameName.trim())
    if (result.success) {
      setShowRenameModal(false)
      setRenameName('')
    }
  }

  const handleDeleteScheme = (schemeId: string) => {
    const scheme = ruleSchemes.find(s => s.id === schemeId)
    if (!scheme) return
    if (!confirm(`确定要删除方案「${scheme.name}」吗？`)) return
    deleteRuleScheme(schemeId)
    if (selectedSchemeId === schemeId) {
      setSelectedSchemeId(null)
    }
  }

  const handleViewDiff = (schemeIdA: string, schemeIdB: string) => {
    const diff = compareRuleSchemes(schemeIdA, schemeIdB)
    if (diff) {
      setSchemeDiff(diff)
      setShowDiffModal(true)
    }
  }

  const handleSwitchScheme = (schemeId: string) => {
    const scheme = ruleSchemes.find(s => s.id === schemeId)
    if (!scheme || scheme.is_active) return
    setSwitchTargetId(schemeId)
    setShowRecalcModal(true)
  }

  const handleSwitchComplete = (success: boolean) => {
    setShowRecalcModal(false)
    setSwitchTargetId(null)
    if (success) {
      setSelectedSchemeId(null)
    }
  }

  const openEditModal = (scheme: RuleScheme) => {
    setEditingThreshold({ ...scheme.threshold })
    setEditErrors({})
    setSelectedSchemeId(scheme.id)
    setShowEditModal(true)
  }

  const handleEditThreshold = () => {
    if (!selectedSchemeId || !editingThreshold) return
    const result = useAppStore.getState().updateRuleScheme(selectedSchemeId, {
      threshold: editingThreshold,
    })
    if (result.success) {
      setShowEditModal(false)
      setEditingThreshold(null)
    } else if (result.error) {
      addToast('error', result.error)
    }
  }

  const handleThresholdFieldChange = (field: keyof ThresholdConfig, value: string) => {
    if (!editingThreshold) return
    const numValue = parseFloat(value)
    setEditingThreshold(prev => prev ? { ...prev, [field]: isNaN(numValue) ? 0 : numValue } : prev)
    setEditErrors(prev => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const fieldLabels: Record<keyof ThresholdConfig, { label: string; unit: string }> = {
    temp_min: { label: '温度下限', unit: '°C' },
    temp_max: { label: '温度上限', unit: '°C' },
    voltage_min: { label: '电压下限', unit: 'V' },
    voltage_max: { label: '电压上限', unit: 'V' },
    offline_duration_min: { label: '离线时长阈值', unit: '分钟' },
    merge_window_minutes: { label: '事件合并窗口', unit: '分钟' },
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <Settings className="w-5 h-5 text-sky-600" />
        <h3 className="font-semibold text-slate-800">规则方案管理</h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-sky-600 text-white text-xs font-medium rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          新建方案
        </button>
      </div>

      <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
        {ruleSchemes.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            暂无规则方案
          </div>
        ) : (
          ruleSchemes.map(scheme => (
            <div
              key={scheme.id}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${
                scheme.id === activeSchemeId
                  ? 'border-sky-300 bg-sky-50'
                  : scheme.id === selectedSchemeId
                  ? 'border-slate-300 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
              onClick={() => setSelectedSchemeId(scheme.id === selectedSchemeId ? null : scheme.id)}
            >
              <div className="flex items-center gap-2">
                {scheme.is_active && (
                  <span className="inline-flex items-center gap-1 text-xs text-sky-600 bg-sky-100 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3" />
                    当前
                  </span>
                )}
                <span className="font-medium text-slate-800 text-sm">{scheme.name}</span>
                <span className="ml-auto text-xs text-slate-400">
                  v{scheme.version}
                </span>
                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${
                  scheme.id === selectedSchemeId ? 'rotate-90' : ''
                }`} />
              </div>

              {scheme.id === selectedSchemeId && (
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                  {scheme.description && (
                    <p className="text-xs text-slate-500">{scheme.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {(Object.keys(scheme.threshold) as Array<keyof ThresholdConfig>).map(field => (
                      <div key={field} className="flex justify-between">
                        <span className="text-slate-500">{getFieldLabel(field)}</span>
                        <span className="font-medium text-slate-700">
                          {scheme.threshold[field]}{getFieldUnit(field)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!scheme.is_active && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSwitchScheme(scheme.id) }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-sky-600 text-white text-xs rounded-md hover:bg-sky-700 transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        切换
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(scheme) }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-md hover:bg-slate-200 transition-colors"
                      disabled={scheme.is_default}
                    >
                      <Edit3 className="w-3 h-3" />
                      编辑
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyScheme(scheme.id) }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-md hover:bg-slate-200 transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                      复制
                    </button>
                    {!scheme.is_default && !scheme.is_active && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteScheme(scheme.id) }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 text-red-600 text-xs rounded-md hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        删除
                      </button>
                    )}
                  </div>

                  {ruleSchemes.length > 1 && (
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">与其他方案对比：</label>
                      <div className="flex gap-2">
                        <select
                          value={compareWithId || ''}
                          onChange={(e) => setCompareWithId(e.target.value)}
                          className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">选择对比方案</option>
                          {ruleSchemes.filter(s => s.id !== scheme.id).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (compareWithId) {
                              handleViewDiff(scheme.id, compareWithId)
                            }
                          }}
                          disabled={!compareWithId}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-md hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          <Eye className="w-3 h-3" />
                          对比
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="新建规则方案"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">方案名称</label>
            <input
              type="text"
              value={newSchemeName}
              onChange={(e) => setNewSchemeName(e.target.value)}
              placeholder="请输入方案名称"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">方案描述（可选）</label>
            <textarea
              value={newSchemeDesc}
              onChange={(e) => setNewSchemeDesc(e.target.value)}
              placeholder="请输入方案描述"
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 resize-none"
            />
          </div>
          <p className="text-xs text-slate-400">
            新方案将继承当前激活方案的阈值配置
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowCreateModal(false)}
              className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleCreateScheme}
              className="flex-1 px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors"
            >
              创建
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        title="重命名方案"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">新名称</label>
            <input
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="请输入新名称"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowRenameModal(false)}
              className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleRenameScheme}
              className="flex-1 px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        title="方案差异对比"
        size="md"
      >
        {schemeDiff && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">{schemeDiff.scheme_a_name}</span>
              <ChevronRight className="w-5 h-5 text-slate-400" />
              <span className="font-medium text-sky-600">{schemeDiff.scheme_b_name}</span>
            </div>

            {schemeDiff.differences.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <Check className="w-8 h-8 mx-auto mb-2 text-green-400" />
                两个方案完全相同
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">
                  共 <span className="font-medium">{schemeDiff.differences.length}</span> 处差异：
                </p>
                <div className="space-y-2">
                  {schemeDiff.differences.map((diff, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                      <span className="text-sm font-medium text-slate-700">
                        {getFieldLabel(diff.field)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500">
                          {diff.value_a}{getFieldUnit(diff.field)}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                        <span className={`text-sm font-medium ${
                          (diff.change_percent || 0) > 0 ? 'text-red-600' :
                          (diff.change_percent || 0) < 0 ? 'text-green-600' : 'text-slate-600'
                        }`}>
                          {diff.value_b}{getFieldUnit(diff.field)}
                        </span>
                        {diff.change_percent !== undefined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            diff.change_percent > 0 ? 'bg-red-100 text-red-600' :
                            diff.change_percent < 0 ? 'bg-green-100 text-green-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {diff.change_percent > 0 ? '+' : ''}{diff.change_percent.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowDiffModal(false)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg hover:bg-slate-200 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="编辑阈值配置"
        size="md"
      >
        {editingThreshold && selectedSchemeId && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {(Object.keys(fieldLabels) as Array<keyof ThresholdConfig>).map(field => {
                const { label, unit } = fieldLabels[field]
                const hasError = !!editErrors[field]
                return (
                  <div key={field}>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      {label}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={editingThreshold[field]}
                        onChange={e => handleThresholdFieldChange(field, e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                          hasError
                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                            : 'border-slate-200 focus:ring-sky-200 focus:border-sky-400'
                        }`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        {unit}
                      </span>
                    </div>
                    {hasError && (
                      <p className="text-xs text-red-500 mt-1">{editErrors[field]}</p>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleEditThreshold}
                className="flex-1 px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        )}
      </Modal>

      {switchTargetId && (
        <RecalcPreviewModal
          isOpen={showRecalcModal}
          onClose={() => handleSwitchComplete(false)}
          targetSchemeId={switchTargetId}
          onComplete={handleSwitchComplete}
        />
      )}
    </div>
  )
}
