import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import i18n from '@/i18n'
import QuickFillView, { QUICK_FILL_TEMPLATES } from './QuickFillView'
import * as tauri from '@/utils/tauri'

// antd message 在 jsdom 环境依赖 matchMedia，这里 mock 掉以可控地断言提示调用
const { antdMessage } = vi.hoisted(() => ({
  antdMessage: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}))
vi.mock('antd', () => ({ message: antdMessage }))

// @/utils/tauri 的命令绑定依赖 Tauri 运行时，Node/jsdom 测试环境中 mock 掉
vi.mock('@/utils/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/tauri')>()
  return {
    ...actual,
    getConfig: vi.fn(),
    saveQuickFills: vi.fn(),
    checkShortcutConflict: vi.fn().mockResolvedValue(false),
    setShortcutRecording: vi.fn().mockResolvedValue(undefined),
    onShortcutRecord: vi.fn().mockResolvedValue(() => {}),
  }
})

const mockedGetConfig = vi.mocked(tauri.getConfig)
const mockedSaveQuickFills = vi.mocked(tauri.saveQuickFills)

/** 构造最小 AppConfig 供 getConfig 返回 */
function makeConfig(quickFills: tauri.QuickFillEntry[] = []) {
  return {
    quick_fills: quickFills,
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
  mockedSaveQuickFills.mockResolvedValue()
})

