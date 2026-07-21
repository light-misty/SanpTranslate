<template>
  <div
    class="pin-container"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @dblclick="onDoubleClick"
  >
    <!-- 主布局：水平排列（核心内容区 + 右侧垂直控制栏） -->
    <div class="main-layout">
      <!-- 核心内容垂直叠放区：截图 + 译文面板 -->
      <div class="core-stack" ref="leftColumnRef" :style="coreStackStyle">
        <div class="image-area" ref="imageArea" :style="{ boxShadow: shadowStyle }">
          <img
            v-if="imageDataUrl"
            :src="imageDataUrl"
            class="pin-image"
            draggable="false"
            @load="onImageLoad"
          />
        </div>

        <!-- 译文面板 (放截图下面) -->
        <div
          v-if="hasTranslation && !showOriginal"
          ref="panelRef"
          class="translation-panel"
          :style="panelHeight ? { height: panelHeight + 'px' } : undefined"
        >
          <div class="translation-items-container">
            <div
              v-for="(block, index) in filteredBlocks"
              :key="index"
              class="translation-item"
            >
              <div class="translation-text">{{ block.translated }}</div>
              <div v-if="index < filteredBlocks.length - 1" class="translation-separator"></div>
            </div>
          </div>
          <div class="panel-resize-handle" @mousedown.stop="onResizeStart"></div>
        </div>
      </div>

      <!-- 右侧控制栏 (始终固定在右侧) -->
      <ControlBar
        v-if="imageLoaded"
        :translate-status="translateStatus"
        :show-original="showOriginal"
        :has-translation="hasTranslation"
        :error-message="errorMessage"
        :from-cache="fromCache"
        :ocr-loading="ocrLoading"
        vertical
        @translate="onTranslate"
        @retranslate="onRetranslate"
        @copy-original="onCopyOriginal"
        @copy-translation="onCopyTranslation"
        @toggle-original="onToggleOriginal"
        @ocr-copy-original="onOcrCopyOriginal"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
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
import ControlBar from '@/components/ControlBar.vue'

const TAG = 'PinView'

// 阴影内边距，需与后端 window/mod.rs 中的 PIN_PADDING 保持一致
const PIN_PADDING = 14


type TranslateStatus = 'idle' | 'translating' | 'done' | 'error'

const imageDataUrl = ref<string>('')
const imageLoaded = ref(false)
const pinId = ref<string>('')
const translateStatus = ref<TranslateStatus>('idle')
const showOriginal = ref(false)
const hasTranslation = ref(false)

// 翻译相关状态
const translatedBlocks = ref<TranslatedBlock[]>([])
const errorMessage = ref<string>('')
const fromCache = ref(false)

// OCR 识别加载状态（idle 状态下"复制原文"按钮使用）
const ocrLoading = ref(false)

// 译文面板拉伸相关状态
const panelRef = ref<HTMLElement | null>(null)
const panelHeight = ref<number | null>(null) // 显式高度（拉伸后设置）
let initialPanelHeight = 0 // 面板初始高度，作为最小高度限制

// 过滤掉空翻译的块，避免在译文面板中显示空白项
const filteredBlocks = computed(() =>
  translatedBlocks.value.filter(b => b.translated.length > 0)
)

// 自适应阴影样式（根据图片边缘亮度选择暗色或亮色阴影）
const shadowStyle = ref('0 1px 5px 1px rgba(0,0,0,0.4)')

// 保存原始 base64 数据用于翻译
let rawBase64Data = ''

const leftColumnRef = ref<HTMLElement | null>(null)

// 图片逻辑像素尺寸（用于窗口大小计算）
const logicalImageWidth = ref(0)
const logicalImageHeight = ref(0)

const imageArea = ref<HTMLElement | null>(null)

// 核心叠放区（截图 + 译文）样式
const coreStackStyle = computed(() => {
  if (!logicalImageWidth.value) return undefined
  const w = Math.max(logicalImageWidth.value, 160)
  return {
    width: `${w}px`
  }
})

let mouseDownX = 0
let mouseDownY = 0
let hasStartedDrag = false


// 节流控制：防止高频 setSize 导致 WebKitGTK 内存崩溃
const RESIZE_THROTTLE_MS = 80
let resizeThrottleTimer: ReturnType<typeof setTimeout> | null = null
let lastResizeTime = 0
let pendingResizePanel: boolean | null = null

