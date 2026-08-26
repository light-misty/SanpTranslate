import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { App as AntdApp, Button, Card, Form, Input, Progress, Select, Space, Spin, Switch, Tooltip, Typography } from 'antd'
import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '@/stores/configStore'
import { testApiConnection, deleteApiKey, getConfigPath, getLogDir, enableAutoStart, disableAutoStart, isAutoStartEnabled, restartApp, type AppConfig } from '@/utils/tauri'
import { logger } from '@/utils/logger'
import ShortcutInput from '@/components/ShortcutInput'
import './SettingsView.css'

const TAG = 'SettingsView'

/** 导航页签类型 */
type NavTab = 'general' | 'api' | 'translate' | 'shortcut' | 'update' | 'about'

/** 导航页签配置 */
interface NavTabConfig {
  key: NavTab
  labelKey: string
}

/** 导航页签列表 */
const NAV_TABS: NavTabConfig[] = [
  { key: 'general', labelKey: 'settings.navGeneral' },
  { key: 'api', labelKey: 'settings.navApi' },
  { key: 'translate', labelKey: 'settings.navTranslate' },
  { key: 'shortcut', labelKey: 'settings.navShortcut' },
  { key: 'update', labelKey: 'settings.navUpdate' },
  { key: 'about', labelKey: 'settings.navAbout' },
]

/** 扁平化表单数据结构，方便受控绑定 */
interface FormData {
  api_provider: string
  api_base_url: string
  api_key: string
  model: string
  target_language: string
  language: string
  ocr_language: string
  auto_update: boolean
  shortcuts_capture: string
  shortcuts_pin_clipboard: string
  shortcuts_text_translate: string
}

/** 默认快捷键值 */
const DEFAULT_CAPTURE_SHORTCUT = 'Ctrl+Alt+L'
const DEFAULT_PIN_CLIPBOARD_SHORTCUT = 'Ctrl+Alt+P'
const DEFAULT_TEXT_TRANSLATE_SHORTCUT = 'Ctrl+Alt+M'

/** 表单默认值（对应原实现的 reactive 初始对象） */
const DEFAULT_FORM: FormData = {
  api_provider: 'openai',
  api_base_url: '',
  api_key: '',
  model: '',
  target_language: 'zh-CN',
  language: 'auto',
  ocr_language: 'auto',
  auto_update: true,
  shortcuts_capture: '',
  shortcuts_pin_clipboard: '',
  shortcuts_text_translate: '',
}

/** 将内部的更新状态类型映射为 antd Typography.Text 支持的类型 */
function mapTextType(tp: 'success' | 'error' | 'warning' | 'info'): 'success' | 'warning' | 'danger' | 'secondary' {
  if (tp === 'error') return 'danger'
  if (tp === 'info') return 'secondary'
  return tp
}

