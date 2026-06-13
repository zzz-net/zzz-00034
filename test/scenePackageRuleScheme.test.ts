import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  exportScenePackage,
  parseScenePackage,
  replayScenePackage,
} from '../src/utils/scenePackage'
import { createDefaultScheme, createScheme } from '../src/utils/ruleScheme'
import {
  parseSensorCSV,
  parseNoteCSV,
  generateId,
} from '../src/utils/csvParser'
import { parseAlarmJSON } from '../src/utils/jsonParser'
import { DEFAULT_THRESHOLD } from '../src/utils/validator'
import {
  ScenePackage,
  RuleScheme,
  ThresholdConfig,
  RecalcPreview,
  StateConflictChoice,
  AuditLogEntry,
  ImportBatch,
  Event,
  SensorRecord,
  ManualNote,
  AlarmRecord,
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

function createTestRuleSchemes(): {
  schemes: RuleScheme[]
  activeSchemeId: string
  recalcPreviews: RecalcPreview[]
  conflictChoices: StateConflictChoice[]
  auditLogs: AuditLogEntry[]
} {
  const defaultScheme = createDefaultScheme()
  const scheme2Result = createScheme(
    '严格方案',
    {
      temp_min: 10,
      temp_max: 35,
      voltage_min: 215,
      voltage_max: 235,
      offline_duration_min: 5,
      merge_window_minutes: 10,
    },
    { description: '严格的异常检测阈值' }
  )
  const scheme3Result = createScheme(
    '宽松方案',
    {
      temp_min: -10,
      temp_max: 60,
      voltage_min: 200,
      voltage_max: 250,
      offline_duration_min: 30,
      merge_window_minutes: 60,
    },
    { description: '宽松的异常检测阈值' }
  )

  const now = new Date().toISOString()
  const recalcPreviews: RecalcPreview[] = [
    {
      id: 'recalc_test_001',
      old_scheme_id: defaultScheme.id,
      old_scheme_name: defaultScheme.name,
      new_scheme_id: scheme2Result.scheme.id,
      new_scheme_name: scheme2Result.scheme.name,
      created_at: now,
      old_event_count: 10,
      new_event_count: 15,
      changes: [],
      new_events: 5,
      merged_events: 0,
      split_events: 0,
      closed_events: 0,
      unchanged_events: 10,
      modified_events: 0,
      affected_batch_ids: ['batch_001'],
      is_applied: false,
    },
  ]

  const conflictChoices: StateConflictChoice[] = [
    {
      conflict_id: 'conflict_001',
      event_id: 'ev_001',
      choice: 'keep_manual',
      created_at: now,
    },
  ]

  const auditLogs: AuditLogEntry[] = [
    defaultScheme,
    scheme2Result,
    scheme3Result,
  ].map((s, i) => {
    const auditLog = 'auditLog' in s ? s.auditLog : null
    if (auditLog) return auditLog
    const scheme = s
    return {
      id: `audit_${i}`,
      action_type: 'scheme_create' as const,
      scheme_id: scheme.id,
      scheme_name: scheme.name,
      metadata: { test: true },
      created_at: now,
    }
  })

  return {
    schemes: [defaultScheme, scheme2Result.scheme, scheme3Result.scheme],
    activeSchemeId: defaultScheme.id,
    recalcPreviews,
    conflictChoices,
    auditLogs,
  }
}

async function runTests() {
  console.log('=== 开始场景包导出导入测试 ===\n')

  const sampleData = loadSampleData()
  const ruleData = createTestRuleSchemes()

  const importBatches: ImportBatch[] = [
    {
      id: sampleData.batchId,
      file_type: 'sensor',
      file_name: 'sensor_data.csv',
      import_time: new Date().toISOString(),
      record_count: sampleData.sensorRecords.length,
      error_count: 0,
      errors: [],
      file_hash: 'test_hash_001',
    },
  ]

  const testEvents: Event[] = [
    {
      id: 'ev_001',
      device_id: 'DEV-001',
      start_time: '2024-01-15T08:00:00.000Z',
      end_time: '2024-01-15T09:00:00.000Z',
      status: 'confirmed',
      handler: '张工',
      remark: '测试事件',
      close_time: null,
      created_at: '2024-01-15T08:00:00.000Z',
      updated_at: '2024-01-15T08:00:00.000Z',
      evidence_count: 5,
    },
  ]

  console.log('\n1. 测试导出场景包包含规则方案')
  const pkg = exportScenePackage(
    DEFAULT_THRESHOLD,
    sampleData.sensorRecords,
    sampleData.manualNotes,
    sampleData.alarmRecords,
    importBatches,
    testEvents,
    [],
    [],
    [],
    'test_session',
    ruleData.schemes,
    ruleData.activeSchemeId,
    ruleData.recalcPreviews,
    ruleData.conflictChoices,
    ruleData.auditLogs
  )

  assert(pkg.version === 1, '场景包版本正确')
  assert(pkg.rule_schemes !== undefined, '场景包包含规则方案数组')
  assert(pkg.rule_schemes!.length === 3, '场景包包含3个规则方案')
  assert(pkg.active_rule_scheme !== undefined, '场景包包含激活方案')
  assert(pkg.active_rule_scheme!.id === ruleData.activeSchemeId, '激活方案ID正确')
  assert(pkg.recalc_previews !== undefined, '场景包包含回算预览')
  assert(pkg.recalc_previews!.length === 1, '场景包包含1个回算预览')
  assert(pkg.conflict_choices !== undefined, '场景包包含冲突选择')
  assert(pkg.conflict_choices!.length === 1, '场景包包含1个冲突选择')
  assert(pkg.audit_logs !== undefined, '场景包包含审计日志')
  assert(pkg.audit_logs!.length >= 3, '场景包包含至少3条审计日志')

  console.log('\n2. 测试元数据包含规则方案信息')
  assert(pkg._meta?.rule_scheme_count === 3, '元数据包含规则方案数量')
  assert(pkg._meta?.active_rule_scheme_id === ruleData.activeSchemeId, '元数据包含激活方案ID')

  console.log('\n3. 测试规则方案数据完整性')
  const exportedScheme = pkg.rule_schemes![1]
  assert(exportedScheme.name === '严格方案', '导出的方案名称正确')
  assert(exportedScheme.threshold.temp_max === 35, '导出的方案温度上限正确')
  assert(exportedScheme.threshold.merge_window_minutes === 10, '导出的方案合并窗口正确')
  assert(typeof exportedScheme.created_at === 'string', '导出的方案有创建时间')
  assert(typeof exportedScheme.version === 'number', '导出的方案有版本号')

  console.log('\n4. 测试场景包序列化和反序列化')
  const jsonStr = JSON.stringify(pkg, null, 2)
  assert(jsonStr.length > 0, '序列化成功')

  const parsed = JSON.parse(jsonStr) as ScenePackage
  assert(parsed.rule_schemes?.length === 3, '反序列化后规则方案数量正确')
  assert(parsed.active_rule_scheme?.id === ruleData.activeSchemeId, '反序列化后激活方案正确')

  console.log('\n5. 测试 parseScenePackage 解析')
  const parseResult = parseScenePackage(jsonStr)
  assert(parseResult.valid === true, '解析成功')
  assert(parseResult.data?.rule_schemes?.length === 3, '解析出的规则方案数量正确')
  assert(parseResult.data?.active_rule_scheme?.id === ruleData.activeSchemeId, '解析出的激活方案正确')
  assert(parseResult.data?.recalc_previews?.length === 1, '解析出的回算预览数量正确')
  assert(parseResult.data?.conflict_choices?.length === 1, '解析出的冲突选择数量正确')
  assert(parseResult.data?.audit_logs?.length >= 3, '解析出的审计日志数量正确')

  console.log('\n6. 测试不带规则方案的旧格式场景包兼容')
  const oldPkg: ScenePackage = {
    version: 1,
    exported_at: new Date().toISOString(),
    threshold: DEFAULT_THRESHOLD,
    sensor_records: sampleData.sensorRecords.slice(0, 10),
    manual_notes: sampleData.manualNotes.slice(0, 2),
    alarm_records: sampleData.alarmRecords.slice(0, 2),
    import_batches: importBatches,
    events: testEvents,
    evidences: [],
    import_sessions: [],
    undo_snapshots: [],
    _meta: {
      total_active_sessions: 1,
      total_undone_sessions: 0,
    },
  }

  const oldPkgStr = JSON.stringify(oldPkg)
  const oldParseResult = parseScenePackage(oldPkgStr)
  assert(oldParseResult.valid === true, '旧格式场景包解析成功')
  assert(Array.isArray(oldParseResult.data?.rule_schemes) && oldParseResult.data!.rule_schemes!.length === 0, '旧格式规则方案为空数组（兼容处理）')
  assert(oldParseResult.data?.active_rule_scheme === undefined, '旧格式没有激活方案（正常）')

  console.log('\n7. 测试 replayScenePackage 合并模式下的规则方案')
  const currentActiveScheme = { ...ruleData.schemes[0], is_active: true }
  const replayResult = replayScenePackage(
    parseResult.data!,
    'merge',
    [],
    [],
    [],
    [],
    [],
    [],
    [currentActiveScheme],
    [],
    [],
    []
  )

  assert(replayResult.result.success === true, '回放成功')
  assert(replayResult.ruleSchemes.length === 3, '回放后有3个规则方案')
  assert(replayResult.activeRuleSchemeId === currentActiveScheme.id, 'merge模式下保留当前激活方案')
  assert(replayResult.recalcPreviews.length === 1, '回放后有回算预览')
  assert(replayResult.conflictChoices.length === 1, '回放后有冲突选择')
  assert(replayResult.auditLogs.length >= 3, '回放后有审计日志')

  console.log('\n8. 测试回放时已有方案的去重合并')
  const existingSchemes = [
    { ...ruleData.schemes[0], name: '修改过的默认方案' },
  ]
  const replayWithExisting = replayScenePackage(
    parseResult.data!,
    'merge',
    [],
    [],
    [],
    [],
    [],
    [],
    existingSchemes,
    [],
    [],
    []
  )

  assert(replayWithExisting.result.success === true, '合并回放成功')
  assert(replayWithExisting.ruleSchemes.length >= 3, '合并后至少有3个方案')

  console.log('\n9. 测试覆盖模式下的规则方案')
  const overwriteResult = replayScenePackage(
    parseResult.data!,
    'overwrite',
    [],
    [],
    [],
    [],
    [],
    [],
    [createDefaultScheme()],
    [],
    [],
    []
  )

  assert(overwriteResult.result.success === true, '覆盖模式回放成功')
  assert(overwriteResult.ruleSchemes.length === 3, '覆盖模式下使用导入的3个方案')
  assert(overwriteResult.activeRuleSchemeId === ruleData.activeSchemeId, '覆盖模式下激活方案被更新')

  console.log('\n10. 测试非法场景包内容的处理')
  const invalidResult = parseScenePackage('not a json')
  assert(invalidResult.valid === false, '无效JSON被正确识别为无效')
  assert(invalidResult.errors.length > 0, '无效JSON返回错误信息')

  console.log('\n11. 测试场景包文件大小')
  const pkgSize = Buffer.byteLength(jsonStr, 'utf8')
  assert(pkgSize > 1000, '场景包有合理的大小')
  assert(pkgSize < 10 * 1024 * 1024, '场景包不超过10MB')

  console.log('\n12. 测试回算预览的完整性')
  const preview = pkg.recalc_previews![0]
  assert(preview.id.startsWith('recalc_'), '回算预览ID格式正确')
  assert(preview.old_scheme_name.length > 0, '旧方案名称存在')
  assert(preview.new_scheme_name.length > 0, '新方案名称存在')
  assert(typeof preview.old_event_count === 'number', '旧事件数量存在')
  assert(typeof preview.new_event_count === 'number', '新事件数量存在')
  assert(Array.isArray(preview.affected_batch_ids), '受影响批次ID数组存在')

  console.log('\n13. 测试审计日志的完整性')
  const log = pkg.audit_logs![0]
  assert(log.id.startsWith('audit_'), '审计日志ID格式正确')
  assert(typeof log.action_type === 'string', '审计日志动作类型存在')
  assert(typeof log.created_at === 'string', '审计日志创建时间存在')
  assert(typeof log.metadata === 'object', '审计日志元数据存在')

  console.log('\n14. 测试冲突选择的完整性')
  const choice = pkg.conflict_choices![0]
  assert(choice.conflict_id.length > 0, '冲突ID存在')
  assert(choice.event_id.length > 0, '事件ID存在')
  assert(['keep_manual', 'recalculate', 'skip_batch'].includes(choice.choice), '选择类型有效')

  console.log('\n15. 测试方案版本号递增')
  const versions = pkg.rule_schemes!.map(s => s.version)
  assert(versions.every(v => typeof v === 'number' && v > 0), '所有方案都有正整数版本号')

  console.log('\n16. 测试默认方案标记')
  const defaultCount = pkg.rule_schemes!.filter(s => s.is_default).length
  assert(defaultCount <= 1, '最多有1个默认方案')

  console.log('\n17. 测试激活方案标记')
  const activeCount = pkg.rule_schemes!.filter(s => s.is_active).length
  assert(activeCount <= 1, '最多有1个激活方案')

  console.log('\n18. 测试方案创建时间格式')
  const validDates = pkg.rule_schemes!.every(s => {
    const date = new Date(s.created_at)
    return !isNaN(date.getTime())
  })
  assert(validDates, '所有方案创建时间都是有效的ISO日期')

  console.log('\n19. 测试方案阈值字段完整性')
  const completeThresholds = pkg.rule_schemes!.every(s => {
    const t = s.threshold
    return typeof t.temp_min === 'number'
      && typeof t.temp_max === 'number'
      && typeof t.voltage_min === 'number'
      && typeof t.voltage_max === 'number'
      && typeof t.offline_duration_min === 'number'
      && typeof t.merge_window_minutes === 'number'
  })
  assert(completeThresholds, '所有方案都有完整的阈值配置')

  console.log('\n20. 测试场景包导出-导入-再导出的一致性')
  const reExportedPkg = exportScenePackage(
    parseResult.data!.threshold,
    parseResult.data!.sensor_records,
    parseResult.data!.manual_notes,
    parseResult.data!.alarm_records,
    parseResult.data!.import_batches,
    parseResult.data!.events,
    parseResult.data!.evidences,
    parseResult.data!.import_sessions,
    parseResult.data!.undo_snapshots,
    'test_session_2',
    parseResult.data!.rule_schemes || [],
    parseResult.data!.active_rule_scheme?.id || '',
    parseResult.data!.recalc_previews || [],
    parseResult.data!.conflict_choices || [],
    parseResult.data!.audit_logs || []
  )

  assert(reExportedPkg.rule_schemes?.length === pkg.rule_schemes?.length, '重导出后方案数量一致')
  assert(reExportedPkg.active_rule_scheme?.name === pkg.active_rule_scheme?.name, '重导出后激活方案名称一致')
  assert(reExportedPkg.recalc_previews?.length === pkg.recalc_previews?.length, '重导出后预览数量一致')

  console.log('\n=== 场景包测试完成 ===')
  console.log(`总计: ${testCount} 个测试, 通过: ${passCount} 个`)
}

runTests().catch(err => {
  console.error('测试运行出错:', err)
  process.exit(1)
})
