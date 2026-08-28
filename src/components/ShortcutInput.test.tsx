import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import i18n from '@/i18n'
import ShortcutInput from './ShortcutInput'

// 记录 mock 句柄与事件回调队列（vi.hoisted 保证 mock 工厂提升后仍可引用）
const { shortcutRecordListeners, mocks } = vi.hoisted(() => ({
  shortcutRecordListeners: [] as ((payload: string) => void)[],
  mocks: {
    checkShortcutConflict: vi.fn(() => Promise.resolve(false)),
    setShortcutRecording: vi.fn(() => Promise.resolve()),
    onShortcutRecord: vi.fn((cb: (payload: string) => void) => {
      shortcutRecordListeners.push(cb)
      return Promise.resolve(() => {})
    }),
  },
}))

// utils/tauri 的命令绑定依赖 Tauri 运行时，Node/jsdom 测试环境中 mock 掉
vi.mock('@/utils/tauri', () => ({
  checkShortcutConflict: mocks.checkShortcutConflict,
  setShortcutRecording: mocks.setShortcutRecording,
  onShortcutRecord: mocks.onShortcutRecord,
}))

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
  vi.clearAllMocks()
})

describe('ShortcutInput', () => {
  it('有值时展示格式化后的快捷键（Ctrl + Alt + L）', async () => {
    render(<ShortcutInput value="Ctrl+Alt+L" onChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Ctrl + Alt + L')).toBeDefined())
  })

  it('无值时展示占位文案', async () => {
    render(<ShortcutInput value="" placeholder="点击设置快捷键" onChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('点击设置快捷键')).toBeDefined())
  })

  it('聚焦进入录制后，按下修饰键+普通键组合输出后端格式快捷键', async () => {
    const onChange = vi.fn()
    const { container } = render(<ShortcutInput value="" onChange={onChange} />)

    const input = container.querySelector('.shortcut-input') as HTMLElement
    fireEvent.focus(input)
    expect(screen.getByText('请按下快捷键...')).toBeDefined()

    fireEvent.keyDown(input, { code: 'ControlLeft' })
    fireEvent.keyDown(input, { code: 'AltLeft' })
    fireEvent.keyDown(input, { code: 'KeyK' })
    fireEvent.keyUp(input, { code: 'ControlLeft' })
    fireEvent.keyUp(input, { code: 'AltLeft' })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('Ctrl+Alt+K')
  })

  it('Meta 修饰键映射为 Win', async () => {
    const onChange = vi.fn()
    const { container } = render(<ShortcutInput value="" onChange={onChange} />)

    const input = container.querySelector('.shortcut-input') as HTMLElement
    fireEvent.focus(input)
    fireEvent.keyDown(input, { code: 'MetaLeft' })
    fireEvent.keyDown(input, { code: 'Digit1' })

    expect(onChange).toHaveBeenCalledWith('Win+1')
  })

  it('无修饰键时普通键不输出（至少需要一个修饰键）', async () => {
    const onChange = vi.fn()
    const { container } = render(<ShortcutInput value="" onChange={onChange} />)

    const input = container.querySelector('.shortcut-input') as HTMLElement
    fireEvent.focus(input)
    fireEvent.keyDown(input, { code: 'KeyA' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('Escape 键取消录制且不输出快捷键', async () => {
    const onChange = vi.fn()
    const { container } = render(<ShortcutInput value="" onChange={onChange} />)

    const input = container.querySelector('.shortcut-input') as HTMLElement
    fireEvent.focus(input)
    expect(screen.getByText('请按下快捷键...')).toBeDefined()

    fireEvent.keyDown(input, { code: 'Escape' })

    // 取消录制后回到占位展示
    await waitFor(() => expect(screen.queryByText('请按下快捷键...')).toBeNull())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('失焦（blur）后退出录制状态', async () => {
    const { container } = render(<ShortcutInput value="" onChange={vi.fn()} />)

    const input = container.querySelector('.shortcut-input') as HTMLElement
    fireEvent.focus(input)
    expect(screen.getByText('请按下快捷键...')).toBeDefined()

    fireEvent.blur(input)
    await waitFor(() => expect(screen.queryByText('请按下快捷键...')).toBeNull())
  })

  it('录制中收到 shortcut-record 事件时回填值并停止录制', async () => {
    const onChange = vi.fn()
    const { container } = render(<ShortcutInput value="" onChange={onChange} />)

    const input = container.querySelector('.shortcut-input') as HTMLElement
    fireEvent.focus(input)
    expect(screen.getByText('请按下快捷键...')).toBeDefined()

    // 模拟后端转发的已注册快捷键事件（该组合被全局热键劫持，WebView 收不到 keydown）
    const listener = shortcutRecordListeners[shortcutRecordListeners.length - 1]
    listener('Ctrl+Alt+1')

    expect(onChange).toHaveBeenCalledWith('Ctrl+Alt+1')
    await waitFor(() => expect(screen.queryByText('请按下快捷键...')).toBeNull())
  })

  it('不在录制状态时忽略 shortcut-record 事件', async () => {
    const onChange = vi.fn()
    render(<ShortcutInput value="" onChange={onChange} />)

    const listener = shortcutRecordListeners[shortcutRecordListeners.length - 1]
    listener('Ctrl+Alt+1')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('聚焦时开启快捷键录制状态，结束录制后关闭', async () => {
    const { container } = render(<ShortcutInput value="" onChange={vi.fn()} />)

    const input = container.querySelector('.shortcut-input') as HTMLElement
    fireEvent.focus(input)
    await waitFor(() => expect(mocks.setShortcutRecording).toHaveBeenCalledWith(true))

    fireEvent.blur(input)
    await waitFor(() => expect(mocks.setShortcutRecording).toHaveBeenCalledWith(false))
  })

  it('录制中组件卸载后复位后端录制状态（避免窗口关闭残留）', async () => {
    const { container, unmount } = render(<ShortcutInput value="" onChange={vi.fn()} />)

    const input = container.querySelector('.shortcut-input') as HTMLElement
    fireEvent.focus(input)
    await waitFor(() => expect(mocks.setShortcutRecording).toHaveBeenCalledWith(true))

    vi.clearAllMocks()
    unmount()
    await waitFor(() => expect(mocks.setShortcutRecording).toHaveBeenCalledWith(false))
  })
})