/** 设置页面：将原 Vue + NaiveUI 迁移为 React + antd */
export default function SettingsView() {
  const { t, i18n } = useTranslation()
  const { message, modal } = AntdApp.useApp()

  // 当前选中的导航页签
  const [activeTab, setActiveTab] = useState<NavTab>('general')

  // 表单数据（使用单一 state，提供 updateField 辅助）
  const [form, setForm] = useState<FormData>(DEFAULT_FORM)

  // 页面状态
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [configPath, setConfigPath] = useState('')
  const [logDir, setLogDir] = useState('')

  // 开机自启动状态
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [autoStartLoading, setAutoStartLoading] = useState(false)

  // 更新相关状态
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [updateStatus, setUpdateStatus] = useState('')
  const [updateStatusType, setUpdateStatusType] = useState<'success' | 'error' | 'warning' | 'info'>('info')
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null)

  // 标记是否已完成初始加载，防止初始填充触发自动保存
  const initializedRef = useRef(false)
  // 防抖定时器
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 始终持有最新表单值的引用，供异步回调读取
  const formRef = useRef(form)
  formRef.current = form

  // 是否已有 API 密钥（订阅 store，支持 setState 修改后自动更新）
  const hasApiKey = !!useConfigStore((s) => s.apiKey)

  // 检测是否为开发模式（通过检查 URL 是否为 localhost 判断）
  const isDev = useMemo(
    () => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    []
  )

  /** 通用表单字段更新辅助 */
  const updateField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  // 界面语言选项列表
  const uiLanguageOptions = [
    { label: t('settings.languageAuto'), value: 'auto' },
    { label: t('settings.languageZhCN'), value: 'zh-CN' },
    { label: t('settings.languageEnUS'), value: 'en-US' },
  ]

  // API Provider 选项列表
  const providerOptions = [
    { label: t('settings.providerOpenai'), value: 'openai' },
    { label: t('settings.providerAnthropic'), value: 'anthropic' },
    { label: t('settings.providerGemini'), value: 'gemini' },
  ]

  // 根据当前 Provider 集中管理 URL 与模型名的占位符
  const providerPlaceholders = (() => {
    const map: Record<string, { url: string; model: string }> = {
      openai: {
        url: t('settings.apiUrlPlaceholderOpenai'),
        model: t('settings.modelPlaceholderOpenai'),
      },
      anthropic: {
        url: t('settings.apiUrlPlaceholderAnthropic'),
        model: t('settings.modelPlaceholderAnthropic'),
      },
      gemini: {
        url: t('settings.apiUrlPlaceholderGemini'),
        model: t('settings.modelPlaceholderGemini'),
      },
    }
    return map[form.api_provider] ?? map.openai
  })()

  // 目标语言选项列表（使用 i18n 标签，支持语言切换）
  const languageOptions = [
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

  // OCR 识别语言选项列表
  const ocrLanguageOptions = [
    { label: t('settings.ocrLanguageAuto'), value: 'auto' },
    { label: t('settings.langZhCN'), value: 'chi_sim' },
    { label: t('settings.langEn'), value: 'eng' },
    { label: t('settings.langJa'), value: 'jpn' },
  ]

  /** 将后端配置填充到表单 */
  function populateForm(config: AppConfig) {
    setForm((prev) => ({
      ...prev,
      api_provider: config.api_provider || 'openai',
      api_base_url: config.api_base_url,
      model: config.model,
      target_language: config.target_language,
      language: config.language || 'auto',
      ocr_language: config.ocr_language || 'auto',
      auto_update: config.auto_update !== undefined ? config.auto_update : true,
      shortcuts_capture: config.shortcuts?.capture ?? '',
      shortcuts_pin_clipboard: config.shortcuts?.pin_clipboard ?? '',
      shortcuts_text_translate: config.shortcuts?.text_translate ?? '',
      // API 密钥不从 keyring 填充到表单，仅通过占位符提示已有密钥
      api_key: '',
    }))
  }

  /** 页面加载时初始化配置数据 */
  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        // 并行加载配置、API 密钥、配置文件路径、日志目录路径和开机自启动状态
        const [, , path, logPath, autoStart] = await Promise.all([
          useConfigStore.getState().loadConfig(),
          useConfigStore.getState().loadApiKey(),
          getConfigPath(),
          getLogDir().catch(() => ''),
          isAutoStartEnabled().catch(() => false),
        ])

        if (!active) return

        // 将加载的配置填充到表单
        const cfg = useConfigStore.getState().config
        if (cfg) {
          populateForm(cfg)
        }

        // 保存配置文件路径与日志目录路径
        setConfigPath(path)
        setLogDir(logPath)

        // 保存开机自启动状态
        setAutoStartEnabled(autoStart)

        initializedRef.current = true

        logger.info(TAG, '设置页面初始化完成')
      } catch (err) {
        message.error(`${t('settings.loadFailed')}: ${err}`)
        logger.error(TAG, `加载配置失败: ${err}`)
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 防抖自动保存配置（成功时不弹消息，仅在出错时提示） */
  async function autoSave() {
    const f = formRef.current
    try {
      const newConfig: AppConfig = {
        api_provider: f.api_provider,
        api_base_url: f.api_base_url.trim(),
        model: f.model.trim(),
        target_language: f.target_language,
        language: f.language,
        ocr_language: f.ocr_language,
        auto_update: f.auto_update,
        shortcuts: {
          capture: f.shortcuts_capture.trim(),
          pin_clipboard: f.shortcuts_pin_clipboard.trim(),
          text_translate: f.shortcuts_text_translate.trim(),
        },
      }
      await useConfigStore.getState().updateConfig(newConfig)
      logger.info(TAG, '配置已自动保存')
    } catch (err) {
      message.error(`${t('settings.saveFailed')}: ${err}`)
      logger.error(TAG, `自动保存配置失败: ${err}`)
    }
  }

  // 自动保存配置监听（排除 language 已有独立逻辑、api_key 由独立按钮处理）
  useEffect(() => {
    if (!initializedRef.current) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      autoSave()
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.api_provider,
    form.api_base_url,
    form.model,
    form.target_language,
    form.ocr_language,
    form.auto_update,
    form.shortcuts_capture,
    form.shortcuts_pin_clipboard,
    form.shortcuts_text_translate,
  ])

  /** 界面语言切换时立即生效，无需点击保存 */
  async function onLanguageChange(lang: string) {
    // 防止并发保存
    if (useConfigStore.getState().loading) {
      return
    }

    // 立即更新当前窗口的语言
    const sysLang = navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US'
    await i18n.changeLanguage(lang === 'auto' ? sysLang : lang)

    updateField('language', lang)

    // 保存语言设置到后端（只更新语言，不影响其他未保存的表单数据）
    const currentConfig = useConfigStore.getState().config
    if (currentConfig) {
      const newConfig: AppConfig = {
        ...currentConfig,
        language: lang,
      }
      await useConfigStore.getState().updateConfig(newConfig)

      // updateConfig 内部捕获异常，需通过 error 字段判断是否成功
      const st = useConfigStore.getState()
      if (st.error) {
        message.error(`${t('settings.saveFailed')}: ${st.error}`)
        logger.error(TAG, `保存语言设置失败: ${st.error}`)
      } else {
        logger.info(TAG, `界面语言即时切换并保存: config.language=${lang}`)
      }
    }
  }

  /** 单独保存 API 密钥到系统密钥环 */
  async function onSaveApiKey() {
    if (!formRef.current.api_key.trim()) return
    setSavingKey(true)
    try {
      await useConfigStore.getState().setApiKey(formRef.current.api_key.trim())
      updateField('api_key', '')
      message.success(t('settings.apiKeySaved'))
      logger.info(TAG, 'API 密钥已保存')
    } catch (err) {
      message.error(`${t('settings.saveFailed')}: ${err}`)
      logger.error(TAG, `保存 API 密钥失败: ${err}`)
    } finally {
      setSavingKey(false)
    }
  }

  /** 删除 API 密钥，二次确认后调用后端删除 */
  function onDeleteApiKey() {
    modal.confirm({
      title: t('common.confirm'),
      content: t('settings.confirmDeleteApiKey'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setDeleting(true)
        try {
          await deleteApiKey()
          // 清空 store 中的密钥
          useConfigStore.setState({ apiKey: null })
          message.success(t('settings.apiKeyDeleted'))
          logger.info(TAG, 'API 密钥已删除')
        } catch (err) {
          message.error(`${t('settings.deleteApiKeyFailed')}: ${err}`)
          logger.error(TAG, `删除 API 密钥失败: ${err}`)
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  /** 恢复默认快捷键 */
  function onRestoreDefaults() {
    setForm((prev) => ({
      ...prev,
      shortcuts_capture: DEFAULT_CAPTURE_SHORTCUT,
      shortcuts_pin_clipboard: DEFAULT_PIN_CLIPBOARD_SHORTCUT,
      shortcuts_text_translate: DEFAULT_TEXT_TRANSLATE_SHORTCUT,
    }))
    message.info(t('settings.shortcutsRestored'))
    logger.info(TAG, '快捷键已恢复默认')
  }

  /** 测试 API 连接 */
  async function onTestConnection() {
    if (!formRef.current.api_base_url.trim()) {
      message.warning(t('settings.fillApiUrl'))
      return
    }
    if (!formRef.current.model.trim()) {
      message.warning(t('settings.fillModel'))
      return
    }

    // 优先使用表单中输入的密钥，否则使用已存储的密钥
    const apiKey = formRef.current.api_key.trim() || useConfigStore.getState().apiKey || ''
    if (!apiKey) {
      message.warning(t('settings.fillApiKey'))
      return
    }

    setTesting(true)
    try {
      // 传入当前界面语言和 API Provider，使后端返回对应语言的提示信息并使用对应提供商的连接测试逻辑
      const result = await testApiConnection(
        formRef.current.api_base_url.trim(),
        apiKey,
        formRef.current.model.trim(),
        formRef.current.language,
        formRef.current.api_provider
      )
      message.success(result)
      logger.info(TAG, 'API 连接测试成功')
    } catch (err) {
      // 后端已返回友好的错误信息，直接显示
      message.error(String(err))
      logger.error(TAG, `API 连接测试失败: ${err}`)
    } finally {
      setTesting(false)
    }
  }

  /** 切换开机自启动 */
  async function onToggleAutoStart(enabled: boolean) {
    setAutoStartLoading(true)
    try {
      if (enabled) {
        await enableAutoStart()
        message.success(t('settings.autoStartEnabled'))
        logger.info(TAG, '开机自启动已开启')
      } else {
        await disableAutoStart()
        message.success(t('settings.autoStartDisabled'))
        logger.info(TAG, '开机自启动已关闭')
      }
    } catch (err) {
      // 切换失败时恢复原状态
      setAutoStartEnabled(!enabled)
      message.error(`${t('settings.autoStartFailed')}: ${err}`)
      logger.error(TAG, `设置开机自启动失败: ${err}`)
    } finally {
      setAutoStartLoading(false)
    }
  }

  /** 手动检查更新 */
  async function onCheckUpdate() {
    if (isDev) {
      setUpdateStatus(t('settings.updateDisabledInDev'))
      setUpdateStatusType('warning')
      return
    }

    setCheckingUpdate(true)
    setPendingUpdate(null)
    setUpdateStatus(t('settings.checkingUpdate'))
    setUpdateStatusType('info')

    try {
      const update = await check()

      if (update) {
        // 发现新版本
        const versionInfo = `v${update.version}`
        const dateInfo = update.date ? ` (${update.date})` : ''
        setUpdateStatus(t('settings.updateAvailable', { version: versionInfo, date: dateInfo }))
        setUpdateStatusType('info')
        setPendingUpdate(update)
        logger.info(TAG, `发现新版本: ${versionInfo}`)
      } else {
        // 已是最新版本
        setUpdateStatus(t('settings.alreadyLatest'))
        setUpdateStatusType('success')
        logger.info(TAG, '当前已是最新版本')
      }
    } catch (err) {
      setUpdateStatus(t('settings.checkUpdateFailed', { error: String(err) }))
      setUpdateStatusType('error')
      logger.error(TAG, `检查更新失败: ${err}`)
    } finally {
      setCheckingUpdate(false)
    }
  }

  /** 下载并安装更新 */
  async function onDownloadAndInstall() {
    if (!pendingUpdate) return

    setDownloadingUpdate(true)
    setDownloadProgress(0)
    setUpdateStatus(t('settings.downloadingUpdate'))
    setUpdateStatusType('info')

    try {
      let downloaded = 0
      let contentLength = 0

      await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0
            logger.info(TAG, `开始下载更新，总大小: ${contentLength} 字节`)
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100))
            }
            break
          case 'Finished':
            setDownloadProgress(100)
            setUpdateStatus(t('settings.updateDownloaded'))
            setUpdateStatusType('success')
            logger.info(TAG, '更新下载完成')
            break
        }
      })

      // 安装完成，提示重启
      modal.success({
        title: t('settings.updateReady'),
        content: t('settings.updateReadyContent'),
        okText: t('settings.restartNow'),
        cancelText: t('settings.restartLater'),
        onOk: async () => {
          await restartApp()
        },
      })
    } catch (err) {
      setUpdateStatus(t('settings.downloadFailed', { error: String(err) }))
      setUpdateStatusType('error')
      logger.error(TAG, `下载安装更新失败: ${err}`)
    } finally {
      setDownloadingUpdate(false)
      setPendingUpdate(null)
    }
  }

  /** 在系统资源管理器中定位到配置文件 */
  async function openConfigFolder() {
    if (!configPath) return
    try {
      await invoke('reveal_in_explorer', { path: configPath })
    } catch (e) {
      logger.error(TAG, '打开配置文件所在目录失败', e)
      message.error(t('common.error'))
    }
  }

  /** 在系统资源管理器中打开日志目录 */
  async function openLogFolder() {
    if (!logDir) return
    try {
      await invoke('reveal_in_explorer', { path: logDir })
    } catch (e) {
      logger.error(TAG, '打开日志目录失败', e)
      message.error(t('common.error'))
    }
  }

  // 更新状态文字颜色（antd Typography.Text 支持的 type）
  const textType = mapTextType(updateStatusType)

  /** 渲染导航栏 */
  const renderNavBar = () => (
    <div className="settings-nav-bar">
      {NAV_TABS.map((tab) => (
        <button
          key={tab.key}
          className={`settings-nav-item ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.key)}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  )

  /** 根据当前选中的页签渲染对应内容 */
  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <Card title={t('settings.languageConfig')} size="small">
            <Form layout="horizontal" labelCol={{ style: { width: 100 } }}>
              <Form.Item label={t('settings.language')}>
                <Select options={uiLanguageOptions} value={form.language} onChange={onLanguageChange} />
              </Form.Item>
            </Form>
          </Card>
        )

      case 'api':
        return (
          <Card
            title={t('settings.apiConfig')}
            size="small"
            extra={
              <Button size="small" onClick={onTestConnection} loading={testing}>
                {t('settings.testConnection')}
              </Button>
            }
          >
            <Form layout="horizontal" labelCol={{ style: { width: 100 } }}>
              <Form.Item label={t('settings.apiProvider')}>
                <Select
                  options={providerOptions}
                  value={form.api_provider}
                  onChange={(v: string) => updateField('api_provider', v)}
                />
              </Form.Item>
              <Form.Item label={t('settings.apiBaseUrl')}>
                <Input
                  placeholder={providerPlaceholders.url}
                  value={form.api_base_url}
                  onChange={(e) => updateField('api_base_url', e.target.value)}
                />
              </Form.Item>
              <Form.Item label={t('settings.apiKey')}>
                <Space align="center" size={8} style={{ width: '100%' }}>
                  <Input.Password
                    placeholder={hasApiKey ? '••••••••' : t('settings.apiKeyPlaceholder')}
                    style={{ flex: 1 }}
                    value={form.api_key}
                    onChange={(e) => updateField('api_key', e.target.value)}
                  />
                  {form.api_key.trim() && (
                    <Button type="primary" size="small" loading={savingKey} onClick={onSaveApiKey}>
                      {t('settings.saveApiKey')}
                    </Button>
                  )}
                  {hasApiKey && (
                    <Button danger size="small" loading={deleting} onClick={onDeleteApiKey}>
                      {t('settings.deleteApiKey')}
                    </Button>
                  )}
                  {hasApiKey && (
                    <Tooltip title={t('settings.apiKeyStoredInKeyring')}>
                      {/* 信息图标，无需 i18n */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        width={18}
                        height={18}
                        color="#888"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                      </svg>
                    </Tooltip>
                  )}
                </Space>
              </Form.Item>
              <Form.Item label={t('settings.model')}>
                <Input
                  placeholder={providerPlaceholders.model}
                  value={form.model}
                  onChange={(e) => updateField('model', e.target.value)}
                />
              </Form.Item>
            </Form>
          </Card>
        )

      case 'translate':
        return (
          <Card title={t('settings.translateConfig')} size="small">
            <Form layout="horizontal" labelCol={{ style: { width: 100 } }}>
              <Form.Item label={t('settings.ocrLanguage')}>
                <Select
                  options={ocrLanguageOptions}
                  value={form.ocr_language}
                  onChange={(v: string) => updateField('ocr_language', v)}
                />
              </Form.Item>
              <Form.Item label={t('settings.targetLanguage')}>
                <Select
                  options={languageOptions}
                  value={form.target_language}
                  onChange={(v: string) => updateField('target_language', v)}
                />
              </Form.Item>
            </Form>
          </Card>
        )

      case 'shortcut':
        return (
          <Card title={t('settings.shortcutConfig')} size="small">
            <Form layout="horizontal" labelCol={{ style: { width: 100 } }}>
              <Form.Item label={t('settings.captureShortcut')}>
                <ShortcutInput
                  value={form.shortcuts_capture}
                  onChange={(v: string) => updateField('shortcuts_capture', v)}
                  placeholder={t('settings.clickToSet')}
                />
              </Form.Item>
              <Form.Item label={t('settings.pinClipboardShortcut')}>
                <ShortcutInput
                  value={form.shortcuts_pin_clipboard}
                  onChange={(v: string) => updateField('shortcuts_pin_clipboard', v)}
                  placeholder={t('settings.clickToSet')}
                />
              </Form.Item>
              <Form.Item label={t('settings.textTranslateShortcut')}>
                <ShortcutInput
                  value={form.shortcuts_text_translate}
                  onChange={(v: string) => updateField('shortcuts_text_translate', v)}
                  placeholder={t('settings.clickToSet')}
                />
              </Form.Item>
              <Form.Item label="">
                <Button size="small" onClick={onRestoreDefaults}>
                  {t('settings.restoreDefaults')}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        )

      case 'update':
        return (
          <Card title={t('settings.updateConfig')} size="small">
            <Form layout="horizontal" labelCol={{ style: { width: 100 } }}>
              {/* 当前版本 */}
              <Form.Item label={t('settings.currentVersion')}>
                <Typography.Text style={{ fontSize: 13 }}>{__APP_VERSION__}</Typography.Text>
              </Form.Item>
              {/* 自动更新开关 */}
              <Form.Item label={t('settings.autoUpdate')}>
                <Switch
                  checked={form.auto_update}
                  onChange={(v: boolean) => updateField('auto_update', v)}
                />
              </Form.Item>
              {/* 手动检查更新 */}
              <Form.Item label={t('settings.checkUpdate')}>
                <Space align="center" size={8}>
                  <Button size="small" loading={checkingUpdate} disabled={isDev} onClick={onCheckUpdate}>
                    {t('settings.checkUpdateBtn')}
                  </Button>
                  {/* 开发模式提示 */}
                  {isDev && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t('settings.updateDisabledInDev')}
                    </Typography.Text>
                  )}
                </Space>
              </Form.Item>
              {/* 更新状态信息 */}
              {updateStatus && (
                <Form.Item label={t('settings.updateStatus')}>
                  <Space align="center" size={8} style={{ width: '100%' }}>
                    <Typography.Text type={textType} style={{ fontSize: 13, flex: 1 }}>
                      {updateStatus}
                    </Typography.Text>
                    {/* 下载并安装按钮 */}
                    {pendingUpdate && (
                      <Button size="small" type="primary" loading={downloadingUpdate} onClick={onDownloadAndInstall}>
                        {t('settings.downloadAndInstall')}
                      </Button>
                    )}
                  </Space>
                </Form.Item>
              )}
              {/* 下载进度条 */}
              {downloadingUpdate && (
                <Form.Item label={t('settings.downloadProgress')}>
                  <Progress percent={downloadProgress} showInfo style={{ width: '100%' }} />
                </Form.Item>
              )}
            </Form>
          </Card>
        )

      case 'about':
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 开机自启动设置 */}
            <Card title={t('settings.generalConfig')} size="small">
              <Form layout="horizontal" labelCol={{ style: { width: 100 } }}>
                <Form.Item label={t('settings.autoStart')}>
                  <Switch
                    checked={autoStartEnabled}
                    loading={autoStartLoading}
                    onChange={onToggleAutoStart}
                  />
                </Form.Item>
              </Form>
            </Card>

            {/* 配置文件路径提示 */}
            <Card
              title={t('settings.configFilePath')}
              size="small"
              extra={
                <Button size="small" onClick={openConfigFolder} disabled={!configPath}>
                  {t('settings.openFolder')}
                </Button>
              }
            >
              <Typography.Text
                copyable
                code
                className="selectable-path"
                style={{ fontSize: 12, wordBreak: 'break-all' }}
              >
                {configPath || t('common.loading')}
              </Typography.Text>
            </Card>

            {/* 日志文件路径提示 */}
            <Card
              title={t('settings.logFilePath')}
              size="small"
              extra={
                <Button size="small" onClick={openLogFolder} disabled={!logDir}>
                  {t('settings.openFolder')}
                </Button>
              }
            >
              <Typography.Text
                copyable
                code
                className="selectable-path"
                style={{ fontSize: 12, wordBreak: 'break-all' }}
              >
                {logDir || t('common.loading')}
              </Typography.Text>
            </Card>
          </Space>
        )

      default:
        return null
    }
  }

  return (
    <div className="settings-container">
      <Spin spinning={loading}>
        {/* 导航栏 */}
        {renderNavBar()}
        {/* 内容区域 */}
        <div className="settings-content">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {renderContent()}
          </Space>
        </div>
      </Spin>
    </div>
  )
}
