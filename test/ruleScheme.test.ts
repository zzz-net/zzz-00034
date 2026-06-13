import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  createDefaultScheme,
  createScheme,
  copyScheme,
  updateScheme,
  renameScheme,
  deleteScheme,
  switchScheme,
  compareSchemes,
  calculateRecalcPreview,
  detectStateConflicts,
  applyConflictChoice,
  applyRecalcPreview,
  cancelRecalcPreview,
  migrateEventStatesWithChoices,
  getFieldLabel,
  getFieldUnit,
} from '../src/utils/ruleScheme'
import {
  parseSensorCSV,
  parseNoteCSV,
  generateId,
} from '../src/utils/csvParser'
import { parseAlarmJSON } from '../src/utils/jsonParser'
import { DEFAULT_THRESHOLD } from '../src/utils/validator'
import {
  RuleScheme,
  ThresholdConfig,
  Event,
  SensorRecord,
  ManualNote,
  AlarmRecord,
  ImportBatch,
  StateConflictChoiceType,
  EventStatus,
} from '../src/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let testCount = 0
let passCount = 0

function assert(condition: boolean, message: string) {
  testCount++
  if (!condition) {
    console.error('❌ 测试失败:', message)
    process.exitCode = 1
  } else {
    passCount++
    console.log('✅', message)
  }
}

function assertApproxEqual(a: number, b: number, epsilon: number, message: string) {
  assert(Math.abs(a - b) <= epsilon, `${message} (${a} ≈ ${b}, 差值 ${Math.abs(a - b)})`)
}

function loadSampleData(): {
  sensorRecords: SensorRecord[]
  manualNotes: ManualNote[]
  alarmRecords: AlarmRecord[]
  batchId: string
} {
  const sensorCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'sensor_data.csv')
  const noteCsvPath = path.join(__dirname, '..', 'public', 'sample_data', 'manual_notes.csv')
  const alarmJsonPath = path.join(__dirname, '..', 'public', 'sample_data', 'alarm_data.json')

  const sensorCsvContent = fs.readFileSync(sensorCsvPath, 'utf-8')
  const noteCsvContent = fs.readFileSync(noteCsvPath, 'utf-8')
  const alarmJsonContent = fs.readFileSync(alarmJsonPath, 'utf-8')

  const batchId = generateId()
  const sensorResult = parseSensorCSV(sensorCsvContent, 'sensor_data.csv', batchId)
  const noteResult = parseNoteCSV(noteCsvContent, 'manual_notes.csv', batchId)
  const alarmResult = parseAlarmJSON(alarmJsonContent, 'alarm_data.json', batchId)

  return {
    sensorRecords: sensorResult.records as SensorRecord[],
    manualNotes: noteResult.records as ManualNote[],
    alarmRecords: alarmResult.records as AlarmRecord[],
    batchId,
  }
}

