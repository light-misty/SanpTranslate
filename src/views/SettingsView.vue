<template>
  <n-config-provider :theme="darkTheme">
    <div class="settings-container">
      <n-spin :show="loading">
        <n-space vertical :size="16">
          <!-- 界面语言设置区域 -->
          <n-card :title="t('settings.languageConfig')" size="small">
            <n-form label-placement="left" label-width="100" :show-feedback="false">
              <n-form-item :label="t('settings.language')">
                <n-select
                  v-model:value="formData.language"
                  :options="uiLanguageOptions"
                  @update:value="onLanguageChange"
                />
              </n-form-item>
            </n-form>
          </n-card>

          <!-- 通用设置区域 -->
          <n-card :title="t('settings.generalConfig')" size="small">
            <n-form label-placement="left" label-width="100" :show-feedback="false">
              <n-form-item :label="t('settings.autoStart')">
                <n-switch
                  v-model:value="autoStartEnabled"
                  :loading="autoStartLoading"
                  @update:value="onToggleAutoStart"
                />
              </n-form-item>
            </n-form>
          </n-card>

          <!-- API 配置区域 -->
          <n-card :title="t('settings.apiConfig')" size="small">
            <template #header-extra>
              <n-button size="small" @click="onTestConnection" :loading="testing">
                {{ t('settings.testConnection') }}
              </n-button>
            </template>
            <n-form label-placement="left" label-width="100" :show-feedback="false">
              <n-form-item :label="t('settings.apiBaseUrl')">
                <n-input
                  v-model:value="formData.api_base_url"
                  placeholder="https://api.openai.com"
                />
              </n-form-item>
              <n-form-item :label="t('settings.apiKey')">
                <n-space align="center" :size="8" style="width: 100%">
                  <n-input
                    v-model:value="formData.api_key"
                    type="password"
                    show-password-on="click"
                    :placeholder="hasApiKey ? '••••••••' : t('settings.apiKeyPlaceholder')"
                    style="flex: 1"
                  />
                  <n-button
                    v-if="formData.api_key.trim()"
                    size="small"
                    type="primary"
                    @click="onSaveApiKey"
                    :loading="savingKey"
                  >
                    {{ t('settings.saveApiKey') }}
                  </n-button>
                  <n-button
                    v-if="hasApiKey"
                    size="small"
                    type="error"
                    @click="onDeleteApiKey"
                    :loading="deleting"
                  >
                    {{ t('settings.deleteApiKey') }}
                  </n-button>
                  <n-tooltip trigger="hover" v-if="hasApiKey">
                    <template #trigger>
                      <n-icon size="18" color="#888">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                      </n-icon>
                    </template>
                    {{ t('settings.apiKeyStoredInKeyring') }}
                  </n-tooltip>
                </n-space>
              </n-form-item>
              <n-form-item :label="t('settings.model')">
                <n-input
                  v-model:value="formData.model"
                  placeholder="gpt-4o"
                />
              </n-form-item>
            </n-form>
          </n-card>

          <!-- 翻译配置区域 -->
          <n-card :title="t('settings.translateConfig')" size="small">
            <n-form label-placement="left" label-width="100" :show-feedback="false">
              <n-form-item :label="t('settings.ocrLanguage')">
                <n-select
                  v-model:value="formData.ocr_language"
                  :options="ocrLanguageOptions"
                />
              </n-form-item>
              <n-form-item :label="t('settings.targetLanguage')">
                <n-select
                  v-model:value="formData.target_language"
                  :options="languageOptions"
                />
              </n-form-item>
            </n-form>
          </n-card>

          <!-- 快捷键配置区域 -->
          <n-card :title="t('settings.shortcutConfig')" size="small">
            <n-form label-placement="left" label-width="100" :show-feedback="false">
              <n-form-item :label="t('settings.captureShortcut')">
                <ShortcutInput
                  v-model="formData.shortcuts_capture"
                  :placeholder="t('settings.clickToSet')"
                />
              </n-form-item>
              <n-form-item :label="t('settings.pinClipboardShortcut')">
                <ShortcutInput
                  v-model="formData.shortcuts_pin_clipboard"
                  :placeholder="t('settings.clickToSet')"
                />
              </n-form-item>
              <n-form-item :label="t('settings.textTranslateShortcut')">
                <ShortcutInput
                  v-model="formData.shortcuts_text_translate"
                  :placeholder="t('settings.clickToSet')"
                />
              </n-form-item>
              <n-form-item :label="''">
                <n-button size="small" @click="onRestoreDefaults">
                  {{ t('settings.restoreDefaults') }}
                </n-button>
              </n-form-item>
            </n-form>
          </n-card>

          <!-- 更新设置区域 -->
          <n-card :title="t('settings.updateConfig')" size="small">
            <n-form label-placement="left" label-width="100" :show-feedback="false">
              <!-- 当前版本 -->
              <n-form-item :label="t('settings.currentVersion')">
                <n-text style="font-size: 13px">{{ appVersion }}</n-text>
              </n-form-item>
              <!-- 自动更新开关 -->
              <n-form-item :label="t('settings.autoUpdate')">
                <n-switch
                  v-model:value="formData.auto_update"
                />
              </n-form-item>
              <!-- 手动检查更新 -->
              <n-form-item :label="t('settings.checkUpdate')">
                <n-space align="center" :size="8">
                  <n-button
                    size="small"
                    :loading="checkingUpdate"
                    :disabled="isDev"
                    @click="onCheckUpdate"
                  >
                    {{ t('settings.checkUpdateBtn') }}
                  </n-button>
                  <!-- 开发模式提示 -->
                  <n-text v-if="isDev" depth="3" style="font-size: 12px">
                    {{ t('settings.updateDisabledInDev') }}
                  </n-text>
                </n-space>
              </n-form-item>
              <!-- 更新状态信息 -->
              <n-form-item v-if="updateStatus" :label="t('settings.updateStatus')">
                <n-space align="center" :size="8" style="width: 100%">
                  <n-text :type="updateStatusType" style="font-size: 13px; flex: 1">
                    {{ updateStatus }}
                  </n-text>
                  <!-- 下载并安装按钮 -->
                  <n-button
                    v-if="pendingUpdate"
                    size="small"
                    type="primary"
                    :loading="downloadingUpdate"
                    @click="onDownloadAndInstall"
                  >
                    {{ t('settings.downloadAndInstall') }}
                  </n-button>
                </n-space>
              </n-form-item>
              <!-- 下载进度条 -->
              <n-form-item v-if="downloadingUpdate" :label="t('settings.downloadProgress')">
                <n-progress
                  type="line"
                  :percentage="downloadProgress"
                  :show-indicator="true"
                  status="info"
                  style="width: 100%"
                />
              </n-form-item>
            </n-form>
          </n-card>

          <!-- 配置文件路径提示 -->
          <n-card :title="t('settings.configFilePath')" size="small">
            <template #header-extra>
              <n-button size="small" @click="openConfigFolder" :disabled="!configPath">
                {{ t('settings.openFolder') }}
              </n-button>
            </template>
            <n-text code class="selectable-path" style="font-size: 12px; word-break: break-all">
              {{ configPath || t('common.loading') }}
            </n-text>
          </n-card>

          <!-- 日志文件路径提示 -->
          <n-card :title="t('settings.logFilePath')" size="small">
            <template #header-extra>
              <n-button size="small" @click="openLogFolder" :disabled="!logDir">
                {{ t('settings.openFolder') }}
              </n-button>
            </template>
            <n-text code class="selectable-path" style="font-size: 12px; word-break: break-all">
              {{ logDir || t('common.loading') }}
            </n-text>
          </n-card>

        </n-space>
      </n-spin>
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { reactive, ref, shallowRef, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  darkTheme,
  NConfigProvider,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NButton,
  NSpace,
  NSpin,
  NText,
  NTooltip,
  NIcon,
  NSwitch,
  NProgress,
  createDiscreteApi,
} from 'naive-ui'
import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '@/stores/configStore'
import { testApiConnection, deleteApiKey, getConfigPath, getLogDir, enableAutoStart, disableAutoStart, isAutoStartEnabled, restartApp, type AppConfig } from '@/utils/tauri'
import { logger } from '@/utils/logger'
import ShortcutInput from '@/components/ShortcutInput.vue'

