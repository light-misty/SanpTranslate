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
