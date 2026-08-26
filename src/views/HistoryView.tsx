import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { App as AntdApp, Button, Modal, Spin } from 'antd'
import { useHistoryStore } from '@/stores/historyStore'
import { writeClipboardText } from '@/utils/tauri'
import type { HistoryListItem } from '@/utils/tauri'
import { logger } from '@/utils/logger'
import HistoryItem from '@/components/HistoryItem'
import './HistoryView.css'

const TAG = 'HistoryView'

/** 历史记录页面：列表、详情弹窗与图片放大预览 */
export default function HistoryView() {
  const { t } = useTranslation()

  // antd App 上下文提供的 message / modal（避免脱离主题）
  const { message, modal } = AntdApp.useApp()

  // 订阅状态
  const historyList = useHistoryStore((s) => s.historyList)
  const loading = useHistoryStore((s) => s.loading)
  const currentDetail = useHistoryStore((s) => s.currentDetail)

  // actions（取稳定的 store 函数，避免闭包过期）
  const {
    loadHistory,
    loadDetail,
    deleteHistory,
    clearHistory,
    copyTranslation,
  } = useHistoryStore.getState()

  // 详情弹窗状态
  const [showDetail, setShowDetail] = useState(false)
  // 图片放大预览状态
  const [showImagePreview, setShowImagePreview] = useState(false)

  // 详情缩略图 URL（文本翻译记录无缩略图）
  const detailThumbnailUrl = currentDetail?.thumbnail
    ? `data:image/jpeg;base64,${currentDetail.thumbnail}`
    : ''

  // 详情原图 URL（用于放大预览，文本翻译记录无原图）
  const detailImageUrl = currentDetail?.image_data
    ? `data:image/png;base64,${currentDetail.image_data}`
    : ''

  /** 查看详情 */
  async function onDetail(entry: HistoryListItem) {
    try {
      await loadDetail(entry.id)
      setShowDetail(true)
    } catch (err) {
      message.error(t('history.detailLoadFailed'))
      logger.error(TAG, `加载详情失败: ${err}`, err)
    }
  }

  /** 复制翻译文本 */
  async function onCopy(entry: HistoryListItem) {
    try {
      // 需要获取详情才能拿到完整翻译文本
      await loadDetail(entry.id)
      const detail = useHistoryStore.getState().currentDetail
      if (detail?.translated_text) {
        await copyTranslation(detail.translated_text)
        message.success(t('history.copySuccess'))
      }
    } catch (err) {
      message.error(t('history.copyFailed'))
      logger.error(TAG, `复制失败: ${err}`, err)
    }
  }

  /** 删除单条记录 */
  function onDelete(id: number) {
    modal.confirm({
      title: t('common.confirm'),
      content: t('history.confirmDelete'),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteHistory(id)
          message.success(t('history.deleted'))
        } catch (err) {
          message.error(t('history.deleteFailed'))
          logger.error(TAG, `删除失败: ${err}`, err)
        }
      },
    })
  }

  /** 清空全部历史 */
  function onClearAll() {
    modal.confirm({
      title: t('common.confirm'),
      content: t('history.confirmClearAll'),
      okText: t('history.clearAll'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await clearHistory()
          message.success(t('history.cleared'))
        } catch (err) {
          message.error(t('history.clearFailed'))
          logger.error(TAG, `清空失败: ${err}`, err)
        }
      },
    })
  }

  /** 复制详情中的原文 */
  async function onCopyDetailOriginal() {
    const detail = useHistoryStore.getState().currentDetail
    if (!detail?.ocr_text) return
    try {
      await writeClipboardText(detail.ocr_text)
      message.success(t('history.copySuccess'))
    } catch (err) {
      message.error(t('history.copyFailed'))
      logger.error(TAG, `复制原文失败: ${err}`, err)
    }
  }

  /** 复制详情中的译文 */
  async function onCopyDetailTranslation() {
    const detail = useHistoryStore.getState().currentDetail
    if (!detail?.translated_text) return
    try {
      await writeClipboardText(detail.translated_text)
      message.success(t('history.copySuccess'))
    } catch (err) {
      message.error(t('history.copyFailed'))
      logger.error(TAG, `复制译文失败: ${err}`, err)
    }
  }

  /** 删除详情中的记录 */
  function onDeleteDetail() {
    const detail = useHistoryStore.getState().currentDetail
    if (!detail) return
    const id = detail.id
    modal.confirm({
      title: t('common.confirm'),
      content: t('history.confirmDelete'),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteHistory(id)
          setShowDetail(false)
          message.success(t('history.deleted'))
        } catch (err) {
          message.error(t('history.deleteFailed'))
          logger.error(TAG, `删除失败: ${err}`, err)
        }
      },
    })
  }

  // 页面加载时获取历史记录
  useEffect(() => {
    ;(async () => {
      try {
        await loadHistory()
        logger.info(TAG, '历史记录页面初始化完成')
      } catch (err) {
        message.error(t('history.loadFailed'))
        logger.error(TAG, `加载历史记录失败: ${err}`, err)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="history-container">
      {/* 头部 */}
      <div className="history-header">
        <h2 className="history-title">{t('history.title')}</h2>
        {historyList.length > 0 && (
          <Button danger size="small" ghost onClick={onClearAll}>
            {t('history.clearAll')}
          </Button>
        )}
      </div>

      {/* 内容区域 */}
      <Spin spinning={loading}>
        {/* 空状态 */}
        {!loading && historyList.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p>{t('history.empty')}</p>
          </div>
        ) : (
          /* 历史列表 */
          <div className="history-list">
            {historyList.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                onDetail={onDetail}
                onCopy={onCopy}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </Spin>

      {/* 详情弹窗 */}
      <Modal
        open={showDetail}
        onCancel={() => setShowDetail(false)}
        title={t('history.detail')}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button danger ghost onClick={onDeleteDetail}>
              {t('common.delete')}
            </Button>
          </div>
        }
        style={{ maxWidth: 520, width: '90%' }}
      >
        {currentDetail && (
          <div className="detail-content">
            {/* 缩略图（有图片时显示，点击放大） */}
            {detailThumbnailUrl && (
              <div
                className="detail-thumbnail-wrapper"
                onClick={() => setShowImagePreview(true)}
                style={{ cursor: 'pointer' }}
              >
                <img src={detailThumbnailUrl} className="detail-thumbnail" draggable={false} alt="" />
              </div>
            )}

            {/* 原文（带复制按钮） */}
            {currentDetail.ocr_text && (
              <div className="detail-section">
                <div className="detail-label-row">
                  <span className="detail-label">{t('history.original')}</span>
                  <Button
                    type="text"
                    size="small"
                    onClick={onCopyDetailOriginal}
                    style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                  >
                    {t('common.copy')}
                  </Button>
                </div>
                <div className="detail-text">{currentDetail.ocr_text}</div>
              </div>
            )}

            {/* 译文（带复制按钮） */}
            <div className="detail-section">
              <div className="detail-label-row">
                <span className="detail-label">{t('history.translation')}</span>
                <Button
                  type="text"
                  size="small"
                  onClick={onCopyDetailTranslation}
                  style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                >
                  {t('common.copy')}
                </Button>
              </div>
              <div className="detail-text">{currentDetail.translated_text}</div>
            </div>

            {/* 时间 */}
            <div className="detail-time">{currentDetail.created_at}</div>
          </div>
        )}
      </Modal>

      {/* 图片放大预览弹窗 */}
      <Modal
        open={showImagePreview}
        onCancel={() => setShowImagePreview(false)}
        destroyOnClose
        footer={null}
        style={{ maxWidth: '90vw', maxHeight: '90vh', width: 'auto', padding: 8 }}
        styles={{
          content: { background: 'transparent', boxShadow: 'none' },
          body: { backdropFilter: 'blur(4px)' },
        }}
      >
        {detailImageUrl && (
          <img
            src={detailImageUrl}
            style={{
              width: 'auto',
              height: 'auto',
              maxWidth: '85vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: 8,
              display: 'block',
            }}
            draggable={false}
            alt=""
            onClick={() => setShowImagePreview(false)}
          />
        )}
      </Modal>
    </div>
  )
}