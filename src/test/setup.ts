import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Tauri 插件模块在生产环境由 Tauri 运行时注入，Node/jsdom 测试环境中不可用。
// 在此统一兜底 mock，避免 logger 等模块在 import 时抛错。
vi.mock('@tauri-apps/plugin-log', () => ({
  debug: () => Promise.resolve(),
  info: () => Promise.resolve(),
  warn: () => Promise.resolve(),
  error: () => Promise.resolve(),
}))

vi.mock('@tauri-apps/plugin-autostart', () => ({
  enable: () => Promise.resolve(),
  disable: () => Promise.resolve(),
  isEnabled: () => Promise.resolve(false),
}))

// @testing-library/react v16 在未启用 vitest globals 时不会自动清理 DOM，
// 这里显式注册 afterEach cleanup，保证每个用例之间渲染环境隔离。
afterEach(() => {
  cleanup()
})