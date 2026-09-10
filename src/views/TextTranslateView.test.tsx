import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import i18n from '@/i18n'
import TextTranslateView from './TextTranslateView'
import * as tauri from '@/utils/tauri'

// 文本翻译窗口视图依赖 Tauri 窗口运行时，Node/jsdom 测试环境中 mock 掉
const { mockWindow } = vi.hoisted(() => ({
  mockWindow: {
    destroy: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mockWindow,
}))

// @/utils/tauri 的命令绑定依赖 Tauri 运行时，Node/jsdom 测试环境中 mock 掉
vi.mock('@/utils/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/tauri')>()
  return {
    ...actual,
    getConfig: vi.fn(),
    translateText: vi.fn(),
    writeClipboardText: vi.fn(),
  }
})

const mockedGetConfig = vi.mocked(tauri.getConfig)
const mockedTranslateText = vi.mocked(tauri.translateText)

/** 构造最小 AppConfig 供 getConfig 返回 */
function makeConfig() {
  return {
    quick_fills: [],
    shortcuts: {
      capture: 'Ctrl+Alt+L',
      pin_clipboard: 'Ctrl+Alt+P',
      text_translate: 'Ctrl+Alt+M',
    },
    api_provider: 'openai',
    api_base_url: '',
    model: '',
    target_language: 'zh-CN',
    language: 'zh-CN',
    ocr_language: 'auto',
    auto_update: false,
  } as tauri.AppConfig
}

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
  vi.clearAllMocks()
  mockedGetConfig.mockResolvedValue(makeConfig())
  mockedTranslateText.mockResolvedValue({ translated_text: '', from_cache: false })
})

describe('TextTranslateView', () => {
  it('初始渲染输入框，且不显示译文面板', async () => {
    render(<TextTranslateView />)

    // 输入框存在，占位符为快捷键提示
    expect(await screen.findByPlaceholderText('Ctrl + Enter 快捷翻译')).toBeDefined()
    // 初始状态下不应渲染译文面板
    expect(document.querySelector('.translation-panel')).toBeNull()
  })

  it('翻译完成后在面板中显示译文', async () => {
    mockedTranslateText.mockResolvedValue({ translated_text: '你好，世界', from_cache: false })

    render(<TextTranslateView />)
    const input = (await screen.findByPlaceholderText('Ctrl + Enter 快捷翻译')) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'Hello, world' } })
    fireEvent.click(screen.getByText('翻译'))

    // 译文出现在面板中
    await waitFor(() => expect(screen.getByText('你好，世界')).toBeDefined())
    expect(document.querySelector('.translation-panel')).not.toBeNull()
  })

  it('按 Esc 键关闭窗口（销毁当前 Tauri 窗口）', async () => {
    render(<TextTranslateView />)
    await screen.findByPlaceholderText('Ctrl + Enter 快捷翻译')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(mockWindow.destroy).toHaveBeenCalledTimes(1))
  })

  it('双击输入框关闭窗口（销毁当前 Tauri 窗口）', async () => {
    render(<TextTranslateView />)
    const input = (await screen.findByPlaceholderText('Ctrl + Enter 快捷翻译')) as HTMLTextAreaElement

    fireEvent.doubleClick(input)

    await waitFor(() => expect(mockWindow.destroy).toHaveBeenCalledTimes(1))
  })

  it('翻译失败时显示错误信息，不显示译文面板', async () => {
    mockedTranslateText.mockRejectedValue('翻译服务不可用')

    render(<TextTranslateView />)
    const input = (await screen.findByPlaceholderText('Ctrl + Enter 快捷翻译')) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByText('翻译'))

    // 错误提示可见，译文面板不出现
    await waitFor(() => expect(screen.getByText('翻译服务不可用')).toBeDefined())
    expect(document.querySelector('.translation-panel')).toBeNull()
  })
})
