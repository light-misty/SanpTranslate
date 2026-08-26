import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MouseEvent as ReactMouseEvent, SyntheticEvent } from 'react'
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window'
import { LogicalSize, LogicalPosition } from '@tauri-apps/api/dpi'
import {
  getPinImage,
  getConfig,
  translateImage,
  ocrImage,
  writeClipboardText,
  type TranslatedBlock,
} from '@/utils/tauri'
import { logger } from '@/utils/logger'
import ControlBar from '@/components/ControlBar'
import './PinView.css'

const TAG = 'PinView'

// 阴影内边距，需与后端 window/mod.rs 中的 PIN_PADDING 保持一致
const PIN_PADDING = 14

/** 贴图窗口视图：展示截图、译文面板与操作控制栏（React 版本，行为与 PinView.vue 逐项等价） */
export default function PinView() {
  const { t } = useTranslation()
  // t 当前本视图无直接界面文案；保留该引用以订阅 i18n 语言变更触发的重渲染
  void t

  const [imageDataUrl, setImageDataUrl] = useState<string>('')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [pinId, setPinId] = useState<string>('')
  const [translateStatus, setTranslateStatus] = useState<'idle' | 'translating' | 'done' | 'error'>('idle')
  const [showOriginal, setShowOriginal] = useState(false)
  const [hasTranslation, setHasTranslation] = useState(false)
  const [translatedBlocks, setTranslatedBlocks] = useState<TranslatedBlock[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [panelHeight, setPanelHeight] = useState<number | null>(null)
  const [shadowStyle, setShadowStyle] = useState('0 1px 5px 1px rgba(0,0,0,0.4)')
  const [logicalImageWidth, setLogicalImageWidth] = useState(0)
  const [logicalImageHeight, setLogicalImageHeight] = useState(0)

  // DOM 引用
  const panelRef = useRef<HTMLDivElement | null>(null)
  const imageAreaRef = useRef<HTMLDivElement | null>(null)
  const leftColumnRef = useRef<HTMLDivElement | null>(null)

  // 非响应式量（跨渲染保持不变，仅用于在回调中读写）
  const initialPanelHeightRef = useRef(0) // 面板初始高度，作为最小高度限制
  const rawBase64DataRef = useRef('') // 保存原始 base64 数据用于翻译
  const mouseDownXRef = useRef(0)
  const mouseDownYRef = useRef(0)
  const hasStartedDragRef = useRef(false)

  // 节流控制：防止高频 setSize 导致 WebKitGTK 内存崩溃
  const RESIZE_THROTTLE_MS = 80
  const resizeThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastResizeTimeRef = useRef(0)
  const pendingResizePanelRef = useRef<boolean | null>(null)

  // 几何状态快照：供节流/防越界闭包读取最新逻辑尺寸、面板高度与加载状态
  const geometrySnap = useRef<{
    logicalImageWidth: number
    logicalImageHeight: number
    imageLoaded: boolean
    panelHeight: number | null
  }>({ logicalImageWidth: 0, logicalImageHeight: 0, imageLoaded: false, panelHeight: null })

  // 各一次性/恢复判定标记（用于规避 React StrictMode 下副作用重复执行）
  const didMountRef = useRef(false)
  const didInitialAdjustRef = useRef(false)
  const pendingMeasureRef = useRef(false)

  // 每个渲染提交后同步几何快照，供异步闭包读取最新值
  useEffect(() => {
    geometrySnap.current = { logicalImageWidth, logicalImageHeight, imageLoaded, panelHeight }
  })

  // 过滤掉空翻译的块，避免在译文面板中显示空白项
  const filteredBlocks = useMemo(
    () => translatedBlocks.filter(b => b.translated.length > 0),
    [translatedBlocks]
  )

  // 核心叠放区（截图 + 译文）样式
  const coreStackStyle: React.CSSProperties | undefined =
    logicalImageWidth > 0 ? { width: Math.max(logicalImageWidth, 160) + 'px' } : undefined

  /** 计算整体窗口宽度（核心叠放区宽 + 控制栏宽 + 阴影边距），供窗口大小调整与防越界共用 */
  function computeWindowWidth(logicalW: number, loaded: boolean): number {
    const coreW = Math.max(logicalW, 160)
    const controlBarW = loaded ? 90 + 8 : 0
    return coreW + controlBarW + PIN_PADDING * 2
  }

  /** 实际执行窗口大小调整（内部方法，由节流器调度） */
  async function doUpdateWindowSize(includePanel: boolean) {
    const { logicalImageWidth: lw, logicalImageHeight: lh, imageLoaded: loaded, panelHeight: ph } = geometrySnap.current
    if (!lw || !lh) return

    const currentWindow = getCurrentWindow()

    // 整体宽度
    const width = computeWindowWidth(lw, loaded)
    // 整体高度：核心叠放区高（包含译文拉伸高度）与控制栏最小高度取最大值
    const coreH = lh + (includePanel ? ph || 120 : 0)
    const height = Math.max(coreH, 150) + PIN_PADDING * 2

    try {
      await currentWindow.setSize(new LogicalSize(width, height))
      logger.info(TAG, `窗口大小调整: ${width}x${height} (includePanel=${includePanel})`)
    } catch (err) {
      logger.error(TAG, `窗口大小调整失败: ${err}`, err)
    }
  }

  /**
   * 根据当前状态调整窗口大小（节流版本）
   * 在拖拽拉伸期间，限制 setSize 调用频率为每 80ms 最多 1 次，
   * 避免 WebKitGTK 底层因过于密集的窗口几何操作导致 malloc 内存损坏崩溃。
   */
  function updateWindowSize(includePanel: boolean) {
    const now = Date.now()
    const elapsed = now - lastResizeTimeRef.current

    if (elapsed >= RESIZE_THROTTLE_MS) {
      lastResizeTimeRef.current = now
      pendingResizePanelRef.current = null
      void doUpdateWindowSize(includePanel)
    } else {
      // 记录最新请求，等节流间隔到期后执行
      pendingResizePanelRef.current = includePanel
      if (!resizeThrottleTimerRef.current) {
        resizeThrottleTimerRef.current = setTimeout(() => {
          resizeThrottleTimerRef.current = null
          if (pendingResizePanelRef.current !== null) {
            lastResizeTimeRef.current = Date.now()
            const p = pendingResizePanelRef.current
            pendingResizePanelRef.current = null
            void doUpdateWindowSize(p)
          }
        }, RESIZE_THROTTLE_MS - elapsed)
      }
    }
  }

  /** 初始布局时检查屏幕边界并平移窗口（仅在初始加载/翻译完成时调用，不在拖拽中调用） */
  async function adjustWindowPositionIfNeeded() {
    try {
      const currentWindow = getCurrentWindow()
      const dpr = window.devicePixelRatio || 1
      const monitor = await currentMonitor()
      if (!monitor) return

      const { logicalImageWidth: lw, imageLoaded: loaded } = geometrySnap.current
      const width = computeWindowWidth(lw, loaded)

      const posPhys = await currentWindow.outerPosition()
      const posLogX = posPhys.x / dpr
      const monitorRightLog = (monitor.position.x + monitor.size.width) / dpr

      if (posLogX + width > monitorRightLog - 10) {
        const newLogX = Math.max(monitor.position.x / dpr, monitorRightLog - width - 20)
        await currentWindow.setPosition(new LogicalPosition(newLogX, posPhys.y / dpr))
      }
    } catch (err) {
      logger.error(TAG, `防越界平移窗口坐标失败: ${err}`, err)
    }
  }

  /**
   * 分析图片边缘像素亮度并设置自适应阴影
   * 通过 Canvas 提取图片四边（上下左右各 2 像素深度）的亮度值，
   * 若平均亮度低于阈值则使用亮色阴影（白色辉光），否则使用暗色阴影
   */
  function analyzeEdgeBrightness(img: HTMLImageElement): void {
    try {
      const canvas = document.createElement('canvas')
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (w === 0 || h === 0) return

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, w, h)
      const data = imageData.data

      let totalBrightness = 0
      let count = 0

      // 采样步长：图片越宽/高，步长越大，控制采样总数
      const stepX = Math.max(4, Math.floor(w / 150))
      const stepY = Math.max(4, Math.floor(h / 150))
      const depth = 2 // 边缘采样深度（像素行/列数）

      // 上下边缘
      for (let x = 0; x < w; x += stepX) {
        for (let d = 0; d < depth; d++) {
          // 上边缘
          if (d < h) {
            const idx = (d * w + x) * 4
            totalBrightness += (data[idx] + data[idx + 1] + data[idx + 2]) / 3
            count++
          }
          // 下边缘
          if (d < h) {
            const idx = ((h - 1 - d) * w + x) * 4
            totalBrightness += (data[idx] + data[idx + 1] + data[idx + 2]) / 3
            count++
          }
        }
      }

      // 左右边缘（跳过已采样的四角区域）
      for (let y = depth; y < h - depth; y += stepY) {
        for (let d = 0; d < depth; d++) {
          // 左边缘
          if (d < w) {
            const idx = (y * w + d) * 4
            totalBrightness += (data[idx] + data[idx + 1] + data[idx + 2]) / 3
            count++
          }
          // 右边缘
          if (d < w) {
            const idx = (y * w + (w - 1 - d)) * 4
            totalBrightness += (data[idx] + data[idx + 1] + data[idx + 2]) / 3
            count++
          }
        }
      }

      const avgBrightness = count > 0 ? totalBrightness / count / 255 : 0.5

      // 亮度阈值 0.45：边缘偏暗时使用亮色阴影，偏亮时使用暗色阴影
      if (avgBrightness < 0.45) {
        // 亮色阴影：白色描边 + 辉光，在暗色背景下清晰可见
        setShadowStyle('0 0 0 1px rgba(255,255,255,0.18), 0 0 10px 3px rgba(255,255,255,0.15)')
      } else {
        // 暗色阴影：默认的阴影效果，在亮色背景下清晰可见
        setShadowStyle('0 1px 5px 1px rgba(0,0,0,0.4)')
      }
    } catch {
      // 分析失败时保持默认阴影
    }
  }

  function onImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget as HTMLImageElement
    if (!img.naturalWidth || !img.naturalHeight) return

    const dpr = window.devicePixelRatio || 1
    const newLogicalWidth = img.naturalWidth / dpr
    const newLogicalHeight = img.naturalHeight / dpr
    setLogicalImageWidth(newLogicalWidth)
    setLogicalImageHeight(newLogicalHeight)

    logger.info(TAG, `图片加载完成: naturalSize=${img.naturalWidth}x${img.naturalHeight}, dpr=${dpr}, logicalSize=${newLogicalWidth}x${newLogicalHeight}`)

    // 设置图片区域显式尺寸，防止 flex stretch 导致图片被拉伸变形
    if (imageAreaRef.current) {
      imageAreaRef.current.style.width = `${newLogicalWidth}px`
      imageAreaRef.current.style.height = `${newLogicalHeight}px`
    }

    // 分析边缘亮度以设置自适应阴影
    analyzeEdgeBrightness(img)

    // 图片加载完成后再显示 ControlBar，避免按钮出现在错误位置
    setImageLoaded(true)
  }

  // 图片加载完成、ControlBar 渲染后再计算并调整窗口大小（仅首次）
  useEffect(() => {
    if (!imageLoaded || didInitialAdjustRef.current) return
    didInitialAdjustRef.current = true
    updateWindowSize(false)
    void adjustWindowPositionIfNeeded()
  }, [imageLoaded])

  // 窗口挂载：获取贴图数据（带轮询等待）
  useEffect(() => {
    if (didMountRef.current) return
    didMountRef.current = true

    const currentWindow = getCurrentWindow()
    const windowId = currentWindow.label
    setPinId(windowId)
    logger.info(TAG, `PinView onMounted, windowLabel=${windowId}`)

    ;(async () => {
      try {
        logger.info(TAG, `调用 getPinImage, windowId=${windowId}`)
        let base64Data = await getPinImage(windowId)

        // 预创建场景下数据可能尚未存储，轮询等待
        if (!base64Data) {
          logger.info(TAG, '图片数据未就绪，轮询等待...')
          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 50))
            base64Data = await getPinImage(windowId)
            if (base64Data) {
              logger.info(TAG, `轮询第 ${i + 1} 次获取到图片数据`)
              break
            }
          }
        }

        if (base64Data) {
          logger.info(TAG, `获取到图片数据，长度=${base64Data.length}, startsWithData=${base64Data.startsWith('data:')}`)
          if (base64Data.startsWith('data:')) {
            // 去掉 data URI 前缀，保存纯 base64 数据
            rawBase64DataRef.current = base64Data.replace(/^data:image\/[^;]+;base64,/, '')
            setImageDataUrl(base64Data)
          } else {
            rawBase64DataRef.current = base64Data
            setImageDataUrl(`data:image/png;base64,${base64Data}`)
          }
          logger.info(TAG, 'imageDataUrl 已设置')
        } else {
          logger.error(TAG, 'getPinImage 返回 null！图片数据未找到')
        }
      } catch (err) {
        logger.error(TAG, `getPinImage 调用失败: ${err}`, err)
      }
    })()
  }, [])

  function onMouseDown(e: ReactMouseEvent<HTMLElement>) {
    const target = e.target as HTMLElement
    if (target.closest('.control-bar button')) return
    if (target.closest('.panel-resize-handle')) return // 不干扰面板拉伸

    mouseDownXRef.current = e.clientX
    mouseDownYRef.current = e.clientY
    hasStartedDragRef.current = false
  }

  async function onMouseMove(e: ReactMouseEvent<HTMLElement>) {
    if (mouseDownXRef.current === 0 && mouseDownYRef.current === 0) return
    if (hasStartedDragRef.current) return

    const dx = e.clientX - mouseDownXRef.current
    const dy = e.clientY - mouseDownYRef.current

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasStartedDragRef.current = true
      try {
        await getCurrentWindow().startDragging()
      } catch (err) {
        logger.error(TAG, `startDragging 失败: ${err}`, err)
      }
    }
  }

  function onMouseUp() {
    mouseDownXRef.current = 0
    mouseDownYRef.current = 0
    hasStartedDragRef.current = false
  }

  /** 开始拉伸译文面板高度 */
  function onResizeStart(e: ReactMouseEvent<HTMLElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (!panelRef.current || initialPanelHeightRef.current <= 0) return

    const startY = e.clientY
    const startHeight = panelRef.current.offsetHeight
    // 拉伸期间这些状态不会变化，直接捕获当前值作为面板参与窗口高度计算的条件
    const includePanel = hasTranslation && !showOriginal

    function onDocMouseMove(ev: MouseEvent) {
      const diff = ev.clientY - startY
      const newHeight = Math.max(initialPanelHeightRef.current, startHeight + diff)
      setPanelHeight(newHeight)
      // 同步几何快照，避免节流闭包读取到旧的面板高度
      geometrySnap.current.panelHeight = newHeight
      updateWindowSize(includePanel)
    }

    function onDocMouseUp() {
      document.removeEventListener('mousemove', onDocMouseMove)
      document.removeEventListener('mouseup', onDocMouseUp)
    }

    document.addEventListener('mousemove', onDocMouseMove)
    document.addEventListener('mouseup', onDocMouseUp)
  }

  async function onDoubleClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement
    if (imageAreaRef.current && imageAreaRef.current.contains(target)) {
      try {
        logger.info(TAG, '双击关闭贴图窗口')
        await getCurrentWindow().destroy()
      } catch (err) {
        logger.error(TAG, `双击关闭失败: ${err}`, err)
      }
    }
  }

  // 翻译核心逻辑，forceRetranslate 为 true 时跳过缓存
  async function doTranslate(forceRetranslate: boolean) {
    setTranslateStatus('translating')
    setErrorMessage('')

    try {
      // 获取配置以确定目标语言
      const config = await getConfig()
      logger.info(TAG, `开始翻译，目标语言=${config.target_language}，强制重新翻译=${forceRetranslate}`)

      // 调用翻译命令
      const result = await translateImage(rawBase64DataRef.current, config.target_language, forceRetranslate)

      if (!result.blocks || result.blocks.length === 0) {
        logger.info(TAG, '翻译结果为空，回到空闲状态')
        setTranslateStatus('idle')
        return
      }

      // 保存翻译块列表
      setTranslatedBlocks(result.blocks)
      setHasTranslation(true)
      setTranslateStatus('done')
      // 记录是否来自历史缓存
      setFromCache(result.from_cache)

      logger.info(TAG, `翻译完成，共 ${result.blocks.length} 个翻译块`)
      // 标记：待 DOM 渲染后测量面板内容高度并调整窗口
      pendingMeasureRef.current = true
    } catch (err) {
      setErrorMessage(String(err))
      setTranslateStatus('error')
      logger.error(TAG, `翻译失败: ${err}`, err)
    }
  }

  // 翻译完成后：先清显式高度、双 rAF 测量内容高度、再更新窗口大小与防越界（近似 vue 双 nextTick）
  useEffect(() => {
    if (!pendingMeasureRef.current) return
    if (translateStatus !== 'done') return
    pendingMeasureRef.current = false

    // 清除显式高度，让面板按内容自适应撑开
    setPanelHeight(null)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 测量面板实际内容高度（scrollHeight 包含 padding，不包含 border）
        let contentH = 0
        if (panelRef.current) {
          contentH = panelRef.current.scrollHeight
        }
        if (contentH <= 0) {
          // 测量失败时的兜底值
          contentH = 120
        }
        initialPanelHeightRef.current = contentH
        setPanelHeight(contentH)
        logger.info(TAG, `译文面板初始高度: ${contentH}px (内容自适应)`)

        // 面板高度应用后再调整窗口大小与位置
        requestAnimationFrame(() => {
          updateWindowSize(true)
          void adjustWindowPositionIfNeeded()
        })
      })
    })
  }, [translatedBlocks, translateStatus])

  // 复制原文文本到剪贴板
  async function onCopyOriginal() {
    if (filteredBlocks.length > 0) {
      const text = filteredBlocks.map(b => b.original).join('\n')
      try {
        await writeClipboardText(text)
        logger.info(TAG, '原文文本已复制到剪贴板')
      } catch (err) {
        logger.error(TAG, `复制原文失败: ${err}`, err)
      }
    }
  }

  // idle 状态下通过 OCR 识别文字并复制原文到剪贴板
  async function onOcrCopyOriginal() {
    if (ocrLoading) return
    setOcrLoading(true)

    try {
      const blocks = await ocrImage(rawBase64DataRef.current)
      if (!blocks || blocks.length === 0) {
        logger.info(TAG, 'OCR 未识别到文字，无法复制原文')
        return
      }

      const text = blocks.map(b => b.text).join('\n')
      await writeClipboardText(text)
      logger.info(TAG, 'OCR 识别原文已复制到剪贴板')
    } catch (err) {
      logger.error(TAG, `OCR 复制原文失败: ${err}`, err)
    } finally {
      setOcrLoading(false)
    }
  }

  // 复制译文文本到剪贴板
  async function onCopyTranslation() {
    if (filteredBlocks.length > 0) {
      const text = filteredBlocks.map(b => b.translated).join('\n')
      try {
        await writeClipboardText(text)
        logger.info(TAG, '译文文本已复制到剪贴板')
      } catch (err) {
        logger.error(TAG, `复制译文失败: ${err}`, err)
      }
    }
  }

  // 切换原文/译文显示
  function onToggleOriginal() {
    const newVal = !showOriginal
    setShowOriginal(newVal)
    // 切换后待 DOM 更新完成再调整窗口大小（面板显隐会影响窗口高度）
    requestAnimationFrame(() => {
      updateWindowSize(!newVal)
    })
  }

  return (
    <div
      className="pin-container"
      data-pin-id={pinId}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDoubleClick={onDoubleClick}
    >
      {/* 主布局：水平排列（核心内容区 + 右侧垂直控制栏） */}
      <div className="main-layout">
        {/* 核心内容垂直叠放区：截图 + 译文面板 */}
        <div className="core-stack" ref={leftColumnRef} style={coreStackStyle}>
          <div className="image-area" ref={imageAreaRef} style={{ boxShadow: shadowStyle }}>
            {imageDataUrl && (
              <img
                src={imageDataUrl}
                className="pin-image"
                draggable={false}
                onLoad={onImageLoad}
              />
            )}
          </div>

          {/* 译文面板 (放截图下面) */}
          {hasTranslation && !showOriginal && (
            <div
              ref={panelRef}
              className="translation-panel"
              style={panelHeight !== null ? { height: panelHeight + 'px' } : undefined}
            >
              <div className="translation-items-container">
                {filteredBlocks.map((block, index) => (
                  <div key={index} className="translation-item">
                    <div className="translation-text">{block.translated}</div>
                    {index < filteredBlocks.length - 1 && <div className="translation-separator"></div>}
                  </div>
                ))}
              </div>
              <div className="panel-resize-handle" onMouseDown={onResizeStart}></div>
            </div>
          )}
        </div>

        {/* 右侧控制栏 (始终固定在右侧) */}
        {imageLoaded && (
          <ControlBar
            translateStatus={translateStatus}
            showOriginal={showOriginal}
            hasTranslation={hasTranslation}
            errorMessage={errorMessage}
            fromCache={fromCache}
            ocrLoading={ocrLoading}
            vertical
            onTranslate={() => void doTranslate(false)}
            onRetranslate={() => void doTranslate(true)}
            onCopyOriginal={() => void onCopyOriginal()}
            onCopyTranslation={() => void onCopyTranslation()}
            onToggleOriginal={onToggleOriginal}
            onOcrCopyOriginal={() => void onOcrCopyOriginal()}
          />
        )}
      </div>
    </div>
  )
}