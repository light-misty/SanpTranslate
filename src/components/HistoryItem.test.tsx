import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import i18n from '@/i18n'
import HistoryItem from './HistoryItem'
import type { HistoryListItem } from '@/utils/tauri'

/** 渲染 HistoryItem；entry 的 thumbnail 决定是否有缩略图 */
function setup(entry: HistoryListItem) {
  const onDetail = vi.fn()
  const onCopy = vi.fn()
  const onDelete = vi.fn()
  render(<HistoryItem entry={entry} onDetail={onDetail} onCopy={onCopy} onDelete={onDelete} />)
  return { onDetail, onCopy, onDelete }
}

const baseEntry: HistoryListItem = {
  id: 1,
  summary: 'Hello world',
  created_at: '2026-08-01T10:00:00Z',
}

describe('HistoryItem', () => {
  it('有缩略图时渲染为 jpeg data URI', async () => {
    setup({ ...baseEntry, thumbnail: 'abcd1234' })

    const img = await waitFor(() => document.querySelector('.thumbnail')) as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toBe('data:image/jpeg;base64,abcd1234')
  })

  it('无缩略图时渲染文件占位图标', async () => {
    setup({ ...baseEntry, thumbnail: null })

    await waitFor(() => expect(document.querySelector('.thumbnail-placeholder svg')).toBeTruthy())
  })

  it('展示摘要与时间', async () => {
    setup({ ...baseEntry, thumbnail: null })

    expect(await screen.findByText('Hello world')).toBeDefined()
    expect(screen.getByText('2026-08-01T10:00:00Z')).toBeDefined()
  })

  it('点击条目触发 onDetail', async () => {
    const { onDetail } = setup({ ...baseEntry, thumbnail: null })

    fireEvent.click(document.querySelector('.history-item') as HTMLElement)

    expect(onDetail).toHaveBeenCalledTimes(1)
    expect(onDetail).toHaveBeenCalledWith(expect.objectContaining({ id: baseEntry.id, summary: baseEntry.summary }))
  })

  it('点击复制按钮仅触发 onCopy，不冒泡触发 onDetail', async () => {
    const { onDetail, onCopy } = setup({ ...baseEntry, thumbnail: null })

    fireEvent.click(document.querySelector('.action-btn') as HTMLElement)

    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ id: baseEntry.id, summary: baseEntry.summary }))
    expect(onDetail).not.toHaveBeenCalled()
  })

  it('点击删除按钮触发 onDelete 且不冒泡', async () => {
    const { onDetail, onDelete } = setup({ ...baseEntry, thumbnail: null })

    const deleteBtn = document.querySelector('.action-btn-danger') as HTMLElement
    fireEvent.click(deleteBtn)

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(baseEntry.id)
    expect(onDetail).not.toHaveBeenCalled()
  })
})