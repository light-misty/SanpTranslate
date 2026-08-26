import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import i18n from '@/i18n'
import ShortcutInput from './ShortcutInput'

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
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
})