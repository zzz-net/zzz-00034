import { useState, useEffect } from 'react'
import { Settings, Save, RotateCcw, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { ThresholdConfig } from '../../types'
import { DEFAULT_THRESHOLD } from '../../utils/validator'

export function ThresholdPanel() {
  const { threshold, setThreshold, addToast } = useAppStore()
  const [localConfig, setLocalConfig] = useState<ThresholdConfig>(threshold)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState(false)
  
  useEffect(() => {
    setLocalConfig(threshold)
    setIsDirty(false)
    setErrors({})
  }, [threshold])
  
  const handleChange = (field: keyof ThresholdConfig, value: string) => {
    const numValue = parseFloat(value)
    setLocalConfig(prev => ({ ...prev, [field]: isNaN(numValue) ? 0 : numValue }))
    setIsDirty(true)
    setErrors(prev => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }
  
  const handleSave = () => {
    const result = setThreshold(localConfig)
    if (!result.valid) {
      const errorMap: Record<string, string> = {}
      result.errors.forEach(e => {
        errorMap[e.field] = e.message
      })
      setErrors(errorMap)
      addToast('error', '阈值配置无效，请检查输入')
    } else {
      setIsDirty(false)
      addToast('success', '阈值配置已保存')
    }
  }
  
  const handleReset = () => {
    setLocalConfig(DEFAULT_THRESHOLD)
    setIsDirty(true)
    setErrors({})
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
        <h3 className="font-semibold text-slate-800">阈值配置</h3>
        {isDirty && (
          <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            未保存
          </span>
        )}
      </div>
      
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {(Object.keys(fieldLabels) as Array<keyof ThresholdConfig>).map(field => {
            const { label, unit } = fieldLabels[field]
            const hasError = !!errors[field]
            
            return (
              <div key={field}>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  {label}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={localConfig[field]}
                    onChange={e => handleChange(field, e.target.value)}
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
                  <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                    <AlertCircle className="w-3 h-3" />
                    {errors[field]}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            保存配置
          </button>
          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
        </div>
        
        <p className="text-xs text-slate-400">
          修改阈值后会自动重新分析所有已有数据
        </p>
      </div>
    </div>
  )
}
