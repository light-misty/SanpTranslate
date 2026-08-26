import { create } from 'zustand'
import {
  getHistoryList,
  getHistoryDetail,
  deleteHistory as deleteHistoryCmd,
  clearHistory as clearHistoryCmd,
  writeClipboardText,
  type HistoryListItem,
  type HistoryEntry,
} from '@/utils/tauri'
import { logger } from '@/utils/logger'

const TAG = 'HistoryStore'

/** 历史记录 store 状态与 actions */
interface HistoryStoreState {
  historyList: HistoryListItem[]
  loading: boolean
  currentDetail: HistoryEntry | null
  loadHistory: () => Promise<void>
  loadDetail: (id: number) => Promise<void>
  deleteHistory: (id: number) => Promise<void>
  clearHistory: () => Promise<void>
  copyTranslation: (text: string) => Promise<void>
}

/** 历史记录状态管理 */
export const useHistoryStore = create<HistoryStoreState>()((set) => ({
  historyList: [],
  loading: false,
  currentDetail: null,

  /** 加载历史记录列表 */
  async loadHistory() {
    set({ loading: true })
    try {
      const list = await getHistoryList(50)
      set({ historyList: list })
      logger.info(TAG, `加载历史记录成功，共 ${list.length} 条`)
    } catch (err) {
      logger.error(TAG, `加载历史记录失败: ${err}`, err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  /** 加载历史记录详情 */
  async loadDetail(id: number) {
    try {
      const detail = await getHistoryDetail(id)
      set({ currentDetail: detail })
      logger.info(TAG, `加载历史详情成功，id=${id}`)
    } catch (err) {
      logger.error(TAG, `加载历史详情失败: id=${id}, error=${err}`, err)
      throw err
    }
  },

  /** 删除指定历史记录 */
  async deleteHistory(id: number) {
    try {
      await deleteHistoryCmd(id)
      // 从列表中移除已删除的条目，并清空被删除条目的详情
      set((state) => ({
        historyList: state.historyList.filter((item) => item.id !== id),
        currentDetail: state.currentDetail?.id === id ? null : state.currentDetail,
      }))
      logger.info(TAG, `删除历史记录成功，id=${id}`)
    } catch (err) {
      logger.error(TAG, `删除历史记录失败: id=${id}, error=${err}`, err)
      throw err
    }
  },

  /** 清空所有历史记录 */
  async clearHistory() {
    try {
      await clearHistoryCmd()
      set({ historyList: [], currentDetail: null })
      logger.info(TAG, '清空所有历史记录成功')
    } catch (err) {
      logger.error(TAG, `清空历史记录失败: ${err}`, err)
      throw err
    }
  },

  /** 复制翻译文本到剪贴板 */
  async copyTranslation(text: string) {
    try {
      await writeClipboardText(text)
      logger.info(TAG, '翻译文本已复制到剪贴板')
    } catch (err) {
      logger.error(TAG, `复制翻译文本失败: ${err}`, err)
      throw err
    }
  },
}))