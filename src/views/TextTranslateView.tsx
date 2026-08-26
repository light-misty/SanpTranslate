import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getConfig, translateText, writeClipboardText } from '@/utils/tauri'
import { logger } from '@/utils/logger'
import './TextTranslateView.css'

const TAG = 'TextTranslateView'

type TranslateStatus = 'idle' | 'translating' | 'done' | 'error'

interface LanguageOption {
  label: string
  value: string
}

/** 文本翻译窗口视图：输入、翻译、复制译文 */
export default function TextTranslateView() {
  const { t } = useTranslation()

  const [inputText, setInputText] = useState('')
  const [translateStatus, setTranslateStatus] = useState<TranslateStatus>('idle')
  const [translatedText, setTranslatedText] = useState('')
  const [hasTranslation, setHasTranslation] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  // 目标语言：默认从配置读取，用户可在此窗口临时覆盖，不回写设置
  const [targetLanguage, setTargetLanguage] = useState('zh-CN')
  const [copyFeedback, setCopyFeedback] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 目标语言选项列表（与设置页面一致，使用 i18n 标签）
  const languageOptions: LanguageOption[] = [
    { label: t('settings.langZhCN'), value: 'zh-CN' },
    { label: t('settings.langZhTW'), value: 'zh-TW' },
    { label: t('settings.langEn'), value: 'en' },
    { label: t('settings.langJa'), value: 'ja' },
    { label: t('settings.langKo'), value: 'ko' },
    { label: t('settings.langFr'), value: 'fr' },
    { label: t('settings.langDe'), value: 'de' },
    { label: t('settings.langEs'), value: 'es' },
    { label: t('settings.langRu'), value: 'ru' },
  ]

  /** 翻译核心逻辑 */
  async function doTranslate(forceRetranslate: boolean) {
    if (!inputText.trim()) return

    setTranslateStatus('translating')
    setErrorMessage('')

    try {
      logger.info(TAG, `开始文本翻译，目标语言=${targetLanguage}，强制重新翻译=${forceRetranslate}`)

      const result = await translateText(inputText.trim(), targetLanguage, forceRetranslate)

      if (!result.translated_text) {
        logger.info(TAG, '翻译结果为空')
        setTranslateStatus('idle')
        return
      }

      setTranslatedText(result.translated_text)
      setHasTranslation(true)
      setTranslateStatus('done')
      setFromCache(result.from_cache)

      logger.info(TAG, `文本翻译完成，from_cache=${result.from_cache}`)
    } catch (err) {
      setErrorMessage(String(err))
      setTranslateStatus('error')
      logger.error(TAG, `文本翻译失败: ${err}`, err)
    }
  }

  /** 翻译/重新翻译按钮点击 */
  function onTranslateClick() {
    if (translateStatus === 'done' || translateStatus === 'error') {
      doTranslate(true)
    } else {
      doTranslate(false)
    }
  }

  /** Ctrl+Enter 快捷翻译 */
  function onTranslate() {
    if (translateStatus === 'translating') return
    if (translateStatus === 'done' || translateStatus === 'error') {
      doTranslate(true)
    } else {
      doTranslate(false)
    }
  }

  /** 输入变化时重置状态 */
  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value)
    if (translateStatus === 'done' || translateStatus === 'error') {
      setTranslateStatus('idle')
      setHasTranslation(false)
      setTranslatedText('')
      setErrorMessage('')
      setFromCache(false)
    }
  }

  /** Ctrl+Enter 键盘处理（React 合成事件，无需原生修饰符） */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      onTranslate()
    }
  }

  /** 复制译文到剪贴板 */
  async function onCopyTranslation() {
    if (!translatedText) return
    try {
      await writeClipboardText(translatedText)
      logger.info(TAG, '译文已复制到剪贴板')
      // 显示复制成功反馈
      setCopyFeedback(true)
      if (copyFeedbackTimer.current) {
        clearTimeout(copyFeedbackTimer.current)
      }
      copyFeedbackTimer.current = setTimeout(() => {
        setCopyFeedback(false)
        copyFeedbackTimer.current = null
      }, 1500)
    } catch (err) {
      logger.error(TAG, `复制译文失败: ${err}`, err)
    }
  }

  /** 关闭窗口 */
  async function onClose() {
    try {
      await getCurrentWindow().destroy()
    } catch (err) {
      logger.error(TAG, `关闭窗口失败: ${err}`, err)
    }
  }

  /** Esc 键关闭窗口的处理函数 */
  async function handleEscKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      try {
        await getCurrentWindow().destroy()
      } catch (err) {
        logger.error(TAG, `Esc关闭失败: ${err}`, err)
      }
    }
  }

  useEffect(() => {
    logger.info(TAG, 'TextTranslateView onMounted')
    // 从配置读取默认目标语言
    ;(async () => {
      try {
        const config = await getConfig()
        setTargetLanguage(config.target_language)
        logger.info(TAG, `从配置读取目标语言: ${config.target_language}`)
      } catch (err) {
        logger.error(TAG, `读取配置失败，使用默认目标语言: ${err}`)
      }
    })()
    // 自动聚焦输入框（DOM 就绪后兜底聚焦）
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    // Esc 键关闭窗口
    document.addEventListener('keydown', handleEscKey)
    return () => {
      // 清理 Esc 键监听器与复制反馈计时器
      document.removeEventListener('keydown', handleEscKey)
      if (copyFeedbackTimer.current) {
        clearTimeout(copyFeedbackTimer.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="text-translate-container">
      {/* 可拖拽的标题栏 */}
      <div className="title-bar" data-tauri-drag-region onDoubleClick={onClose}>
        <span className="title-text">{t('textTranslate.title')}</span>
        <button className="close-btn" onClick={onClose} title={t('common.close')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 输入区域 */}
      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            autoFocus
            value={inputText}
            className="text-input"
            placeholder={t('textTranslate.inputPlaceholder')}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
          />
          <div className="input-footer">
            <div className="shortcut-hint">{t('textTranslate.shortcutHint')}</div>
            <div className="target-language-area">
              <span className="target-language-label">{t('textTranslate.targetLanguage')}</span>
              <select
                value={targetLanguage}
                className="target-language-select"
                onChange={(e) => setTargetLanguage(e.target.value)}
              >
                {languageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <button
          className={`translate-btn${translateStatus === 'translating' ? ' translate-btn-translating' : ''}`}
          disabled={translateStatus === 'translating' || !inputText.trim()}
          onClick={onTranslateClick}
        >
          {translateStatus === 'translating'
            ? t('textTranslate.translating')
            : translateStatus === 'done' || translateStatus === 'error'
              ? t('textTranslate.retranslate')
              : t('textTranslate.translate')}
        </button>
      </div>

      {/* 译文面板 */}
      {hasTranslation && (
        <div className="translation-panel">
          {/* 面板头部 */}
          <div className="panel-header" onDoubleClick={onClose}>
            {fromCache && <span className="cache-hint">{t('controlBar.cacheHit')}</span>}
            <button
              className={`copy-btn${copyFeedback ? ' copy-btn-copied' : ''}`}
              onClick={onCopyTranslation}
              title={t('textTranslate.copyTranslation')}
            >
              {!copyFeedback ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          </div>
          {/* 译文内容 */}
          <div className="translation-content">{translatedText}</div>
        </div>
      )}

      {/* 错误提示 */}
      {errorMessage && <div className="error-message">{errorMessage}</div>}
    </div>
  )
}