// 更新信息类型（来自 @tauri-apps/plugin-updater 的 Update 类）
// 使用 Update 类型替代自定义接口，确保类型安全

const TAG = 'SettingsView'
const { t, locale } = useI18n()

// 创建独立的 message 和 dialog 实例，配合深色主题（无需 NMessageProvider/NDialogProvider 包裹）
const { message, dialog } = createDiscreteApi(['message', 'dialog'], {
  configProviderProps: {
    theme: darkTheme,
  },
})

const configStore = useConfigStore()

// 默认快捷键值
const DEFAULT_CAPTURE_SHORTCUT = 'Ctrl+Alt+L'
const DEFAULT_PIN_CLIPBOARD_SHORTCUT = 'Ctrl+Alt+P'
const DEFAULT_TEXT_TRANSLATE_SHORTCUT = 'Ctrl+Alt+M'

// 检测是否为开发模式（通过检查 URL 是否为 localhost 判断）
const isDev = computed(() => {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
})

// 当前应用版本（从 package.json 或 tauri.conf.json 读取）
const appVersion = __APP_VERSION__

// 表单数据（扁平化结构，方便 v-model 双向绑定）
const formData = reactive({
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
})

// 页面状态
const loading = ref(false)
const testing = ref(false)
const deleting = ref(false)
const savingKey = ref(false)
const configPath = ref('')
const logDir = ref('')

