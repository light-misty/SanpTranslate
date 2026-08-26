import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import ControlBar from './ControlBar'

// 所有断言基于中文文案，统一将界面语言切换为 zh-CN
beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
})

/** 渲染 ControlBar 的便捷封装 */
function renderBar(props: {
  translateStatus: 'idle' | 'translating' | 'done' | 'error'
  showOriginal?: boolean
  errorMessage?: string
  fromCache?: boolean
  ocrLoading?: boolean
}) {
  const handlers = {
    onTranslate: vi.fn(),
    onRetranslate: vi.fn(),
    onCopyOriginal: vi.fn(),
    onCopyTranslation: vi.fn(),
    onToggleOriginal: vi.fn(),
    onOcrCopyOriginal: vi.fn(),
  }
  render(
    <ControlBar
      translateStatus={props.translateStatus}
      showOriginal={props.showOriginal ?? false}
      hasTranslation={props.translateStatus === 'done'}
      errorMessage={props.errorMessage}
      fromCache={props.fromCache}
      ocrLoading={props.ocrLoading}
      {...handlers}
    />
  )
  return handlers
}

describe('ControlBar', () => {
  it('idle 状态显示"翻译"与"复制原文"按钮，点击触发对应回调', async () => {
    const user = userEvent.setup()
    const handlers = renderBar({ translateStatus: 'idle' })

    // 渲染后等待 react-i18next 异步初始化完成
    await waitFor(() => expect(screen.getByText('翻译')).toBeDefined())
    expect(screen.getByText('复制原文')).toBeDefined()

    await user.click(screen.getByText('翻译'))
    expect(handlers.onTranslate).toHaveBeenCalledTimes(1)

    await user.click(screen.getByText('复制原文'))
    expect(handlers.onOcrCopyOriginal).toHaveBeenCalledTimes(1)
  })

  it('translating 状态显示禁用的"翻译中..."按钮', async () => {
    renderBar({ translateStatus: 'translating' })

    const btn = await screen.findByText('翻译中...')
    expect(btn).toBeDefined()
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('done 状态显示复制/重新翻译/切换按钮组，缓存命中时显示提示', async () => {
    renderBar({ translateStatus: 'done', fromCache: true })

    expect(await screen.findByText('复制原文')).toBeDefined()
    expect(screen.getByText('复制译文')).toBeDefined()
    expect(screen.getByText('重新翻译')).toBeDefined()
    // showOriginal=false 时切换按钮为"显示原文"
    expect(screen.getByText('显示原文')).toBeDefined()
    expect(screen.getByText('已从历史缓存获取')).toBeDefined()
  })

  it('done 状态且 showOriginal=true 时切换按钮显示"显示译文"', async () => {
    renderBar({ translateStatus: 'done', showOriginal: true })

    await waitFor(() => expect(screen.getByText('显示译文')).toBeDefined())
  })

  it('done 状态点击"复制译文"与"重新翻译"触发对应回调', async () => {
    const user = userEvent.setup()
    const handlers = renderBar({ translateStatus: 'done' })

    await user.click(await screen.findByText('复制译文'))
    expect(handlers.onCopyTranslation).toHaveBeenCalledTimes(1)

    await user.click(screen.getByText('重新翻译'))
    expect(handlers.onRetranslate).toHaveBeenCalledTimes(1)
  })

  it('error 状态显示"重新翻译"按钮与错误信息', async () => {
    renderBar({ translateStatus: 'error', errorMessage: 'API 密钥无效' })

    expect(await screen.findByText('重新翻译')).toBeDefined()
    expect(screen.getByText('API 密钥无效')).toBeDefined()
  })
})