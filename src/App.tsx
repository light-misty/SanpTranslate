import { useEffect } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useTranslation } from 'react-i18next'
import AppRoutes from '@/router'
import { getConfig } from '@/utils/tauri'
import { logger } from '@/utils/logger'

const TAG = 'App'

/** 根应用组件：语言初始化 + 跨窗口语言同步 + 路由出口 */
export default function App() {
  const { i18n } = useTranslation()

  useEffect(() => {
    let unlisten: UnlistenFn | null = null
    let cancelled = false

    // 根据配置设置界面语言
    async function applyLanguage(language: string) {
      const lang = language === 'auto'
        ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US')
        : language
      await i18n.changeLanguage(lang)
    }

    ;(async () => {
      // 从后端加载配置，初始化界面语言
      try {
        const config = await getConfig()
        if (cancelled) return
        await applyLanguage(config.language)
        logger.info(TAG, `界面语言初始化: config.language=${config.language}`)
      } catch (err) {
        logger.error(TAG, `加载配置初始化语言失败: ${err}`)
      }

      // 监听后端广播的语言变更事件（其他窗口保存配置时触发）
      try {
        unlisten = await listen<string>('language-changed', (event) => {
          const newLang = event.payload
          i18n.changeLanguage(newLang).catch(() => {})
          logger.info(TAG, `收到语言变更事件，切换到: ${newLang}`)
        })
      } catch (err) {
        logger.error(TAG, `注册语言变更监听失败: ${err}`)
      }
    })()

    return () => {
      cancelled = true
      if (unlisten) {
        unlisten()
        unlisten = null
      }
    }
  }, [i18n])

  return (
    <div style={{ height: '100%' }} onContextMenu={(e) => e.preventDefault()}>
      <AppRoutes />
    </div>
  )
}