async function runTests() {
  console.log('=== 开始规则方案核心逻辑测试 ===\n')

  const sampleData = loadSampleData()

  console.log('\n1. 测试默认方案创建')
  const defaultScheme = createDefaultScheme()
  assert(defaultScheme.id.startsWith('scheme_'), '方案ID格式正确')
  assert(defaultScheme.name === '默认方案', '默认方案名称正确')
  assert(defaultScheme.is_default === true, '默认方案标记为默认')
  assert(defaultScheme.is_active === true, '默认方案初始为激活状态')
  assert(defaultScheme.version === 1, '默认方案版本为1')
  assert(typeof defaultScheme.threshold === 'object', '默认方案包含阈值配置')
  assert(defaultScheme.threshold.temp_min === DEFAULT_THRESHOLD.temp_min, '默认温度下限正确')
  assert(defaultScheme.threshold.temp_max === DEFAULT_THRESHOLD.temp_max, '默认温度上限正确')

  console.log('\n2. 测试创建自定义方案')
  const customThreshold: ThresholdConfig = {
    temp_min: 0,
    temp_max: 50,
    voltage_min: 210,
    voltage_max: 240,
    offline_duration_min: 10,
    merge_window_minutes: 15,
  }
  const { scheme: customScheme, auditLog: createAuditLog } = createScheme(
    '测试方案',
    customThreshold,
    { description: '用于测试的方案' }
  )
  assert(customScheme.name === '测试方案', '自定义方案名称正确')
  assert(customScheme.description === '用于测试的方案', '自定义方案描述正确')
  assert(customScheme.is_default === false, '自定义方案不是默认方案')
  assert(customScheme.is_active === false, '自定义方案初始未激活')
  assert(customScheme.threshold.temp_min === 0, '自定义温度下限正确')
  assert(customScheme.threshold.merge_window_minutes === 15, '自定义合并窗口正确')
  assert(createAuditLog.action_type === 'scheme_create', '创建审计日志类型正确')
  assert(createAuditLog.scheme_id === customScheme.id, '审计日志关联正确方案')

  console.log('\n3. 测试非法阈值验证')
  try {
    createScheme('非法方案', {
      temp_min: 100,
      temp_max: 0,
      voltage_min: 200,
      voltage_max: 250,
      offline_duration_min: 5,
      merge_window_minutes: 30,
    })
    assert(false, '应该抛出阈值无效错误')
  } catch (e) {
    const err = e as Error
    assert(err.message.includes('无效的阈值配置'), '非法阈值被正确拒绝')
  }

  console.log('\n4. 测试复制方案')
  const { scheme: copiedScheme, auditLog: copyAuditLog } = copyScheme(customScheme, '测试方案副本')
  assert(copiedScheme.id !== customScheme.id, '复制的方案有新的ID')
  assert(copiedScheme.name === '测试方案副本', '复制的方案名称正确')
  assert(copiedScheme.threshold.temp_min === customScheme.threshold.temp_min, '复制的方案阈值相同')
  assert(copiedScheme.is_default === false, '复制的方案不是默认方案')
  assert(copiedScheme.is_active === false, '复制的方案未激活')
  assert(copyAuditLog.action_type === 'scheme_copy', '复制审计日志类型正确')
  assert(copyAuditLog.metadata?.source_scheme_id === customScheme.id, '审计日志记录源方案')

  console.log('\n5. 测试更新方案')
  const updatedThreshold = { ...customThreshold, temp_max: 55 }
  const { scheme: updatedScheme, auditLog: updateAuditLog } = updateScheme(
    customScheme,
    { threshold: updatedThreshold, description: '更新后的描述' }
  )
  assert(updatedScheme.version === customScheme.version + 1, '更新后版本号增加')
  assert(updatedScheme.threshold.temp_max === 55, '更新后的温度上限正确')
  assert(updatedScheme.description === '更新后的描述', '更新后的描述正确')
  assert(updateAuditLog.action_type === 'scheme_update', '更新审计日志类型正确')
  assert((updateAuditLog.metadata?.changed_fields as string[]).includes('threshold'), '审计日志记录变更字段')

  console.log('\n6. 测试重命名方案')
  const { scheme: renamedScheme, auditLog: renameAuditLog } = renameScheme(
    updatedScheme,
    '重命名后的方案'
  )
  assert(renamedScheme.name === '重命名后的方案', '重命名后名称正确')
  assert(renamedScheme.version === updatedScheme.version + 1, '重命名后版本号增加')
  assert(renameAuditLog.action_type === 'scheme_rename', '重命名审计日志类型正确')

  console.log('\n7. 测试删除方案')
  const schemes = [defaultScheme, renamedScheme, copiedScheme]
  const deleteResult = deleteScheme(schemes, copiedScheme.id, 'testUser')
  assert(deleteResult.schemes.length === 2, '删除后方案数量减少')
  assert(!deleteResult.schemes.find(s => s.id === copiedScheme.id), '被删除的方案不在列表中')
  assert(deleteResult.auditLog.action_type === 'scheme_delete', '删除审计日志类型正确')

  console.log('\n8. 测试删除默认方案的保护')
  const deleteDefaultResult = deleteScheme(schemes, defaultScheme.id)
  assert(deleteDefaultResult.error === '不能删除默认方案', '默认方案不能删除')
  assert(deleteDefaultResult.schemes.length === schemes.length, '删除默认方案时列表不变')

  console.log('\n9. 测试删除激活方案的保护')
  const testActiveScheme = { ...copiedScheme, is_active: true, is_default: false }
  const deleteActiveResult = deleteScheme(
    [defaultScheme, renamedScheme, testActiveScheme],
    testActiveScheme.id
  )
  assert(deleteActiveResult.error === '不能删除当前激活的方案', '激活方案不能删除')
  assert(deleteActiveResult.schemes.length === 3, '删除激活方案时列表不变')

  console.log('\n10. 测试方案对比')
  const diff = compareSchemes(defaultScheme, renamedScheme)
  assert(diff.scheme_a_id === defaultScheme.id, '对比结果包含方案A ID')
  assert(diff.scheme_b_id === renamedScheme.id, '对比结果包含方案B ID')
  assert(diff.differences.length > 0, '不同方案之间存在差异')
  assert(diff.summary.includes('处差异'), '差异摘要格式正确')

  const tempMaxDiff = diff.differences.find(d => d.field === 'temp_max')
  assert(tempMaxDiff !== undefined, '检测到温度上限差异')
  assert(tempMaxDiff.value_a === defaultScheme.threshold.temp_max, '方案A的温度上限正确')
  assert(tempMaxDiff.value_b === renamedScheme.threshold.temp_max, '方案B的温度上限正确')

  const sameDiff = compareSchemes(defaultScheme, defaultScheme)
  assert(sameDiff.differences.length === 0, '相同方案之间没有差异')
  assert(sameDiff.summary === '两个方案完全相同', '相同方案的摘要正确')

  console.log('\n11. 测试字段标签和单位')
  assert(getFieldLabel('temp_min') === '温度下限', '温度下限标签正确')
  assert(getFieldLabel('merge_window_minutes') === '事件合并窗口', '合并窗口标签正确')
  assert(getFieldUnit('temp_max') === '°C', '温度单位正确')
  assert(getFieldUnit('offline_duration_min') === '分钟', '时长单位正确')

  console.log('\n12. 测试切换方案')
  let testSchemes = [
    { ...defaultScheme, is_active: true },
    { ...renamedScheme, is_active: false },
  ]
  const switchResult = switchScheme(testSchemes, renamedScheme.id)
  assert(switchResult.error === undefined, '切换方案没有错误')
  assert(switchResult.schemes.find(s => s.id === renamedScheme.id)?.is_active === true, '新方案已激活')
  assert(switchResult.schemes.find(s => s.id === defaultScheme.id)?.is_active === false, '旧方案已取消激活')
  assert(switchResult.auditLog.action_type === 'scheme_switch', '切换审计日志类型正确')
  assert(switchResult.auditLog.old_scheme_id === defaultScheme.id, '审计日志记录旧方案')
  assert(switchResult.auditLog.new_scheme_id === renamedScheme.id, '审计日志记录新方案')

  console.log('\n13. 测试回算预览计算')
  const { preview, auditLog: recalcAuditLog } = calculateRecalcPreview(
    defaultScheme,
    renamedScheme,
    sampleData.sensorRecords,
    sampleData.manualNotes,
    sampleData.alarmRecords,
    [],
    []
  )
  assert(preview.id.startsWith('recalc_'), '回算预览ID格式正确')
  assert(preview.old_scheme_id === defaultScheme.id, '预览包含旧方案ID')
  assert(preview.new_scheme_id === renamedScheme.id, '预览包含新方案ID')
  assert(preview.old_event_count > 0, '旧方案有事件')
  assert(typeof preview.new_event_count === 'number', '新方案事件数存在')
  assert(preview.changes.length > 0, '存在事件变化')
  assert(recalcAuditLog.action_type === 'recalc_start', '回算审计日志类型正确')

  const changeTypes = [...new Set(preview.changes.map(c => c.change_type))]
  assert(changeTypes.length > 0, '包含多种变化类型')

  console.log('\n14. 测试变化类型统计')
  const newCount = preview.changes.filter(c => c.change_type === 'new').length
  const closedCount = preview.changes.filter(c => c.change_type === 'closed').length
  assert(preview.new_events === newCount, '新增事件计数正确')
  assert(preview.closed_events === closedCount, '关闭事件计数正确')

  console.log('\n15. 测试状态冲突检测')
  const testOldEvents: Event[] = [
    {
      id: 'ev_001',
      device_id: 'DEV-001',
      start_time: '2024-01-15T08:00:00.000Z',
      end_time: '2024-01-15T09:00:00.000Z',
      status: 'confirmed',
      handler: '张工',
      remark: '已人工确认',
      close_time: null,
      created_at: '2024-01-15T08:00:00.000Z',
      updated_at: '2024-01-15T08:00:00.000Z',
      evidence_count: 5,
    },
    {
      id: 'ev_002',
      device_id: 'DEV-002',
      start_time: '2024-01-15T10:00:00.000Z',
      end_time: '2024-01-15T11:00:00.000Z',
      status: 'false_alarm',
      handler: '李工',
      remark: '误报',
      close_time: null,
      created_at: '2024-01-15T10:00:00.000Z',
      updated_at: '2024-01-15T10:00:00.000Z',
      evidence_count: 3,
    },
    {
      id: 'ev_003',
      device_id: 'DEV-003',
      start_time: '2024-01-15T12:00:00.000Z',
      end_time: '2024-01-15T13:00:00.000Z',
      status: 'pending',
      handler: '',
      remark: '',
      close_time: null,
      created_at: '2024-01-15T12:00:00.000Z',
      updated_at: '2024-01-15T12:00:00.000Z',
      evidence_count: 2,
    },
  ]

  const testPreview: RecalcPreview = {
    id: 'recalc_test',
    old_scheme_id: defaultScheme.id,
    old_scheme_name: defaultScheme.name,
    new_scheme_id: renamedScheme.id,
    new_scheme_name: renamedScheme.name,
    created_at: new Date().toISOString(),
    old_event_count: 3,
    new_event_count: 2,
    changes: [
      {
        event_id: 'ev_001',
        change_type: 'modified',
        device_id: 'DEV-001',
        old_start_time: testOldEvents[0].start_time,
        old_end_time: testOldEvents[0].end_time,
        new_start_time: '2024-01-15T08:30:00.000Z',
        new_end_time: '2024-01-15T09:30:00.000Z',
        has_manual_state: true,
        description: '事件时间范围变更',
      },
      {
        event_id: 'ev_002',
        change_type: 'closed',
        device_id: 'DEV-002',
        old_start_time: testOldEvents[1].start_time,
        old_end_time: testOldEvents[1].end_time,
        old_status: 'false_alarm',
        old_evidence_count: 3,
        has_manual_state: true,
        description: '事件不再满足条件',
      },
      {
        event_id: 'ev_003',
        change_type: 'unchanged',
        device_id: 'DEV-003',
        has_manual_state: false,
        description: '无变化',
      },
      {
        new_event_id: 'ev_new_001',
        change_type: 'new',
        device_id: 'DEV-004',
        new_start_time: '2024-01-15T14:00:00.000Z',
        new_end_time: '2024-01-15T15:00:00.000Z',
        has_manual_state: false,
        description: '新增事件',
      },
    ],
    new_events: 1,
    merged_events: 0,
    split_events: 0,
    closed_events: 1,
    unchanged_events: 1,
    modified_events: 1,
    affected_batch_ids: [],
    is_applied: false,
    applied_at: undefined,
    applied_by: undefined,
  }

  const conflicts = detectStateConflicts(testPreview, testOldEvents)
  assert(conflicts.length === 1, `检测到1个状态冲突（实际${conflicts.length}个）`)
  assert(conflicts[0].event_id === 'ev_002', '冲突来自ev_002（false_alarm变closed）')
  assert(conflicts[0].old_status === 'false_alarm', '冲突的旧状态是误报')
  assert(conflicts[0].new_status === 'closed', '关闭事件的新状态是closed')
  assert(conflicts[0].handler === '李工', '冲突包含处理人信息')
  assert(conflicts[0].description.length > 0, '冲突有描述信息')

  console.log('\n16. 测试冲突选择应用')
  if (conflicts.length > 0) {
    const { choice: keepChoice, auditLog: keepAuditLog } = applyConflictChoice(
      conflicts[0],
      'keep_manual',
      undefined,
      'testUser'
    )
    assert(keepChoice.conflict_id === conflicts[0].id, '选择记录关联正确冲突')
    assert(keepChoice.choice === 'keep_manual', '选择类型正确')
    assert(keepAuditLog.action_type === 'conflict_resolve', '冲突解决审计日志类型正确')
    assert(keepAuditLog.metadata?.choice === 'keep_manual', '审计日志记录选择类型')

    const { choice: recalcChoice } = applyConflictChoice(conflicts[0], 'recalculate')
    assert(recalcChoice.choice === 'recalculate', '重算选择正确')

    const { choice: skipChoice } = applyConflictChoice(conflicts[0], 'skip_batch', 'batch_001')
    assert(skipChoice.choice === 'skip_batch', '跳过批次选择正确')
    assert(skipChoice.batch_id === 'batch_001', '跳过批次记录正确')
  }

  console.log('\n17. 测试回算预览应用')
  const mockChoices = conflicts.slice(0, 2).map(c => ({
    conflict_id: c.id,
    event_id: c.event_id,
    choice: 'keep_manual' as StateConflictChoiceType,
    created_at: new Date().toISOString(),
  }))

  const applyResult = applyRecalcPreview(
    preview,
    mockChoices,
    testOldEvents,
    sampleData.sensorRecords,
    sampleData.manualNotes,
    sampleData.alarmRecords,
    renamedScheme
  )
  assert(Array.isArray(applyResult.events), '应用后返回事件数组')
  assert(applyResult.events.length > 0, '应用后有事件')
  assert(applyResult.threshold.temp_max === renamedScheme.threshold.temp_max, '应用后使用新阈值')
  assert(applyResult.appliedPreview.is_applied === true, '预览标记为已应用')
  assert(applyResult.auditLog.action_type === 'recalc_apply', '应用审计日志类型正确')

  console.log('\n18. 测试取消回算预览')
  const cancelLog = cancelRecalcPreview('preview_test_001', 'testUser')
  assert(cancelLog.action_type === 'recalc_cancel', '取消审计日志类型正确')
  assert(cancelLog.metadata?.preview_id === 'preview_test_001', '取消日志关联正确预览')
  assert(cancelLog.metadata?.cancelled === true, '取消标记正确')

  console.log('\n19. 测试带选择的事件状态迁移')
  const oldEvents: Event[] = [
    {
      id: 'ev_manual_1',
      device_id: 'DEV-001',
      start_time: '2024-01-15T08:00:00.000Z',
      end_time: '2024-01-15T09:00:00.000Z',
      status: 'confirmed',
      handler: '张工',
      remark: '已人工确认',
      close_time: null,
      created_at: '2024-01-15T08:00:00.000Z',
      updated_at: '2024-01-15T08:00:00.000Z',
      evidence_count: 5,
    },
  ]

  const newEvents: Event[] = [
    {
      id: 'ev_new_1',
      device_id: 'DEV-001',
      start_time: '2024-01-15T08:05:00.000Z',
      end_time: '2024-01-15T09:05:00.000Z',
      status: 'pending',
      handler: '',
      remark: '',
      close_time: null,
      created_at: '2024-01-15T08:00:00.000Z',
      updated_at: '2024-01-15T08:00:00.000Z',
      evidence_count: 4,
    },
  ]

  const keepChoices = [{
    conflict_id: 'conflict_1',
    event_id: 'ev_manual_1',
    choice: 'keep_manual' as StateConflictChoiceType,
    created_at: new Date().toISOString(),
  }]

  const migrated = migrateEventStatesWithChoices(oldEvents, newEvents, keepChoices)
  assert(migrated.length === 1, '迁移后事件数量正确')
  assert(migrated[0].id === 'ev_manual_1', '保留人工状态的事件ID不变')
  assert(migrated[0].status === 'confirmed', '保留人工确认状态')
  assert(migrated[0].handler === '张工', '保留处理人信息')
  assert(migrated[0].remark === '已人工确认', '保留备注信息')

  console.log('\n20. 测试按新规则重算的状态迁移')
  const recalcChoices = [{
    conflict_id: 'conflict_1',
    event_id: 'ev_manual_1',
    choice: 'recalculate' as StateConflictChoiceType,
    created_at: new Date().toISOString(),
  }]

  const recalcMigrated = migrateEventStatesWithChoices(oldEvents, newEvents, recalcChoices)
  assert(recalcMigrated.length === 1, '重算后事件数量正确')
  assert(recalcMigrated[0].id === 'ev_new_1', '重算后使用新事件ID')
  assert(recalcMigrated[0].status === 'pending', '重算后状态回到待处理')

  console.log('\n21. 测试导入批次关联')
  const importBatches: ImportBatch[] = [
    {
      id: sampleData.batchId,
      file_type: 'sensor',
      file_name: 'sensor_data.csv',
      import_time: new Date().toISOString(),
      record_count: sampleData.sensorRecords.length,
      error_count: 0,
      errors: [],
      file_hash: 'test_hash_123',
    },
  ]

  const previewWithBatches = calculateRecalcPreview(
    defaultScheme,
    renamedScheme,
    sampleData.sensorRecords,
    sampleData.manualNotes,
    sampleData.alarmRecords,
    [],
    importBatches
  )
  assert(previewWithBatches.preview.affected_batch_ids.length > 0, '预览关联了受影响的批次')
  assert(previewWithBatches.preview.affected_batch_ids.includes(sampleData.batchId), '包含正确的批次ID')

  console.log('\n22. 测试审计日志的完整性')
  const allAuditLogs = [
    createAuditLog,
    copyAuditLog,
    updateAuditLog,
    renameAuditLog,
    deleteResult.auditLog,
    switchResult.auditLog,
    recalcAuditLog,
    applyResult.auditLog,
  ]
  for (const log of allAuditLogs) {
    assert(log.id.startsWith('audit_'), `审计日志 ${log.action_type} 有正确的ID格式`)
    assert(typeof log.created_at === 'string', `审计日志 ${log.action_type} 有创建时间`)
    assert(typeof log.metadata === 'object', `审计日志 ${log.action_type} 有元数据`)
  }

  console.log('\n23. 测试时间变化检测')
  const modifiedChanges = preview.changes.filter(c => c.change_type === 'modified')
  if (modifiedChanges.length > 0) {
    assert(modifiedChanges[0].old_start_time !== undefined, '修改事件包含旧开始时间')
    assert(modifiedChanges[0].new_start_time !== undefined, '修改事件包含新开始时间')
    assert(modifiedChanges[0].description.length > 0, '修改事件有描述')
  }

  console.log('\n24. 测试合并事件变化')
  const mergedChanges = preview.changes.filter(c => c.change_type === 'merged')
  if (mergedChanges.length > 0) {
    assert(Array.isArray(mergedChanges[0].merged_from), '合并事件包含来源列表')
    assert(mergedChanges[0].merged_from!.length >= 2, '合并至少涉及2个事件')
  }

  console.log('\n25. 测试拆分事件变化')
  const splitChanges = preview.changes.filter(c => c.change_type === 'split')
  if (splitChanges.length > 0) {
    assert(Array.isArray(splitChanges[0].split_into), '拆分事件包含目标列表')
    assert(splitChanges[0].split_into!.length >= 2, '拆分至少产生2个事件')
  }

  console.log('\n=== 规则方案测试完成 ===')
  console.log(`总计: ${testCount} 个测试, 通过: ${passCount} 个`)
}

runTests().catch(err => {
  console.error('测试运行出错:', err)
  process.exit(1)
})
