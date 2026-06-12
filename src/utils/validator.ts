import { ThresholdConfig } from '../types'

export interface ValidationResult {
  valid: boolean
  errors: Array<{ field: string; message: string; value: string }>
}

export function validateThresholdConfig(config: ThresholdConfig): ValidationResult {
  const errors: Array<{ field: string; message: string; value: string }> = []
  
  if (isNaN(config.temp_min)) {
    errors.push({
      field: 'temp_min',
      message: '温度下限必须是数字',
      value: String(config.temp_min),
    })
  }
  
  if (isNaN(config.temp_max)) {
    errors.push({
      field: 'temp_max',
      message: '温度上限必须是数字',
      value: String(config.temp_max),
    })
  }
  
  if (!isNaN(config.temp_min) && !isNaN(config.temp_max) && config.temp_min >= config.temp_max) {
    errors.push({
      field: 'temp_min',
      message: '温度下限必须小于温度上限',
      value: `${config.temp_min} >= ${config.temp_max}`,
    })
  }
  
  if (isNaN(config.voltage_min)) {
    errors.push({
      field: 'voltage_min',
      message: '电压下限必须是数字',
      value: String(config.voltage_min),
    })
  }
  
  if (isNaN(config.voltage_max)) {
    errors.push({
      field: 'voltage_max',
      message: '电压上限必须是数字',
      value: String(config.voltage_max),
    })
  }
  
  if (!isNaN(config.voltage_min) && !isNaN(config.voltage_max) && config.voltage_min >= config.voltage_max) {
    errors.push({
      field: 'voltage_min',
      message: '电压下限必须小于电压上限',
      value: `${config.voltage_min} >= ${config.voltage_max}`,
    })
  }
  
  if (isNaN(config.offline_duration_min) || config.offline_duration_min <= 0) {
    errors.push({
      field: 'offline_duration_min',
      message: '离线时长阈值必须大于0',
      value: String(config.offline_duration_min),
    })
  }
  
  if (isNaN(config.merge_window_minutes) || config.merge_window_minutes <= 0) {
    errors.push({
      field: 'merge_window_minutes',
      message: '合并窗口必须大于0',
      value: String(config.merge_window_minutes),
    })
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

export const DEFAULT_THRESHOLD: ThresholdConfig = {
  temp_min: -10,
  temp_max: 60,
  voltage_min: 200,
  voltage_max: 250,
  offline_duration_min: 5,
  merge_window_minutes: 30,
}