/**
 * 根据当前状态调整窗口大小（节流版本）
 * 在拖拽拉伸期间，限制 setSize 调用频率为每 80ms 最多 1 次，
 * 避免 WebKitGTK 底层因过于密集的窗口几何操作导致 malloc 内存损坏崩溃。
 */
function updateWindowSize(includePanel: boolean) {
  const now = Date.now()
  const elapsed = now - lastResizeTime

  if (elapsed >= RESIZE_THROTTLE_MS) {
    lastResizeTime = now
    pendingResizePanel = null
    doUpdateWindowSize(includePanel)
  } else {
    // 记录最新请求，等节流间隔到期后执行
    pendingResizePanel = includePanel
    if (!resizeThrottleTimer) {
      resizeThrottleTimer = setTimeout(() => {
        resizeThrottleTimer = null
        if (pendingResizePanel !== null) {
          lastResizeTime = Date.now()
          const p = pendingResizePanel
          pendingResizePanel = null
          doUpdateWindowSize(p)
        }
      }, RESIZE_THROTTLE_MS - elapsed)
    }
  }
}

/** 实际执行窗口大小调整（内部方法，由节流器调度） */
async function doUpdateWindowSize(includePanel: boolean) {
  if (!logicalImageWidth.value || !logicalImageHeight.value) return

  const currentWindow = getCurrentWindow()

  // 计算整体宽度：核心叠放区宽 + 控制栏宽 + 阴影边距
  const coreW = Math.max(logicalImageWidth.value, 160)
  const controlBarW = imageLoaded.value ? 90 + 8 : 0
  const width = coreW + controlBarW + PIN_PADDING * 2

  // 计算整体高度：核心叠放区高（包含译文拉伸高度）与控制栏最小高度取最大值
  const coreH = logicalImageHeight.value + (includePanel ? panelHeight.value || 120 : 0)
  const height = Math.max(coreH, 150) + PIN_PADDING * 2

  try {
    await currentWindow.setSize(new LogicalSize(width, height))
    logger.info(TAG, `窗口大小调整: ${width}x${height} (includePanel=${includePanel})`)
  } catch (err) {
    logger.error(TAG, `窗口大小调整失败: ${err}`, err)
  }
}

/** 初始布局时检查屏幕边界并平移窗口（仅在初始加载/翻译完成时调用，不在拖拽中调用） */
async function adjustWindowPositionIfNeeded() {
  try {
    const currentWindow = getCurrentWindow()
    const dpr = window.devicePixelRatio || 1
    const monitor = await currentMonitor()
    if (!monitor) return

    const coreW = Math.max(logicalImageWidth.value, 160)
    const controlBarW = imageLoaded.value ? 90 + 8 : 0
    const width = coreW + controlBarW + PIN_PADDING * 2

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
      shadowStyle.value = '0 0 0 1px rgba(255,255,255,0.18), 0 0 10px 3px rgba(255,255,255,0.15)'
    } else {
      // 暗色阴影：默认的阴影效果，在亮色背景下清晰可见
      shadowStyle.value = '0 1px 5px 1px rgba(0,0,0,0.4)'
    }
  } catch (err) {
    // 分析失败时保持默认阴影
  }
}

async function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (!img || !img.naturalWidth || !img.naturalHeight) return

  const dpr = window.devicePixelRatio || 1
  logicalImageWidth.value = img.naturalWidth / dpr
  logicalImageHeight.value = img.naturalHeight / dpr

  logger.info(TAG, `图片加载完成: naturalSize=${img.naturalWidth}x${img.naturalHeight}, dpr=${dpr}, logicalSize=${logicalImageWidth.value}x${logicalImageHeight.value}`)

  // 设置图片区域显式尺寸，防止 flex stretch 导致图片被拉伸变形
  if (imageArea.value) {
    imageArea.value.style.width = `${logicalImageWidth.value}px`
    imageArea.value.style.height = `${logicalImageHeight.value}px`
  }

  // 分析边缘亮度以设置自适应阴影
  analyzeEdgeBrightness(img)

  // 图片加载完成后再显示 ControlBar，避免按钮出现在错误位置
  imageLoaded.value = true

  // 等待 ControlBar 渲染后，再基于真实 DOM 尺寸计算并调整窗口大小
  await nextTick()
  updateWindowSize(false)
  adjustWindowPositionIfNeeded()
}

