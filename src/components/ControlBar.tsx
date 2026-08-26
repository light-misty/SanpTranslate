import { useTranslation } from 'react-i18next'
import './ControlBar.css'

/** 翻译状态类型 */
export type TranslateStatus = 'idle' | 'translating' | 'done' | 'error'

/** 控制栏组件属性 */
export interface ControlBarProps {
  /** 翻译状态 */
  translateStatus: TranslateStatus
  /** 是否显示原文 */
  showOriginal: boolean
  /** 是否有翻译结果 */
  hasTranslation: boolean
  /** 错误信息 */
  errorMessage?: string
  /** 是否来自历史缓存 */
  fromCache?: boolean
  /** OCR 是否正在识别中（idle 状态下"复制原文"按钮的加载状态） */
  ocrLoading?: boolean
  /** 是否垂直排布 */
  vertical?: boolean
  /** 翻译按钮点击 */
  onTranslate: () => void
  /** 重新翻译按钮点击（强制调用API，跳过缓存） */
  onRetranslate: () => void
  /** 复制原文按钮点击 */
  onCopyOriginal: () => void
  /** 复制译文按钮点击 */
  onCopyTranslation: () => void
  /** 原文/译文切换按钮点击 */
  onToggleOriginal: () => void
  /** idle 状态下"复制原文"按钮点击（需先执行 OCR） */
  onOcrCopyOriginal: () => void
}

/** 控制栏组件：根据翻译状态展示与 vue 版完全一致的操作按钮组 */
export default function ControlBar({
  translateStatus,
  showOriginal,
  errorMessage,
  fromCache,
  ocrLoading,
  vertical,
  onTranslate,
  onRetranslate,
  onCopyOriginal,
  onCopyTranslation,
  onToggleOriginal,
  onOcrCopyOriginal,
}: ControlBarProps) {
  const { t } = useTranslation()

  return (
    <div className={vertical ? 'control-bar vertical' : 'control-bar'}>
      {/* idle 或 error 状态：显示 AI 翻译主按钮 + 复制原文按钮 */}
      {(translateStatus === 'idle' || translateStatus === 'error') && (
        <>
          <button
            className="btn"
            onClick={onTranslate}
          >
            {translateStatus === 'error' ? t('controlBar.retranslate') : t('controlBar.translate')}
          </button>

          {/* 复制原文按钮（idle 状态下通过 OCR 识别获取文字） */}
          <button
            className="btn"
            disabled={ocrLoading}
            onClick={onOcrCopyOriginal}
          >
            {ocrLoading ? t('controlBar.recognizing') : t('controlBar.copyOriginal')}
          </button>
        </>
      )}

      {/* error 状态：显示错误提示信息 */}
      {translateStatus === 'error' && errorMessage && (
        <span className="error-msg">{errorMessage}</span>
      )}

      {/* translating 状态：显示禁用的翻译中按钮 */}
      {translateStatus === 'translating' && (
        <button
          className="btn"
          disabled
        >
          {t('controlBar.translating')}
        </button>
      )}

      {/* done 状态：显示操作按钮组 */}
      {translateStatus === 'done' && (
        <>
          {/* 复制原文 */}
          <button className="btn" onClick={onCopyOriginal}>{t('controlBar.copyOriginal')}</button>

          {/* 复制译文 */}
          <button className="btn" onClick={onCopyTranslation}>{t('controlBar.copyTranslation')}</button>

          {/* 重新翻译（强制调用 API，跳过缓存） */}
          <button className="btn" onClick={onRetranslate}>{t('controlBar.retranslate')}</button>

          {/* 原文/译文切换 */}
          <button className="btn" onClick={onToggleOriginal}>
            {showOriginal ? t('controlBar.showTranslation') : t('controlBar.showOriginal')}
          </button>

          {/* 缓存命中提示 */}
          {fromCache && <span className="cache-hint">{t('controlBar.cacheHit')}</span>}
        </>
      )}
    </div>
  )
}