// 在系统资源管理器中定位到配置文件
const openConfigFolder = async () => {
  if (!configPath.value) return
  try {
    // 调用后端命令：定位到 config.toml 文件
    await invoke('reveal_in_explorer', { path: configPath.value })
  } catch (e) {
    logger.error(TAG, '打开配置文件所在目录失败', e)
    message.error(t('common.error'))
  }
}

// 在系统资源管理器中打开日志目录
const openLogFolder = async () => {
  if (!logDir.value) return
  try {
    // 调用后端命令：打开日志目录
    await invoke('reveal_in_explorer', { path: logDir.value })
  } catch (e) {
    logger.error(TAG, '打开日志目录失败', e)
    message.error(t('common.error'))
  }
}

// 开机自启动状态
const autoStartEnabled = ref(false)
const autoStartLoading = ref(false)

// 更新相关状态
const checkingUpdate = ref(false)
const downloadingUpdate = ref(false)
const downloadProgress = ref(0)
const updateStatus = ref('')
const updateStatusType = ref<'success' | 'error' | 'warning' | 'info'>('info')
// 使用 shallowRef 避免 Vue 将 Update 对象包装为 Proxy，
// 否则 Update 类的私有字段 (#private) 在 Proxy 上无法访问，会导致 TypeError
const pendingUpdate = shallowRef<Update | null>(null)

// 是否已有 API 密钥（从 keyring 读取）
const hasApiKey = computed(() => !!configStore.apiKey)

// 界面语言选项列表
const uiLanguageOptions = computed(() => [
  { label: t('settings.languageAuto'), value: 'auto' },
  { label: t('settings.languageZhCN'), value: 'zh-CN' },
  { label: t('settings.languageEnUS'), value: 'en-US' },
])

