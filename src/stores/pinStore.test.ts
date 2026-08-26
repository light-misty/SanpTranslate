import { beforeEach, describe, expect, it } from 'vitest'
import { usePinStore, type PinState } from './pinStore'

/** 构造一个贴图状态实例 */
const makePin = (pinId: string, overrides: Partial<PinState> = {}): PinState => ({
  pinId,
  imageDataUrl: 'data:image/png;base64,AAAA',
  position: { x: 0, y: 0 },
  size: { width: 100, height: 100 },
  translateStatus: 'idle',
  translatedBlocks: [],
  showOriginal: false,
  ...overrides,
})

describe('pinStore', () => {
  beforeEach(() => {
    usePinStore.setState({ pins: new Map() })
  })

  it('addPin 后可通过 getPin 读取', () => {
    const pin = makePin('pin-1')
    usePinStore.getState().addPin(pin)

    expect(usePinStore.getState().getPin('pin-1')).toEqual(pin)
  })

  it('getPin 对不存在的贴图返回 undefined', () => {
    expect(usePinStore.getState().getPin('pin-nope')).toBeUndefined()
  })

  it('addPin 相同 pinId 时覆盖原实例', () => {
    usePinStore.getState().addPin(makePin('pin-1', { translateStatus: 'idle' }))
    usePinStore.getState().addPin(makePin('pin-1', { translateStatus: 'done' }))

    expect(usePinStore.getState().getPin('pin-1')?.translateStatus).toBe('done')
  })

  it('updatePin 合并更新指定字段，不触碰其它字段', () => {
    usePinStore.getState().addPin(makePin('pin-1'))
    usePinStore.getState().updatePin('pin-1', { showOriginal: true, translateStatus: 'done' })

    const pin = usePinStore.getState().getPin('pin-1')
    expect(pin?.showOriginal).toBe(true)
    expect(pin?.translateStatus).toBe('done')
    expect(pin?.position).toEqual({ x: 0, y: 0 })
  })

  it('updatePin 对不存在的贴图不产生副作用', () => {
    usePinStore.getState().updatePin('pin-nope', { showOriginal: true })

    expect(usePinStore.getState().pins.size).toBe(0)
  })

  it('removePin 移除后 getPin 返回 undefined', () => {
    usePinStore.getState().addPin(makePin('pin-1'))
    usePinStore.getState().addPin(makePin('pin-2'))

    usePinStore.getState().removePin('pin-1')

    expect(usePinStore.getState().getPin('pin-1')).toBeUndefined()
    expect(usePinStore.getState().getPin('pin-2')).toBeDefined()
  })
})