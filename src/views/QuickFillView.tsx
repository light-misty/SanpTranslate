import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { getConfig, saveQuickFills, type QuickFillEntry, type ShortcutConfig } from '@/utils/tauri'
import { logger } from '@/utils/logger'
import ShortcutInput from '@/components/ShortcutInput'
import './QuickFillView.css'

const TAG = 'QuickFillView'

/** 填充文本输入框的最大高度（px），超出后内部滚动 */
const TEXTAREA_MAX_HEIGHT = 200

/** 内置快捷填充模板定义 */
export interface QuickFillTemplate {
  /** 模板唯一标识 */
  id: string
  /** 模板标题 */
  title: string
  /** 模板文本内容 */
  text: string
}

/** 系统内置模板列表（当前仅一个：创建工作树提示词），启用后生成可配置条目 */
export const QUICK_FILL_TEMPLATES: QuickFillTemplate[] = [
  {
    id: 'git-worktree-prompt',
    title: '创建工作树提示词',
    text: [
      '请为当前 Git 仓库创建一个新的工作树（Worktree）：',
      '- 所有文件修改、git 操作都必须在切换后的新目录内完成。',
      '- 本任务允许并要求你进行提交推送，进行分阶段提交，每完成一个功能提交一次，再继续执行接下来的任务，每次提交都要推送。禁止一次性提交全部代码，禁止一次性开发完所有代码后分阶段提交。',
      '- 分支名和路径名请根据下面的任务描述生成。',
      '- 命名规则：',
      '  * 全部使用小写英文单词，多个单词之间用连字符（-）连接。',
      '  * 前缀根据任务类型决定：新功能使用 `feat/`，修复问题使用 `fix/` 等。',
      '  * 路径位于仓库父级目录下，格式为 `../<当前仓库名>-<分支名中的后缀部分>`。',
      '  * 如果生成的分支名已存在，则自动添加数字后缀（如 `-2`）。',
      '',
      '创建完成后，切换至该工作树目录，然后执行以下任务：',
      '',
    ].join('\n'),
  },
]