onMounted(async () => {
  const currentWindow = getCurrentWindow()
  pinId.value = currentWindow.label
  logger.info(TAG, `PinView onMounted, windowLabel=${pinId.value}`)

  try {
    logger.info(TAG, `调用 getPinImage, windowId=${pinId.value}`)
    let base64Data = await getPinImage(pinId.value)

    // 预创建场景下数据可能尚未存储，轮询等待
    if (!base64Data) {
      logger.info(TAG, '图片数据未就绪，轮询等待...')
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 50))
        base64Data = await getPinImage(pinId.value)
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
        rawBase64Data = base64Data.replace(/^data:image\/[^;]+;base64,/, '')
        imageDataUrl.value = base64Data
      } else {
        rawBase64Data = base64Data
        imageDataUrl.value = `data:image/png;base64,${base64Data}`
      }
      logger.info(TAG, `imageDataUrl 已设置，长度=${imageDataUrl.value.length}`)
    } else {
      logger.error(TAG, 'getPinImage 返回 null！图片数据未找到')
    }
  } catch (err) {
    logger.error(TAG, `getPinImage 调用失败: ${err}`, err)
  }
})

function onMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.control-bar button')) return
  if (target.closest('.panel-resize-handle')) return // 不干扰面板拉伸

  mouseDownX = e.clientX
  mouseDownY = e.clientY
  hasStartedDrag = false
}

async function onMouseMove(e: MouseEvent) {
  if (mouseDownX === 0 && mouseDownY === 0) return
  if (hasStartedDrag) return

  const dx = e.clientX - mouseDownX
  const dy = e.clientY - mouseDownY

  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    hasStartedDrag = true
    try {
      await getCurrentWindow().startDragging()
    } catch (err) {
      logger.error(TAG, `startDragging 失败: ${err}`, err)
    }
  }
}

function onMouseUp() {
  mouseDownX = 0
  mouseDownY = 0
  hasStartedDrag = false
}

