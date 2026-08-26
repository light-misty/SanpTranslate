import { create } from 'zustand'

/** 翻译文本块 */
export interface TranslatedBlock {
  /** 原始文本 */
  original: string
  /** 翻译后文本 */
  translated: string
  /** 文本块位置 X 坐标 */
  x: number
  /** 文本块位置 Y 坐标 */
  y: number
  /** 文本块宽度 */
  width: number
  /** 文本块高度 */
  height: number
}

/** 贴图状态 */
export interface PinState {
  /** 贴图唯一标识 */
  pinId: string
  /** 截图数据 URL */
  imageDataUrl: string
  /** 贴图位置 */
  position: { x: number; y: number }
  /** 贴图尺寸 */
  size: { width: number; height: number }
  /** 翻译状态 */
  translateStatus: 'idle' | 'translating' | 'done' | 'error'
  /** 翻译块列表 */
  translatedBlocks: TranslatedBlock[]
  /** 是否显示原文 */
  showOriginal: boolean
}

/** 贴图 store 状态与 actions */
interface PinStoreState {
  pins: Map<string, PinState>
  addPin: (pin: PinState) => void
  removePin: (pinId: string) => void
  getPin: (pinId: string) => PinState | undefined
  updatePin: (pinId: string, updates: Partial<PinState>) => void
}

/** 贴图状态管理 */
export const usePinStore = create<PinStoreState>()((set, get) => ({
  pins: new Map(),

  /** 添加贴图 */
  addPin(pin) {
    set((state) => {
      const pins = new Map(state.pins)
      pins.set(pin.pinId, pin)
      return { pins }
    })
  },

  /** 移除贴图 */
  removePin(pinId) {
    set((state) => {
      const pins = new Map(state.pins)
      pins.delete(pinId)
      return { pins }
    })
  },

  /** 获取贴图 */
  getPin(pinId) {
    return get().pins.get(pinId)
  },

  /** 更新贴图属性 */
  updatePin(pinId, updates) {
    set((state) => {
      const pin = state.pins.get(pinId)
      if (!pin) return state
      const next = { ...pin, ...updates }
      const pins = new Map(state.pins)
      pins.set(pinId, next)
      return { pins }
    })
  },
}))