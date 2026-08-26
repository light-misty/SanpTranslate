import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry, HistoryListItem } from '@/utils/tauri'

// 顶层 mock：命令层与日志层
vi.mock('@/utils/tauri', () => ({
  getHistoryList: vi.fn(),
  getHistoryDetail: vi.fn(),
  deleteHistory: vi.fn(),
  clearHistory: vi.fn(),
  writeClipboardText: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { useHistoryStore } from './historyStore'
import {
  getHistoryList,
  getHistoryDetail,
  deleteHistory as deleteHistoryCmd,
  clearHistory as clearHistoryCmd,
  writeClipboardText,
} from '@/utils/tauri'
import { logger } from '@/utils/logger'

/** 构造一条历史列表条目 */
const makeItem = (id: number, overrides: Partial<HistoryListItem> = {}): HistoryListItem => ({
  id,
  thumbnail: null,
  summary: `摘要${id}`,
  created_at: '2026-08-01T10:00:00Z',
  ...overrides,
})

/** 构造一条历史详情 */
const makeDetail = (id: number): HistoryEntry => ({
  id,
  image_data: 'data:image/png;base64,AAAA',
  thumbnail: null,
  ocr_text: '原文',
  translated_text: '译文',
  created_at: '2026-08-01T10:00:00Z',
})

describe('historyStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHistoryStore.setState({ historyList: [], loading: false, currentDetail: null })
  })

  it('loadHistory 成功时填充列表', async () => {
    const items = [makeItem(1), makeItem(2)]
    vi.mocked(getHistoryList).mockResolvedValue(items)

    await useHistoryStore.getState().loadHistory()

    expect(getHistoryList).toHaveBeenCalledWith(50)
    expect(useHistoryStore.getState().historyList).toEqual(items)
    expect(logger.info).toHaveBeenCalled()
  })

  it('loadHistory 失败时抛出异常并记录错误日志', async () => {
    vi.mocked(getHistoryList).mockRejectedValue(new Error('数据库错误'))

    await expect(useHistoryStore.getState().loadHistory()).rejects.toThrow('数据库错误')
    expect(logger.error).toHaveBeenCalled()
  })

  it('loadDetail 成功时设置 currentDetail', async () => {
    const detail = makeDetail(1)
    vi.mocked(getHistoryDetail).mockResolvedValue(detail)

    await useHistoryStore.getState().loadDetail(1)

    expect(useHistoryStore.getState().currentDetail).toEqual(detail)
  })

  it('deleteHistory 成功后从列表移除并清空对应详情', async () => {
    vi.mocked(deleteHistoryCmd).mockResolvedValue(true)
    useHistoryStore.setState({
      historyList: [makeItem(1), makeItem(2)],
      currentDetail: makeDetail(1),
    })

    await useHistoryStore.getState().deleteHistory(1)

    expect(deleteHistoryCmd).toHaveBeenCalledWith(1)
    const state = useHistoryStore.getState()
    expect(state.historyList.map((i) => i.id)).toEqual([2])
    expect(state.currentDetail).toBeNull()
  })

  it('deleteHistory 删除非当前详情时保留 currentDetail', async () => {
    vi.mocked(deleteHistoryCmd).mockResolvedValue(true)
    useHistoryStore.setState({
      historyList: [makeItem(1), makeItem(2)],
      currentDetail: makeDetail(2),
    })

    await useHistoryStore.getState().deleteHistory(1)

    const state = useHistoryStore.getState()
    expect(state.historyList.map((i) => i.id)).toEqual([2])
    expect(state.currentDetail?.id).toBe(2)
  })

  it('deleteHistory 失败时抛出异常', async () => {
    vi.mocked(deleteHistoryCmd).mockRejectedValue(new Error('删除失败'))

    await expect(useHistoryStore.getState().deleteHistory(1)).rejects.toThrow('删除失败')
  })

  it('clearHistory 成功时清空列表与详情', async () => {
    vi.mocked(clearHistoryCmd).mockResolvedValue(true)
    useHistoryStore.setState({
      historyList: [makeItem(1), makeItem(2)],
      currentDetail: makeDetail(1),
    })

    await useHistoryStore.getState().clearHistory()

    const state = useHistoryStore.getState()
    expect(state.historyList).toEqual([])
    expect(state.currentDetail).toBeNull()
  })

  it('copyTranslation 调用剪贴板写入命令', async () => {
    vi.mocked(writeClipboardText).mockResolvedValue()

    await useHistoryStore.getState().copyTranslation('要复制的译文')

    expect(writeClipboardText).toHaveBeenCalledWith('要复制的译文')
    expect(logger.info).toHaveBeenCalled()
  })
})