/** 开始拉伸译文面板高度 */
function onResizeStart(e: MouseEvent) {
  e.preventDefault()
  if (!panelRef.value || initialPanelHeight <= 0) return

  const startY = e.clientY
  const startHeight = panelRef.value.offsetHeight

  function onMouseMove(e: MouseEvent) {
    const diff = e.clientY - startY
    const newHeight = Math.max(initialPanelHeight, startHeight + diff)
    panelHeight.value = newHeight
    updateWindowSizeAfterPanelResize(newHeight)
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

/** 拉伸后更新窗口高度 */
function updateWindowSizeAfterPanelResize(_panelH?: number) {
  updateWindowSize(hasTranslation.value && !showOriginal.value)
}

async function onDoubleClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (imageArea.value && imageArea.value.contains(target)) {
    try {
      logger.info(TAG, '双击关闭贴图窗口')
      await getCurrentWindow().destroy()
    } catch (err) {
      logger.error(TAG, `双击关闭失败: ${err}`, err)
    }
  }
}

// 调用后端翻译命令
async function onTranslate() {
  await doTranslate(false)
}

// 强制重新翻译（跳过历史缓存，始终调用API）
async function onRetranslate() {
  await doTranslate(true)
}

// 翻译核心逻辑，forceRetranslate 为 true 时跳过缓存
async function doTranslate(forceRetranslate: boolean) {
  translateStatus.value = 'translating'
  errorMessage.value = ''

  try {
    // 获取配置以确定目标语言
    const config = await getConfig()
    logger.info(TAG, `开始翻译，目标语言=${config.target_language}，强制重新翻译=${forceRetranslate}`)

    // 调用翻译命令
    const result = await translateImage(rawBase64Data, config.target_language, forceRetranslate)

    if (!result.blocks || result.blocks.length === 0) {
      logger.info(TAG, '翻译结果为空，回到空闲状态')
      translateStatus.value = 'idle'
      return
    }

    // 保存翻译块列表
    translatedBlocks.value = result.blocks
    hasTranslation.value = true
    translateStatus.value = 'done'

    // 记录是否来自历史缓存
    fromCache.value = result.from_cache

    logger.info(TAG, `翻译完成，共 ${translatedBlocks.value.length} 个翻译块`)

    // 面板初始高度根据译文内容自适应：先让面板按内容渲染，再测量实际内容高度
    await nextTick()
    // 清除显式高度，让面板按内容自适应撑开
    panelHeight.value = null
    await nextTick()
    // 测量面板实际内容高度（scrollHeight 包含 padding，不包含 border）
    let contentH = 0
    if (panelRef.value) {
      contentH = panelRef.value.scrollHeight
    }
    if (contentH <= 0) {
      // 测量失败时的兜底值
      contentH = 120
    }
    panelHeight.value = contentH
    initialPanelHeight = contentH
    logger.info(TAG, `译文面板初始高度: ${initialPanelHeight}px (内容自适应)`)

    updateWindowSize(true)
    adjustWindowPositionIfNeeded()
  } catch (err) {
    // 识别 Tesseract 不可用错误，去掉"OCR识别失败: "前缀让信息更清晰
    // 后端在 Tesseract 未找到时返回包含"未找到Tesseract"的错误，已含平台安装指引
    const errStr = String(err)
    if (errStr.includes('未找到Tesseract')) {
      errorMessage.value = errStr.replace(/^OCR识别失败:\s*/, '')
    } else {
      errorMessage.value = errStr
    }
    translateStatus.value = 'error'
    logger.error(TAG, `翻译失败: ${err}`, err)
  }
}

// 复制原文文本到剪贴板
async function onCopyOriginal() {
  if (filteredBlocks.value.length > 0) {
    const text = filteredBlocks.value.map(b => b.original).join('\n')
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
  if (ocrLoading.value) return
  ocrLoading.value = true

  try {
    const blocks = await ocrImage(rawBase64Data)
    if (!blocks || blocks.length === 0) {
      logger.info(TAG, 'OCR 未识别到文字，无法复制原文')
      return
    }

    const text = blocks.map(b => b.text).join('\n')
    await writeClipboardText(text)
    logger.info(TAG, 'OCR 识别原文已复制到剪贴板')
  } catch (err) {
    logger.error(TAG, `OCR 复制原文失败: ${err}`, err)
    // Tesseract 不可用时显示错误信息给用户（去掉"OCR识别失败: "前缀）
    const errStr = String(err)
    if (errStr.includes('未找到Tesseract')) {
      errorMessage.value = errStr.replace(/^OCR识别失败:\s*/, '')
      translateStatus.value = 'error'
    }
  } finally {
    ocrLoading.value = false
  }
}

// 复制译文文本到剪贴板
async function onCopyTranslation() {
  if (filteredBlocks.value.length > 0) {
    const text = filteredBlocks.value.map(b => b.translated).join('\n')
    try {
      await writeClipboardText(text)
      logger.info(TAG, '译文文本已复制到剪贴板')
    } catch (err) {
      logger.error(TAG, `复制译文失败: ${err}`, err)
    }
  }
}

// 切换原文/译文显示
async function onToggleOriginal() {
  showOriginal.value = !showOriginal.value
  // 切换后立即调整窗口大小
  await nextTick()
  updateWindowSize(!showOriginal.value)
}
</script>

<style scoped>
.pin-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 14px;
  background: transparent;
  user-select: none;
  overflow: hidden;
}

.main-layout {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  gap: 8px;
}

.core-stack {
  display: flex;
  flex-direction: column;
  align-self: flex-start;
}

.image-area {
  flex: 0 0 auto;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.pin-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}

/* 译文面板 */
.translation-panel {
  background: rgba(30, 30, 30, 0.92);
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  width: 100%;
  font-size: 13px;
  line-height: 1.8;
  color: #f0f0f0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  align-self: flex-start;
  margin-top: 4px;
}

/* 译文内容可滚动容器 */
.translation-items-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 8px 16px;
  min-height: 0;
}

.translation-item {
  margin-bottom: 4px;
}

.translation-text {
  word-break: break-word;
  white-space: pre-wrap;
}

/* 翻译块之间的分隔线 */
.translation-separator {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 10px 0;
}

/* 译文面板高度拉伸手柄 */
.panel-resize-handle {
  flex-shrink: 0;
  height: 10px;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

/* 手柄上的三杠指示器 */
.panel-resize-handle::before {
  content: '';
  width: 24px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
  transition: background 0.15s;
}

.panel-resize-handle:hover::before,
.panel-resize-handle:active::before {
  background: rgba(255, 255, 255, 0.3);
}

/* 译文面板滚动条样式 */
.translation-items-container::-webkit-scrollbar {
  width: 4px;
}
.translation-items-container::-webkit-scrollbar-track {
  background: transparent;
}
.translation-items-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}
</style>