// 目标语言选项列表（使用 i18n 标签，支持语言切换）
const languageOptions = computed(() => [
  { label: t('settings.langZhCN'), value: 'zh-CN' },
  { label: t('settings.langZhTW'), value: 'zh-TW' },
  { label: t('settings.langEn'), value: 'en' },
  { label: t('settings.langJa'), value: 'ja' },
  { label: t('settings.langKo'), value: 'ko' },
  { label: t('settings.langFr'), value: 'fr' },
  { label: t('settings.langDe'), value: 'de' },
  { label: t('settings.langEs'), value: 'es' },
  { label: t('settings.langRu'), value: 'ru' },
])

// OCR 识别语言选项列表
const ocrLanguageOptions = computed(() => [
  { label: t('settings.ocrLanguageAuto'), value: 'auto' },
  { label: t('settings.langZhCN'), value: 'chi_sim' },
  { label: t('settings.langEn'), value: 'eng' },
  { label: t('settings.langJa'), value: 'jpn' },
])

/** 将后端配置填充到表单 */
function populateForm(config: AppConfig) {
  formData.api_base_url = config.api_base_url
  formData.model = config.model
  formData.target_language = config.target_language
  formData.language = config.language || 'auto'
  formData.ocr_language = config.ocr_language || 'auto'
  formData.auto_update = config.auto_update !== undefined ? config.auto_update : true
  formData.shortcuts_capture = config.shortcuts.capture
  formData.shortcuts_pin_clipboard = config.shortcuts.pin_clipboard
  formData.shortcuts_text_translate = config.shortcuts.text_translate
  // API 密钥不从 keyring 填充到表单，仅通过占位符提示已有密钥
  formData.api_key = ''
}

/** 界面语言切换时立即生效，无需点击保存 */
async function onLanguageChange(value: string) {
  // 防止并发保存
  if (configStore.loading) {
    return
  }

  // 立即更新当前窗口的语言
  if (value === 'auto') {
    const sysLang = navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US'
    locale.value = sysLang
  } else {
    locale.value = value
  }

  // 保存语言设置到后端（只更新语言，不影响其他未保存的表单数据）
  const currentConfig = configStore.config
  if (currentConfig) {
    const newConfig: AppConfig = {
      ...currentConfig,
      language: value,
    }
    await configStore.updateConfig(newConfig)

    // configStore.updateConfig 内部捕获异常，需通过 error 字段判断是否成功
    if (configStore.error) {
      message.error(`${t('settings.saveFailed')}: ${configStore.error}`)
      logger.error(TAG, `保存语言设置失败: ${configStore.error}`)
    } else {
      logger.info(TAG, `界面语言即时切换并保存: config.language=${value}, locale=${locale.value}`)
    }
  }
}

/** 防抖自动保存配置（成功时不弹消息，仅在出错时提示） */
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
async function autoSave() {
  try {
    const newConfig: AppConfig = {
      api_base_url: formData.api_base_url.trim(),
      model: formData.model.trim(),
      target_language: formData.target_language,
      language: formData.language,
      ocr_language: formData.ocr_language,
      auto_update: formData.auto_update,
      shortcuts: {
        capture: formData.shortcuts_capture.trim(),
        pin_clipboard: formData.shortcuts_pin_clipboard.trim(),
        text_translate: formData.shortcuts_text_translate.trim(),
      },
    }

    await configStore.updateConfig(newConfig)
    logger.info(TAG, '配置已自动保存')
  } catch (err) {
    message.error(`${t('settings.saveFailed')}: ${err}`)
    logger.error(TAG, `自动保存配置失败: ${err}`)
  }
}

/** 单独保存 API 密钥到系统密钥环 */
async function onSaveApiKey() {
  if (!formData.api_key.trim()) return
  savingKey.value = true
  try {
    await configStore.setApiKey(formData.api_key.trim())
    formData.api_key = ''
    message.success(t('settings.apiKeySaved'))
    logger.info(TAG, 'API 密钥已保存')
  } catch (err) {
    message.error(`${t('settings.saveFailed')}: ${err}`)
    logger.error(TAG, `保存 API 密钥失败: ${err}`)
  } finally {
    savingKey.value = false
  }
}

