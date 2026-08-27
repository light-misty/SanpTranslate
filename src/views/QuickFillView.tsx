import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getConfig, saveQuickFills, type QuickFillEntry } from '@/utils/tauri'
import { logger } from '@/utils/logger'
import ShortcutInput from '@/components/ShortcutInput'
import './QuickFillView.css'

const TAG = 'QuickFillView'

/** 快捷填充配置窗口视图：配置快捷键和填充文本的映射 */
export default function QuickFillView() {
  const { t } = useTranslation()

  const [entries, setEntries] = useState<QuickFillEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  /** 加载配置 */
  async function loadConfig() {
    try {
      const config = await getConfig()
      setEntries(config.quick_fills || [])
      logger.info(TAG, `加载快捷填充配置，共 ${config.quick_fills?.length || 0} 条`)
    } catch (err) {
      logger.error(TAG, `加载配置失败: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  /** 保存配置 */
  async function saveEntries() {
    setSaving(true)
    setSaveSuccess(false)
    try {
      await saveQuickFills(entries)
      setSaveSuccess(true)
      logger.info(TAG, '快捷填充配置已保存')
      // 2 秒后清除成功提示
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      logger.error(TAG, `保存配置失败: ${err}`)
    } finally {
      setSaving(false)
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
        <h2 className="quickfill-title">{t('quickFill.title')}</h2>
        <p className="quickfill-description">{t('quickFill.description')}</p>
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
                    onChange={(e) => updateEntry(index, 'text', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="quickfill-actions">
        <button className="quickfill-add-btn" onClick={addEntry}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('quickFill.addEntry')}
        </button>
        <button
          className={`quickfill-save-btn${saveSuccess ? ' save-success' : ''}`}
          onClick={saveEntries}
          disabled={saving}
        >
          {saving ? t('common.loading') : saveSuccess ? t('quickFill.saved') : t('quickFill.save')}
        </button>
      </div>
    </div>
  )
}
