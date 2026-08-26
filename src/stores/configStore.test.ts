import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '@/utils/tauri'

// 顶层 mock：命令层 getConfig/saveConfig 与 keyring invoke
vi.mock('@/utils/tauri', () => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { useConfigStore } from './configStore'
import { getConfig, saveConfig } from '@/utils/tauri'
import { invoke } from '@tauri-apps/api/core'

/** 构造一份有效的最小配置 */
const makeConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  api_provider: 'openai',
  api_base_url: 'https://api.openai.com',
  model: 'gpt-4o',
  target_language: 'zh-CN',
  language: 'auto',
  ocr_language: 'auto',
  auto_update: true,
  shortcuts: { capture: 'Ctrl+Alt+L', pin_clipboard: 'Ctrl+Alt+P', text_translate: 'Ctrl+Alt+M' },
  ...overrides,
})

describe('configStore', () => {
  beforeEach(() => {
    // 重置全部 mock 与 store 状态
    vi.clearAllMocks()
    useConfigStore.setState({ config: null, loading: false, error: null, apiKey: null })
  })

  it('loadConfig 成功时填充 config', async () => {
    const cfg = makeConfig()
    vi.mocked(getConfig).mockResolvedValue(cfg)

    await useConfigStore.getState().loadConfig()

    const state = useConfigStore.getState()
    expect(state.config).toEqual(cfg)
    expect(state.error).toBeNull()
    expect(state.loading).toBe(false)
  })

  it('loadConfig 失败时写入 error 且不抛出（与原 pinia 语义一致）', async () => {
    vi.mocked(getConfig).mockRejectedValue(new Error('IPC 失败'))

    await expect(useConfigStore.getState().loadConfig()).resolves.toBeUndefined()

    const state = useConfigStore.getState()
    expect(state.config).toBeNull()
    expect(state.error).toContain('IPC 失败')
    expect(state.loading).toBe(false)
  })

  it('updateConfig 保存成功后同步 config', async () => {
    const cfg = makeConfig({ api_provider: 'gemini' })
    vi.mocked(saveConfig).mockResolvedValue()

    await useConfigStore.getState().updateConfig(cfg)

    expect(saveConfig).toHaveBeenCalledWith(cfg)
    expect(useConfigStore.getState().config).toEqual(cfg)
    expect(useConfigStore.getState().error).toBeNull()
  })

  it('updateConfig 失败时写入 error 且不抛出，config 不被覆盖', async () => {
    const old = makeConfig()
    useConfigStore.setState({ config: old })
    vi.mocked(saveConfig).mockRejectedValue(new Error('保存失败'))

    await useConfigStore.getState().updateConfig(makeConfig({ model: 'gpt-5' }))

    const state = useConfigStore.getState()
    expect(state.config).toEqual(old)
    expect(state.error).toContain('保存失败')
  })

  it('loadApiKey 成功时填充 apiKey', async () => {
    vi.mocked(invoke).mockResolvedValue('sk-test')

    await useConfigStore.getState().loadApiKey()

    expect(invoke).toHaveBeenCalledWith('get_api_key')
    expect(useConfigStore.getState().apiKey).toBe('sk-test')
  })

  it('loadApiKey 失败时写入 error 而不抛出', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('keyring 不可用'))

    await useConfigStore.getState().loadApiKey()

    expect(useConfigStore.getState().error).toContain('keyring 不可用')
  })

  it('setApiKey 成功时写入 keyring 并更新 apiKey', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined)

    await useConfigStore.getState().setApiKey('sk-new')

    expect(invoke).toHaveBeenCalledWith('set_api_key', { key: 'sk-new' })
    expect(useConfigStore.getState().apiKey).toBe('sk-new')
  })

  it('setApiKey 失败时向上抛出异常（供设置页提示）', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('keyring 写入失败'))

    await expect(useConfigStore.getState().setApiKey('sk-bad')).rejects.toThrow('keyring 写入失败')
    expect(useConfigStore.getState().apiKey).toBeNull()
  })
})