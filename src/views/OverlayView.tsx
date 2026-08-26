import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { captureRegionFromCache, storePinImage } from '@/utils/tauri'
import { logger } from '@/utils/logger'
import './OverlayView.css'

/** 截图蒙版视图：与 vue 版 OverlayView.vue 行为逐项等价 */
export default function OverlayView() {
  const TAG = 'Overlay'
  const { t } = useTranslation()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)

  // 用 useRef 存储拖拽状态，完全绕过 React 响应式系统，消除拖拽卡顿
  const _isSelecting = useRef(false)
  const _startX = useRef(0)
  const _startY = useRef(0)
  const _endX = useRef(0)
  const _endY = useRef(0)
  // 光标位置也用 ref，避免响应式开销
  const _cursorX = useRef(0)
  const _cursorY = useRef(0)
  const _cursorDirty = useRef(false)
  const fullscreenImgElement = useRef<HTMLImageElement | null>(null)

  const keydownHandler = useRef<((e: KeyboardEvent) => void) | null>(null)
  const rafId = useRef<number | null>(null)

  // 仅用于 size-tip UI 显示，低频更新
  const [isSelecting, setIsSelecting] = useState(false)
  const [selW, setSelW] = useState(0)
  const [selH, setSelH] = useState(0)
  const [sizeTipLeft, setSizeTipLeft] = useState(0)
  const [sizeTipTop, setSizeTipTop] = useState(0)

  function drawCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cw = canvas.width
    const ch = canvas.height

    // 有截图时绘制背景图，否则只显示半透明遮罩（只绘制一次，不 clearRect 避免闪烁）
    if (fullscreenImgElement.current) {
      ctx.drawImage(fullscreenImgElement.current, 0, 0, cw, ch)
    } else {
      ctx.clearRect(0, 0, cw, ch)
    }

    // 直接读取 ref 变量，无响应式开销
    const rx = Math.min(_startX.current, _endX.current) * dpr
    const ry = Math.min(_startY.current, _endY.current) * dpr
    const rw = Math.abs(_endX.current - _startX.current) * dpr
    const rh = Math.abs(_endY.current - _startY.current) * dpr

    if (_isSelecting.current && rw > 0 && rh > 0) {
      // 单一 fillRect + clip 裁剪出选区"镂空"，避免 4 块矩形拼接处的抗锯齿横线
      ctx.save()
      ctx.beginPath()
      ctx.rect(rx, ry, rw, rh)   // 内矩形（选区）
      ctx.rect(0, 0, cw, ch)     // 外矩形（全屏）
      ctx.clip('evenodd')        // 裁剪到选区外部
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(0, 0, cw, ch)
      ctx.restore()

      // 选区虚线框
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5 * dpr
      ctx.setLineDash([5 * dpr, 3 * dpr])
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.restore()
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(0, 0, cw, ch)
    }
  }

  /** 更新自定义光标 DOM 位置（在 rAF 中调用，避免 React 响应式开销） */
  function updateCursorPosition() {
    if (!_cursorDirty.current) return
    _cursorDirty.current = false
    const el = cursorRef.current
    if (el) {
      el.style.left = `${_cursorX.current}px`
      el.style.top = `${_cursorY.current}px`
    }
  }

  function onMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault()
    _isSelecting.current = true
    setIsSelecting(true)
    _startX.current = _endX.current = e.clientX
    _startY.current = _endY.current = e.clientY
    setSelW(0)
    setSelH(0)
  }

  function onMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    // 首次鼠标移动时显示自定义光标
    if (cursorRef.current && cursorRef.current.style.display === 'none') {
      cursorRef.current.style.display = ''
    }
    // 更新光标位置（ref 变量，无响应式开销）
    _cursorX.current = e.clientX
    _cursorY.current = e.clientY
    _cursorDirty.current = true

    if (!_isSelecting.current) {
      // 未在框选时仍需更新光标位置
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(() => {
          updateCursorPosition()
          rafId.current = null
        })
      }
      return
    }
    _endX.current = e.clientX
    _endY.current = e.clientY
    // 低频更新 state，仅用于 size-tip 显示（不影响 canvas 渲染速度）
    const w = Math.abs(_endX.current - _startX.current)
    const h = Math.abs(_endY.current - _startY.current)
    if (w > 5 && h > 5) {
      setSelW(Math.round(w))
      setSelH(Math.round(h))
      setSizeTipLeft(Math.min(_startX.current, _endX.current))
      setSizeTipTop(Math.min(_startY.current, _endY.current) + h + 4)
    }
    // canvas 渲染走 rAF，完全不受 React 响应式影响
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(() => {
        drawCanvas()
        updateCursorPosition()
        rafId.current = null
      })
    }
  }

  async function onMouseUp(e: ReactMouseEvent<HTMLDivElement>) {
    if (!_isSelecting.current) return
    _isSelecting.current = false
    setIsSelecting(false)
    _endX.current = e.clientX
    _endY.current = e.clientY

    const dpr = window.devicePixelRatio || 1

    const cssX = Math.round(Math.min(_startX.current, _endX.current))
    const cssY = Math.round(Math.min(_startY.current, _endY.current))
    const cssW = Math.round(Math.abs(_endX.current - _startX.current))
    const cssH = Math.round(Math.abs(_endY.current - _startY.current))

    logger.info(TAG, `鼠标松开: cssX=${cssX}, cssY=${cssY}, cssW=${cssW}, cssH=${cssH}, dpr=${dpr}`)

    if (cssW < 5 || cssH < 5) {
      logger.info(TAG, '选区太小，忽略')
      drawCanvas()
      return
    }

    // 清除选区矩形，显示纯遮罩
    drawCanvas()

    const physX = Math.round(cssX * dpr)
    const physY = Math.round(cssY * dpr)
    const physW = Math.round(cssW * dpr)
    const physH = Math.round(cssH * dpr)

    logger.info(TAG, `物理像素: physX=${physX}, physY=${physY}, physW=${physW}, physH=${physH}`)

    // 直接从 CSS 坐标计算贴图窗口位置（无需等待后端编码结果）
    const PIN_PADDING = 14
    const CONTROL_BAR_H = 36
    const windowX = cssX - PIN_PADDING
    const windowY = cssY - PIN_PADDING
    const windowWidth = cssW + PIN_PADDING * 2
    const windowHeight = cssH + CONTROL_BAR_H + PIN_PADDING * 2

    // 创建贴图窗口（定位到正确位置，visible），与后端编码并行
    const label = `pin-${crypto.randomUUID()}`
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')

    const pinWindow = new WebviewWindow(label, {
      url: '/pin',
      title: t('pin.title'),
      decorations: false,
      alwaysOnTop: true,
      transparent: true,
      shadow: false,
      skipTaskbar: true,
      resizable: false,
      x: windowX,
      y: windowY,
      width: windowWidth,
      height: windowHeight,
    })

    pinWindow.once('tauri://error', (err) => {
      logger.error(TAG, `贴图窗口创建失败: ${err}`, err)
    })

    // 裁剪编码 + 存储图像，完成后再销毁蒙版
    // 必须等 IPC 完成再 destroy，否则窗口 JS 上下文被销毁导致后续 await 中断
    try {
      const cropResult = await captureRegionFromCache(physX, physY, physW, physH)
      logger.info(TAG, `captureRegionFromCache 返回: x=${cropResult.x}, y=${cropResult.y}, w=${cropResult.width}, h=${cropResult.height}`)

      await storePinImage(label, cropResult.base64_data)
      logger.info(TAG, `图像数据已存储，label=${label}`)
    } catch (err) {
      logger.error(TAG, `框选处理失败: ${err}`, err)
    }

    // IPC 完成后关闭蒙版（DWM 动画已在窗口创建时禁用）
    await closeOverlay()
  }

  async function closeOverlay() {
    const win = getCurrentWindow()
    try {
      await win.destroy()
    } catch (err) {
      logger.error(TAG, `关闭蒙版失败: ${err}`, err)
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      logger.info(TAG, '按下 Esc，关闭 overlay 窗口')
      closeOverlay()
    }
  }

  function initCanvasSize() {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    logger.info(TAG, `Canvas初始化: innerSize=${window.innerWidth}x${window.innerHeight}, dpr=${dpr}, canvasSize=${canvas.width}x${canvas.height}`)
  }

  function loadFullscreenImage(dataUrl: string) {
    logger.info(TAG, `收到全屏截图数据，dataUrl长度=${dataUrl.length}`)
    const img = new Image()
    img.onload = () => {
      fullscreenImgElement.current = img
      logger.info(TAG, `全屏截图Image加载完成: naturalSize=${img.naturalWidth}x${img.naturalHeight}`)
      drawCanvas()
      logger.info(TAG, 'Canvas绘制完成')
    }
    img.onerror = (err) => {
      logger.error(TAG, `全屏截图Image加载失败`, err)
    }
    img.src = dataUrl
  }

  useEffect(() => {
    logger.info(TAG, 'OverlayView onMounted')
    initCanvasSize()
    // 立即绘制半透明遮罩，不等截图加载完成，让用户感知蒙版已响应
    drawCanvas()

    // 初始隐藏自定义光标，防止默认位置 (0,0) 时十字准星左上角出现 "⌈" 残影
    if (cursorRef.current) {
      cursorRef.current.style.display = 'none'
    }

    // 轮询拉取蒙版图像数据（后台线程异步编码截图）
    const POLL_INTERVAL_MS = 100
    const MAX_POLL_ATTEMPTS = 50  // 50 * 100ms = 5s 超时
    let imageLoaded = false

    const runPolling = async () => {
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        try {
          const overlayData = await invoke<{ data: string; mime: string } | null>('get_overlay_image')
          if (overlayData) {
            logger.info(TAG, `拉取到蒙版图像数据（第${i + 1}次轮询），mime=${overlayData.mime}，数据长度=${overlayData.data.length}`)
            const dataUrl = `data:${overlayData.mime};base64,${overlayData.data}`
            loadFullscreenImage(dataUrl)
            imageLoaded = true
            break
          }
        } catch (err) {
          logger.error(TAG, `拉取蒙版图像数据失败: ${err}`, err)
          break  // 命令出错不再重试
        }

        if (i < MAX_POLL_ATTEMPTS - 1) {
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        }
      }

      // 最终额外尝试一次，覆盖极微小的竞态窗口
      if (!imageLoaded) {
        try {
          const overlayData = await invoke<{ data: string; mime: string } | null>('get_overlay_image')
          if (overlayData) {
            logger.info(TAG, `最终尝试拉取到蒙版图像数据`)
            const dataUrl = `data:${overlayData.mime};base64,${overlayData.data}`
            loadFullscreenImage(dataUrl)
            imageLoaded = true
          }
        } catch { /* 忽略最终尝试的异常 */ }
      }

      if (!imageLoaded) {
        logger.error(TAG, `轮询超时（${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS}ms），未获取到蒙版图像数据`)
      }

      keydownHandler.current = onKeyDown
      window.addEventListener('keydown', keydownHandler.current)
      logger.info(TAG, 'OverlayView 初始化完成')
    }

    runPolling()

    return () => {
      logger.info(TAG, 'OverlayView onUnmounted')
      if (keydownHandler.current) {
        window.removeEventListener('keydown', keydownHandler.current)
        keydownHandler.current = null
      }
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
      fullscreenImgElement.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="overlay-container"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={(e) => {
        // 右键点击关闭遮罩窗口
        e.preventDefault()
        logger.info(TAG, '右键点击，关闭 overlay 窗口')
        closeOverlay()
      }}
    >
      <canvas ref={canvasRef} />
      {isSelecting && selW > 5 && selH > 5 && (
        <div
          className="size-tip"
          style={{
            left: `${sizeTipLeft}px`,
            top: `${sizeTipTop}px`,
          }}
        >
          {selW} x {selH}
        </div>
      )}
      {/* 高可见性自定义光标：白色十字 + drop-shadow 暗色轮廓，在任何背景上都清晰可见 */}
      <div ref={cursorRef} className="custom-cursor">
        <svg width="20" height="20" viewBox="0 0 20 20">
          <line x1="10" y1="2" x2="10" y2="18" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="2" y1="10" x2="18" y2="10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}