/** 恢复默认快捷键 */
function onRestoreDefaults() {
  formData.shortcuts_capture = DEFAULT_CAPTURE_SHORTCUT
  formData.shortcuts_pin_clipboard = DEFAULT_PIN_CLIPBOARD_SHORTCUT
  formData.shortcuts_text_translate = DEFAULT_TEXT_TRANSLATE_SHORTCUT
  message.info(t('settings.shortcutsRestored'))
  logger.info(TAG, '快捷键已恢复默认')
}

/** 测试 API 连接 */
async function onTestConnection() {
  if (!formData.api_base_url.trim()) {
    message.warning(t('settings.fillApiUrl'))
    return
  }
  if (!formData.model.trim()) {
    message.warning(t('settings.fillModel'))
    return
  }

  // 优先使用表单中输入的密钥，否则使用已存储的密钥
  const apiKey = formData.api_key.trim() || configStore.apiKey || ''
  if (!apiKey) {
    message.warning(t('settings.fillApiKey'))
    return
  }

  testing.value = true
  try {
    // 传入当前界面语言，使后端返回对应语言的提示信息
    const result = await testApiConnection(
      formData.api_base_url.trim(),
      apiKey,
      formData.model.trim(),
      formData.language
    )
    message.success(result)
    logger.info(TAG, 'API 连接测试成功')
  } catch (err) {
    // 后端已返回友好的错误信息，直接显示
    const errorMsg = String(err)
    message.error(errorMsg)
    logger.error(TAG, `API 连接测试失败: ${err}`)
  } finally {
    testing.value = false
  }
}

/** 删除 API 密钥 */
async function onDeleteApiKey() {
  dialog.warning({
    title: t('common.confirm'),
    content: t('settings.confirmDeleteApiKey'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      deleting.value = true
      try {
        await deleteApiKey()
        // 清空 store 中的密钥
        configStore.apiKey = null
        message.success(t('settings.apiKeyDeleted'))
        logger.info(TAG, 'API 密钥已删除')
      } catch (err) {
        message.error(`${t('settings.deleteApiKeyFailed')}: ${err}`)
        logger.error(TAG, `删除 API 密钥失败: ${err}`)
      } finally {
        deleting.value = false
      }
    },
  })
}

/** 切换开机自启动 */
async function onToggleAutoStart(enabled: boolean) {
  autoStartLoading.value = true
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
    autoStartEnabled.value = !enabled
    message.error(`${t('settings.autoStartFailed')}: ${err}`)
    logger.error(TAG, `设置开机自启动失败: ${err}`)
  } finally {
    autoStartLoading.value = false
  }
}

/** 手动检查更新 */
async function onCheckUpdate() {
  if (isDev.value) {
    updateStatus.value = t('settings.updateDisabledInDev')
    updateStatusType.value = 'warning'
    return
  }

  checkingUpdate.value = true
  pendingUpdate.value = null
  updateStatus.value = t('settings.checkingUpdate')
  updateStatusType.value = 'info'

  try {
    const update = await check()

    if (update) {
      // 发现新版本
      const versionInfo = `v${update.version}`
      const dateInfo = update.date ? ` (${update.date})` : ''
      updateStatus.value = t('settings.updateAvailable', { version: versionInfo, date: dateInfo })
      updateStatusType.value = 'info'
      pendingUpdate.value = update
      logger.info(TAG, `发现新版本: ${versionInfo}`)
    } else {
      // 已是最新版本
      updateStatus.value = t('settings.alreadyLatest')
      updateStatusType.value = 'success'
      logger.info(TAG, '当前已是最新版本')
    }
  } catch (err) {
    updateStatus.value = t('settings.checkUpdateFailed', { error: String(err) })
    updateStatusType.value = 'error'
    logger.error(TAG, `检查更新失败: ${err}`)
  } finally {
    checkingUpdate.value = false
  }
}

