import type { HistoryListItem } from '@/utils/tauri'
import { useTranslation } from 'react-i18next'
import './HistoryItem.css'

/** 历史记录条目组件属性 */
interface HistoryItemProps {
  /** 历史记录条目 */
  entry: HistoryListItem
  /** 查看详情回调 */
  onDetail: (entry: HistoryListItem) => void
  /** 复制翻译文本回调 */
  onCopy: (entry: HistoryListItem) => void
  /** 删除记录回调 */
  onDelete: (id: number) => void
}

/** 历史记录条目组件：展示缩略图、摘要、时间与操作按钮 */
export default function HistoryItem({ entry, onDetail, onCopy, onDelete }: HistoryItemProps) {
  const { t } = useTranslation()

  // 缩略图 URL（Base64 转 data URI，文本翻译记录无缩略图）
  const thumbnailUrl = entry.thumbnail ? `data:image/jpeg;base64,${entry.thumbnail}` : ''

  return (
    <div className="history-item" onClick={() => onDetail(entry)}>
      {/* 缩略图 */}
      <div className="thumbnail-wrapper">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            className="thumbnail"
            draggable={false}
            alt=""
          />
        ) : (
          <div className="thumbnail-placeholder">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="item-content">
        <div className="item-summary">{entry.summary}</div>
        <div className="item-time">{entry.created_at}</div>
      </div>

      {/* 操作按钮 */}
      <div className="item-actions" onClick={(e) => e.stopPropagation()}>
        <button className="action-btn" title={t('common.copy')} onClick={(e) => { e.stopPropagation(); onCopy(entry) }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button className="action-btn action-btn-danger" title={t('common.delete')} onClick={(e) => { e.stopPropagation(); onDelete(entry.id) }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}