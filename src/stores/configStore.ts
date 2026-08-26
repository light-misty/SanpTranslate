import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { getConfig, saveConfig, type AppConfig } from '@/utils/tauri'

/** 配置 store 状态与 actions */
interface ConfigState {
  config: AppConfig | null
  loading: boolean
  error: string | null
  apiKey: string | null
  loadConfig: () => Promise<void>
  updateConfig: (newConfig: AppConfig) => Promise<void>
  loadApiKey: () => Promise<void>
  setApiKey: (key: string) => Promise<void>
}

/** 应用配置状态管理 */
export const useConfigStore = create<ConfigState>()((set) => ({
  config: null,
  loading: false,
  error: null,
  apiKey: null,

  /** 从后端加载配置 */
  async loadConfig() {
    set({ loading: true, error: null })
    try {
      const config = await getConfig()
      set({ config })
    } catch (e) {
      set({ error: String(e) })
    } finally {
      set({ loading: false })
    }
  },

  /** 更新并保存配置到后端 */
  async updateConfig(newConfig: AppConfig) {
    set({ loading: true, error: null })
    try {
      await saveConfig(newConfig)
      set({ config: newConfig })
    } catch (e) {
      set({ error: String(e) })
    } finally {
      set({ loading: false })
    }
  },

  /** 从后端 keyring 获取 API 密钥 */
  async loadApiKey() {
    try {
      const key = await invoke<string | null>('get_api_key')
      set({ apiKey: key })
    } catch (e) {
      set({ error: String(e) })
    }
  },

  /** 设置 API 密钥到后端 keyring，失败时抛出异常以便调用方处理 */
  async setApiKey(key: string) {
    await invoke('set_api_key', { key })
    set({ apiKey: key })
  },
}))