/** 下载并安装更新 */
async function onDownloadAndInstall() {
  if (!pendingUpdate.value) return

  downloadingUpdate.value = true
  downloadProgress.value = 0
  updateStatus.value = t('settings.downloadingUpdate')
  updateStatusType.value = 'info'

  try {
    let downloaded = 0
    let contentLength = 0

    await pendingUpdate.value.downloadAndInstall((event: DownloadEvent) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength ?? 0
          logger.info(TAG, `开始下载更新，总大小: ${contentLength} 字节`)
          break
        case 'Progress':
          downloaded += event.data.chunkLength
          if (contentLength > 0) {
            downloadProgress.value = Math.round((downloaded / contentLength) * 100)
          }
          break
        case 'Finished':
          downloadProgress.value = 100
          updateStatus.value = t('settings.updateDownloaded')
          updateStatusType.value = 'success'
          logger.info(TAG, '更新下载完成')
          break
      }
    })

    // 安装完成，提示重启
    dialog.success({
      title: t('settings.updateReady'),
      content: t('settings.updateReadyContent'),
      positiveText: t('settings.restartNow'),
      negativeText: t('settings.restartLater'),
      onPositiveClick: async () => {
        await restartApp()
      },
    })
  } catch (err) {
    updateStatus.value = t('settings.downloadFailed', { error: String(err) })
    updateStatusType.value = 'error'
    logger.error(TAG, `下载安装更新失败: ${err}`)
  } finally {
    downloadingUpdate.value = false
    pendingUpdate.value = null
  }
}

// 标记是否已完成初始加载，防止 populateForm 触发自动保存
const initialized = ref(false)

// 自动保存配置监听（排除 language 已有独立逻辑、api_key 由独立按钮处理）
watch(
  () => ({
    api_base_url: formData.api_base_url,
    model: formData.model,
    target_language: formData.target_language,
    ocr_language: formData.ocr_language,
    auto_update: formData.auto_update,
    shortcuts_capture: formData.shortcuts_capture,
    shortcuts_pin_clipboard: formData.shortcuts_pin_clipboard,
    shortcuts_text_translate: formData.shortcuts_text_translate,
  }),
  () => {
    if (!initialized.value) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      autoSave()
    }, 500)
  },
  { deep: true }
)

// 页面加载时初始化配置数据
onMounted(async () => {
  loading.value = true
  try {
    // 并行加载配置、API 密钥、配置文件路径、日志目录路径和开机自启动状态
    const [, , path, logPath, autoStart] = await Promise.all([
      configStore.loadConfig(),
      configStore.loadApiKey(),
      getConfigPath(),
      getLogDir().catch(() => ''),
      isAutoStartEnabled().catch(() => false),
    ])

    // 将加载的配置填充到表单
    if (configStore.config) {
      populateForm(configStore.config)
    }

    // 保存配置文件路径
    configPath.value = path

    // 保存日志目录路径
    logDir.value = logPath

    // 保存开机自启动状态
    autoStartEnabled.value = autoStart

    initialized.value = true

    logger.info(TAG, '设置页面初始化完成')
  } catch (err) {
    message.error(`${t('settings.loadFailed')}: ${err}`)
    logger.error(TAG, `加载配置失败: ${err}`)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.settings-container {
  padding: 16px;
  height: 100vh;
  overflow-y: auto;
  box-sizing: border-box;
  background-color: #101014;
}

/* WebKit浏览器隐藏滚动条 */
.settings-container::-webkit-scrollbar {
  display: none;
}

/* 表单项之间增加间距 */
.settings-container :deep(.n-form-item) {
  margin-bottom: 12px;
}

/* 路径文字可选中，鼠标变为 I 形 */
.selectable-path {
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}
</style>