describe('QuickFillView', () => {
  it('加载配置后渲染已有条目（快捷键与填充文本）', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig([{ shortcut: 'Ctrl+Alt+1', text: '你好世界' }]))

    render(<QuickFillView />)

    expect(await screen.findByText('Ctrl + Alt + 1')).toBeDefined()
    expect(screen.getByDisplayValue('你好世界')).toBeDefined()
  })

  it('无条目时显示空状态提示', async () => {
    render(<QuickFillView />)

    await waitFor(() => expect(screen.queryByText('暂无配置，点击下方按钮添加')).toBeDefined())
  })

  it('点击添加条目后出现新的条目（可删除）', async () => {
    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')
    fireEvent.click(screen.getByText('添加条目'))

    expect(document.querySelectorAll('.quickfill-remove-btn')).toHaveLength(1)
  })

  it('添加条目按钮位于页面头部右侧', async () => {
    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')
    const addBtn = screen.getByText('添加条目').closest('button') as HTMLElement
    const header = document.querySelector('.quickfill-header')
    expect(header?.contains(addBtn)).toBe(true)
  })

  it('删除条目后该条目消失', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig([{ shortcut: 'Ctrl+Alt+1', text: 'a' }]))

    render(<QuickFillView />)

    await screen.findByText('Ctrl + Alt + 1')
    fireEvent.click(document.querySelector('.quickfill-remove-btn') as HTMLElement)
    await waitFor(() => expect(screen.queryByText('Ctrl + Alt + 1')).toBeNull())
  })

  it('修改填充文本后自动保存会携带最新条目', async () => {
    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')
    fireEvent.click(screen.getByText('添加条目'))
    const textarea = document.querySelector('.quickfill-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '填充内容' } })

    // 防抖 500ms 后自动保存
    await waitFor(() => expect(mockedSaveQuickFills).toHaveBeenCalled(), { timeout: 2000 })
    expect(mockedSaveQuickFills.mock.calls[0][0]).toEqual([{ shortcut: '', text: '填充内容' }])
  })

  it('页面不再显示保存配置按钮（自动保存）', async () => {
    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')
    expect(screen.queryByText('保存配置')).toBeNull()
  })

  it('两个条目快捷键相同时自动保存被拦截并给出提示', async () => {
    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')
    fireEvent.click(screen.getByText('添加条目'))
    fireEvent.click(screen.getByText('添加条目'))

    const inputs = document.querySelectorAll('.shortcut-input') as NodeListOf<HTMLElement>
    // 第一条目录制 Ctrl+Alt+1
    fireEvent.focus(inputs[0])
    fireEvent.keyDown(inputs[0], { code: 'ControlLeft' })
    fireEvent.keyDown(inputs[0], { code: 'AltLeft' })
    fireEvent.keyDown(inputs[0], { code: 'Digit1' })
    // 第二条目录制相同的 Ctrl+Alt+1
    fireEvent.focus(inputs[1])
    fireEvent.keyDown(inputs[1], { code: 'ControlLeft' })
    fireEvent.keyDown(inputs[1], { code: 'AltLeft' })
    fireEvent.keyDown(inputs[1], { code: 'Digit1' })

    // 修改文本触发一次明确的 entries 变化，进入防抖保存
    const textarea = document.querySelector('.quickfill-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'x' } })

    await waitFor(
      () =>
        expect(antdMessage.warning).toHaveBeenCalledWith(
          expect.stringContaining('使用了相同的快捷键')
        ),
      { timeout: 2000 }
    )
    expect(mockedSaveQuickFills).not.toHaveBeenCalled()
  })

  it('快捷键与系统主快捷键冲突时自动保存被拦截', async () => {
    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')
    fireEvent.click(screen.getByText('添加条目'))

    // 录制 Ctrl+Alt+L（与 makeConfig 中默认截图快捷键冲突）
    const input = document.querySelector('.shortcut-input') as HTMLElement
    fireEvent.focus(input)
    fireEvent.keyDown(input, { code: 'ControlLeft' })
    fireEvent.keyDown(input, { code: 'AltLeft' })
    fireEvent.keyDown(input, { code: 'KeyL' })

    await waitFor(
      () =>
        expect(antdMessage.warning).toHaveBeenCalledWith(
          expect.stringContaining('主快捷键冲突')
        ),
      { timeout: 2000 }
    )
    expect(mockedSaveQuickFills).not.toHaveBeenCalled()
  })

  it('自动保存失败时显示后端返回的错误提示', async () => {
    mockedSaveQuickFills.mockRejectedValue('快捷键已被占用')

    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')
    fireEvent.click(screen.getByText('添加条目'))
    const textarea = document.querySelector('.quickfill-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'x' } })

    await waitFor(
      () =>
        expect(antdMessage.error).toHaveBeenCalledWith(
          expect.stringContaining('快捷键已被占用')
        ),
      { timeout: 2000 }
    )
  })

  it('渲染内置模板区块（默认未启用）', async () => {
    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')

    // 模板标题与未启用状态可见，开关未勾选
    expect(screen.getByText('创建工作树提示词')).toBeDefined()
    expect(screen.getByText('未启用')).toBeDefined()
    const checkbox = document.querySelector('.quickfill-template-switch input') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('打开页面时不会立即自动保存（仅在用户修改后保存）', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig([{ shortcut: 'Ctrl+Alt+1', text: '原始文本' }]))

    render(<QuickFillView />)

    await screen.findByText('Ctrl + Alt + 1')
    // 等待超过防抖窗口，确认不会因页面打开/加载就覆盖配置
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(mockedSaveQuickFills).not.toHaveBeenCalled()
  })

  it('启用模板后生成可配置条目并自动保存', async () => {
    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')
    const checkbox = document.querySelector('.quickfill-template-switch input') as HTMLInputElement
    fireEvent.click(checkbox)

    // 生成了包含模板文本的条目
    const textarea = document.querySelector('.quickfill-textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    expect(textarea.value).toBe(QUICK_FILL_TEMPLATES[0].text)

    // 自动保存携带该条目
    await waitFor(() => expect(mockedSaveQuickFills).toHaveBeenCalled(), { timeout: 2000 })
    expect(mockedSaveQuickFills.mock.calls[0][0]).toEqual([
      { shortcut: '', text: QUICK_FILL_TEMPLATES[0].text },
    ])
  })

  it('禁用模板后移除对应条目并自动保存', async () => {
    mockedGetConfig.mockResolvedValue(
      makeConfig([{ shortcut: 'Ctrl+Alt+1', text: QUICK_FILL_TEMPLATES[0].text }])
    )

    render(<QuickFillView />)

    await screen.findByText('快捷文本填充')
    const checkbox = document.querySelector('.quickfill-template-switch input') as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    fireEvent.click(checkbox)

    // 条目被移除，列表回到空状态
    expect(screen.getByText('暂无配置，点击下方按钮添加')).toBeDefined()

    // 自动保存携带空条目列表
    await waitFor(() => expect(mockedSaveQuickFills).toHaveBeenCalled(), { timeout: 2000 })
    expect(mockedSaveQuickFills.mock.calls[0][0]).toEqual([])
  })
})