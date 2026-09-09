import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { getConfig, translateText, writeClipboardText } from '@/utils/tauri'
import { logger } from '@/utils/logger'
import './TextTranslateView.css'

const TAG = 'TextTranslateView'

/* ========== 常量 ========== */

/** 边缘检测宽度（像素） */
const EDGE_SIZE = 6
/** 拖拽移动激活阈值 */
const DRAG_THRESHOLD = 5
/** 文本框内容最大高度（像素） */
const MAX_INPUT_HEIGHT = 600
/** 文本框内容最小高度（像素） */
const MIN_INPUT_HEIGHT = 60

type Edge = 'top' | 'bottom' | 'left' | 'right' | 'tl' | 'tr' | 'bl' | 'br' | null
type TranslateStatus = 'idle' | 'translating' | 'done' | 'error'

interface LanguageOption {
  label: string
  value: string
}

/** 文本翻译窗口 */
export default function TextTranslateView() {
  const { t } = useTranslation()

  const [inputText, setInputText] = useState('')
  const [translateStatus, setTranslateStatus] = useState<TranslateStatus>('idle')
  const [translatedText, setTranslatedText] = useState('')
  const [hasTranslation, setHasTranslation] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('zh-CN')
  const [copyFeedback, setCopyFeedback] = useState(false)

  // Refs
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 拖拽移动起点 */
  const moveStart = useRef({ x: 0, y: 0, active: false })
  /** 缩放拖拽状态 */
  const resizeState = useRef({ active: false, edge: null as Edge, startX: 0, startY: 0, startW: 0, startH: 0 })

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

  /* ========== 翻译逻辑 ========== */

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

  function onTranslateClick() {
    if (translateStatus === 'done' || translateStatus === 'error') doTranslate(true)
    else doTranslate(false)
  }

  /** Ctrl+Enter 快捷翻译 */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      if (translateStatus === 'translating') return
      if (translateStatus === 'done' || translateStatus === 'error') doTranslate(true)
      else doTranslate(false)
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value)
    if (translateStatus === 'done' || translateStatus === 'error') {
      setTranslateStatus('idle')
      setHasTranslation(false)
      setTranslatedText('')
      setErrorMessage('')
      setFromCache(false)
    }
    autoGrowInput(e.target)
  }

  /** 输入框自动增长高度 */
  function autoGrowInput(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    const desired = Math.max(el.scrollHeight, MIN_INPUT_HEIGHT)
    el.style.height = `${Math.min(desired, MAX_INPUT_HEIGHT)}px`
  }

  async function onCopyTranslation() {
    if (!translatedText) return
    try {
      await writeClipboardText(translatedText)
      logger.info(TAG, '译文已复制到剪贴板')
      setCopyFeedback(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => {
        setCopyFeedback(false)
        copyTimer.current = null
      }, 1500)
    } catch (err) {
      logger.error(TAG, `复制译文失败: ${err}`, err)
    }
  }

  const onClose = useCallback(async () => {
    try {
      await getCurrentWindow().destroy()
    } catch (err) {
      logger.error(TAG, `关闭窗口失败: ${err}`, err)
    }
  }, [])

  /* ========== 双击关闭 ========== */

  function onDoubleClick() {
    void onClose()
  }

  /* ========== 窗口拖拽移动 ========== */

  function onInputMouseDown(e: React.MouseEvent<HTMLTextAreaElement>) {
    if (e.button !== 0) return
    moveStart.current = { x: e.clientX, y: e.clientY, active: false }
  }

  function onInputMouseMove(e: React.MouseEvent<HTMLTextAreaElement>) {
    if (e.buttons !== 1) return
    if (moveStart.current.active) return
    const dx = Math.abs(e.clientX - moveStart.current.x)
    const dy = Math.abs(e.clientY - moveStart.current.y)
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      moveStart.current.active = true
      getCurrentWindow().startDragging().catch((err) => {
        logger.error(TAG, `启动拖拽失败: ${err}`, err)
      })
    }
  }

  /* ========== 边缘缩放 ========== */

  /** 判断 (x, y) 位于 container 的哪条边 */
  function detectEdge(x: number, y: number, rect: DOMRect): Edge {
    const onLeft = x - rect.left < EDGE_SIZE
    const onRight = rect.right - x < EDGE_SIZE
    const onTop = y - rect.top < EDGE_SIZE
    const onBottom = rect.bottom - y < EDGE_SIZE
    if (onTop && onLeft) return 'tl'
    if (onTop && onRight) return 'tr'
    if (onBottom && onLeft) return 'bl'
    if (onBottom && onRight) return 'br'
    if (onTop) return 'top'
    if (onBottom) return 'bottom'
    if (onLeft) return 'left'
    if (onRight) return 'right'
    return null
  }

  function edgeCursor(e: Edge): string {
    switch (e) {
      case 'top': case 'bottom': return 'ns-resize'
      case 'left': case 'right': return 'ew-resize'
      case 'tl': case 'br': return 'nwse-resize'
      case 'tr': case 'bl': return 'nesw-resize'
      default: return 'default'
    }
  }

  function onContentMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (resizeState.current.active || moveStart.current.active) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const detected = detectEdge(e.clientX, e.clientY, rect)
    if (containerRef.current) {
      containerRef.current.style.cursor = edgeCursor(detected)
    }
  }

  function onContentMouseLeave() {
    if (!resizeState.current.active) {
      if (containerRef.current) containerRef.current.style.cursor = 'default'
    }
  }

  function onContentMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const detected = detectEdge(e.clientX, e.clientY, rect)
    if (!detected) return
    e.preventDefault()
    e.stopPropagation()
    resizeState.current = {
      active: true,
      edge: detected,
      startX: e.clientX,
      startY: e.clientY,
      startW: 0,
      startH: 0,
    }
    getCurrentWindow().innerSize().then((size) => {
      resizeState.current.startW = size.width
      resizeState.current.startH = size.height
    })
  }

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const st = resizeState.current
    if (!st.active || !st.edge) return
    const dx = e.clientX - st.startX
    const dy = e.clientY - st.startY
    let w = st.startW
    let h = st.startH
    if (st.edge.includes('right')) w = st.startW + dx
    if (st.edge.includes('left')) w = st.startW - dx
    if (st.edge.includes('bottom')) h = st.startH + dy
    if (st.edge.includes('top')) h = st.startH - dy
    w = Math.max(360, Math.min(1200, w))
    h = Math.max(120, Math.min(800, h))
    getCurrentWindow().setSize(new LogicalSize(Math.round(w), Math.round(h))).catch((err) => {
      logger.error(TAG, `设置窗口尺寸失败: ${err}`, err)
    })
  }, [])

  const handleGlobalMouseUp = useCallback(() => {
    if (resizeState.current.active) {
      resizeState.current.active = false
      resizeState.current.edge = null
      if (containerRef.current) containerRef.current.style.cursor = 'default'
    }
  }, [])

  function handleEscKey(e: KeyboardEvent) {
    if (e.key === 'Escape') void onClose()
  }

  /* ========== 生命周期 ========== */

  useEffect(() => {
    logger.info(TAG, 'TextTranslateView onMounted')
    ;(async () => {
      try {
        const config = await getConfig()
        setTargetLanguage(config.target_language)
        logger.info(TAG, `从配置读取目标语言: ${config.target_language}`)
      } catch (err) {
        logger.error(TAG, `读取配置失败，使用默认目标语言: ${err}`)
      }
    })()
    requestAnimationFrame(() => inputRef.current?.focus())

    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)
    document.addEventListener('keydown', handleEscKey)

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
      document.removeEventListener('keydown', handleEscKey)
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [handleGlobalMouseMove, handleGlobalMouseUp, onClose])

  return (
    <div className="tt-container" ref={containerRef}>
      {/* 内容区域（含边缘缩放热区） */}
      <div
        className="tt-content"
        onMouseMove={onContentMouseMove}
        onMouseLeave={onContentMouseLeave}
        onMouseDown={onContentMouseDown}
      >
        {/* 输入框边框 */}
        <div className="tt-input-wrap">
          <div className="tt-input-scroll">
            <textarea
              ref={inputRef}
              autoFocus
              value={inputText}
              className="tt-input"
              placeholder={t('textTranslate.inputPlaceholder')}
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              onMouseDown={onInputMouseDown}
              onMouseMove={onInputMouseMove}
              onDoubleClick={onDoubleClick}
            />
          </div>

          {/* 底部控制条 */}
          <div className="tt-controls">
            {hasTranslation && fromCache && (
              <span className="tt-cache-hint">{t('controlBar.cacheHit')}</span>
            )}
            <span className="tt-hint">{t('textTranslate.shortcutHint')}</span>
            <div className="tt-controls-right">
              {hasTranslation && (
                <button
                  className={`tt-copy-btn${copyFeedback ? ' tt-copy-btn-ok' : ''}`}
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
              )}
              <select
                value={targetLanguage}
                className="tt-lang-select"
                onChange={(ev) => setTargetLanguage(ev.target.value)}
              >
                {languageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                className={`tt-translate-btn${translateStatus === 'translating' ? ' tt-translate-btn-loading' : ''}`}
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
          </div>
        </div>
      </div>

      {/* 译文面板 */}
      {hasTranslation && (
        <div className="tt-result">
          <div className="tt-result-inner">{translatedText}</div>
        </div>
      )}

      {/* 错误提示 */}
      {errorMessage && <div className="tt-error">{errorMessage}</div>}
    </div>
  )
}