/** 根据内容自适应调整文本输入框高度（受最大高度限制） */
function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`
  el.style.overflowY = 'auto'
}

/** 快捷填充配置窗口视图：配置快捷键和填充文本的映射 */
export default function QuickFillView() {
  const { t } = useTranslation()

  const [entries, setEntries] = useState<QuickFillEntry[]>([])
  const [loading, setLoading] = useState(true)
  // 主快捷键配置，用于保存时冲突校验
  const [mainShortcuts, setMainShortcuts] = useState<ShortcutConfig>()
  // 自动保存防抖定时器
  const saveTimerRef = useRef<number>()
  // 标记"刚加载完成的那次 entries 变化"不触发自动保存
  const skipNextAutoSaveRef = useRef(false)

  /** 加载配置 */
  async function loadConfig() {
    try {
      const config = await getConfig()
      skipNextAutoSaveRef.current = true
      setEntries(config.quick_fills || [])
      setMainShortcuts(config.shortcuts)
      logger.info(TAG, `加载快捷填充配置，共 ${config.quick_fills?.length || 0} 条`)
    } catch (err) {
      logger.error(TAG, `加载配置失败: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  // 条目内容变化后重新计算所有输入框高度（文本加载/增删改时生效）
  useEffect(() => {
    document.querySelectorAll('.quickfill-textarea').forEach((el) => {
      autoResizeTextarea(el as HTMLTextAreaElement)
    })
  }, [entries])

  // 条目变化后防抖自动保存（500ms），不再需要手动点击保存按钮
  useEffect(() => {
    if (skipNextAutoSaveRef.current) {
      // 跳过首次加载完成后的那次触发
      skipNextAutoSaveRef.current = false
      return
    }
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = window.setTimeout(() => {
      void autoSave(entries)
    }, 500)
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [entries])

  /**
   * 校验快捷键配置：条目之间重复、与系统主快捷键冲突。
   * 无冲突返回 null，否则返回可展示的提示文案。
   */
  function validateShortcuts(list: QuickFillEntry[]): string | null {
    const seen = new Map<string, number>() // 规范化快捷键 -> 条目序号（0 起）
    const mainList = mainShortcuts
      ? [mainShortcuts.capture, mainShortcuts.pin_clipboard, mainShortcuts.text_translate]
      : []
    for (let i = 0; i < list.length; i++) {
      const shortcut = (list[i].shortcut || '').trim()
      if (!shortcut) continue
      const norm = shortcut.toLowerCase()
      const hasMainConflict = mainList.some((key) => key && key.toLowerCase() === norm)
      if (hasMainConflict) {
        return t('quickFill.conflictWithMain', { shortcut })
      }
      const firstIndex = seen.get(norm)
      if (firstIndex !== undefined) {
        return t('quickFill.duplicateShortcut', { first: firstIndex + 1, second: i + 1, shortcut })
      }
      seen.set(norm, i)
    }
    return null
  }

  /** 自动保存：校验冲突后调用后端保存，失败时提示 */
  async function autoSave(list: QuickFillEntry[]) {
    // 保存前校验快捷键冲突，冲突时中止并提示
    const conflict = validateShortcuts(list)
    if (conflict) {
      message.warning(conflict)
      logger.warn(TAG, `自动保存被拦截: ${conflict}`)
      return
    }

    try {
      await saveQuickFills(list)
      logger.info(TAG, `快捷填充配置已自动保存，共 ${list.length} 条`)
    } catch (err) {
      const errorMsg = String(err)
      logger.error(TAG, `自动保存失败: ${errorMsg}`)
      message.error(t('quickFill.saveFailed', { error: errorMsg }))
    }
  }

  /** 添加新条目 */
  function addEntry() {
    setEntries([...entries, { shortcut: '', text: '' }])
  }

  /** 删除条目 */
  function removeEntry(index: number) {
    setEntries(entries.filter((_, i) => i !== index))
  }

  /** 更新条目 */
  function updateEntry(index: number, field: keyof QuickFillEntry, value: string) {
    const newEntries = [...entries]
    newEntries[index] = { ...newEntries[index], [field]: value }
    setEntries(newEntries)
  }

  /** 模板是否已启用：以是否存在文本一致的条目作为开关状态 */
  function isTemplateEnabled(template: QuickFillTemplate): boolean {
    return entries.some((entry) => entry.text === template.text)
  }

  /** 切换模板启用状态：启用时生成一条可配置条目，禁用时移除对应条目 */
  function toggleTemplate(template: QuickFillTemplate, enabled: boolean) {
    if (enabled) {
      if (isTemplateEnabled(template)) return
      setEntries([...entries, { shortcut: '', text: template.text }])
      logger.info(TAG, `已启用内置模板: ${template.title}`)
    } else {
      setEntries(entries.filter((entry) => entry.text !== template.text))
      logger.info(TAG, `已禁用内置模板: ${template.title}`)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  if (loading) {
    return (
      <div className="quickfill-container">
        <div className="quickfill-loading">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="quickfill-container">
      <div className="quickfill-header">
        <div className="quickfill-header-text">
          <h2 className="quickfill-title">{t('quickFill.title')}</h2>
          <p className="quickfill-description">{t('quickFill.description')}</p>
        </div>
        {/* 添加条目按钮放置在标题右侧，右对齐 */}
        <button className="quickfill-add-btn" onClick={addEntry}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('quickFill.addEntry')}
        </button>
      </div>

      {/* 内置模板区块：启用后生成可配置条目 */}
      <div className="quickfill-templates">
        <span className="quickfill-templates-label">{t('quickFill.templates')}</span>
        {QUICK_FILL_TEMPLATES.map((template) => {
          const enabled = isTemplateEnabled(template)
          return (
            <div key={template.id} className="quickfill-template-item">
              <span className="quickfill-template-title">{template.title}</span>
              <label className="quickfill-template-switch">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => toggleTemplate(template, e.target.checked)}
                />
                <span className={enabled ? 'quickfill-template-status enabled' : 'quickfill-template-status'}>
                  {enabled ? t('quickFill.templateEnabled') : t('quickFill.templateDisabled')}
                </span>
              </label>
            </div>
          )
        })}
      </div>

      <div className="quickfill-list">
        {entries.length === 0 ? (
          <div className="quickfill-empty">{t('quickFill.empty')}</div>
        ) : (
          entries.map((entry, index) => (
            <div key={index} className="quickfill-item">
              <div className="quickfill-item-header">
                <span className="quickfill-item-index">#{index + 1}</span>
                <button
                  className="quickfill-remove-btn"
                  onClick={() => removeEntry(index)}
                  title={t('common.delete')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="quickfill-item-fields">
                <div className="quickfill-field">
                  <label className="quickfill-label">{t('quickFill.shortcut')}</label>
                  <ShortcutInput
                    value={entry.shortcut}
                    placeholder={t('quickFill.shortcutPlaceholder')}
                    onChange={(value) => updateEntry(index, 'shortcut', value)}
                  />
                </div>
                <div className="quickfill-field">
                  <label className="quickfill-label">{t('quickFill.text')}</label>
                  <textarea
                    className="quickfill-textarea"
                    value={entry.text}
                    placeholder={t('quickFill.textPlaceholder')}
                    onChange={(e) => {
                      updateEntry(index, 'text', e.target.value)
                      // 输入时同步自适应高度
                      autoResizeTextarea(e.target)
                    }}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
