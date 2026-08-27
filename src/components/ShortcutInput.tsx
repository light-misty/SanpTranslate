import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './ShortcutInput.css'

/** 快捷键输入组件属性 */
interface ShortcutInputProps {
  /** 当前快捷键值 */
  value: string
  /** 占位提示文案 */
  placeholder?: string
  /** 快捷键变更回调（录制完成后触发） */
  onChange: (value: string) => void
  /** 快捷键状态：'occupied' 表示被占用 */
  status?: 'occupied' | 'available' | undefined
}

/** 支持的普通按键映射（event.code -> 显示名称） */
const keyCodeMap: Record<string, string> = {
  // 字母键
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E',
  KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J',
  KeyK: 'K', KeyL: 'L', KeyM: 'M', KeyN: 'N', KeyO: 'O',
  KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T',
  KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y',
  KeyZ: 'Z',
  // 数字键
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  // 功能键
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5',
  F6: 'F6', F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10',
  F11: 'F11', F12: 'F12',
}

// 判断是否为修饰键
function isModifierKey(code: string): boolean {
  return code.startsWith('Control') || code.startsWith('Alt') ||
         code.startsWith('Shift') || code.startsWith('Meta')
}

// 获取修饰键的规范化名称
function getModifierName(code: string): string {
  if (code.startsWith('Control')) return 'Control'
  if (code.startsWith('Alt')) return 'Alt'
  if (code.startsWith('Shift')) return 'Shift'
  if (code.startsWith('Meta')) return 'Meta'
  return code
}

// 格式化快捷键字符串为显示格式
function formatShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map(part => {
      const trimmed = part.trim()
      const lower = trimmed.toLowerCase()
      if (lower === 'ctrl' || lower === 'control') return 'Ctrl'
      if (lower === 'alt') return 'Alt'
      if (lower === 'shift') return 'Shift'
      if (lower === 'super' || lower === 'win' || lower === 'meta') return 'Win'
      return trimmed.toUpperCase()
    })
    .join(' + ')
}

// 构建快捷键字符串（后端格式）
function buildShortcutString(modifiers: Set<string>, key: string | null): string | null {
  if (!key) return null

  const parts: string[] = []
  // 按固定顺序排列修饰键
  if (modifiers.has('Control')) parts.push('Ctrl')
  if (modifiers.has('Alt')) parts.push('Alt')
  if (modifiers.has('Shift')) parts.push('Shift')
  if (modifiers.has('Meta')) parts.push('Win')

  // 至少需要一个修饰键
  if (parts.length === 0) return null

  parts.push(key)
  return parts.join('+')
}

/** 快捷键输入组件：聚焦后录制按键组合，录制结果通过 onChange 通知父组件 */
export default function ShortcutInput({ value, placeholder, onChange, status }: ShortcutInputProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLDivElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const pressedModifiers = useRef<Set<string>>(new Set())

  // 显示值：优先显示格式化后的快捷键，否则为占位提示
  const displayValue = value ? formatShortcut(value) : ''

  /** 停止录制并清空按键状态 */
  function stopRecording() {
    setIsRecording(false)
    pressedModifiers.current.clear()
  }

  /** 按键按下 */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!isRecording) return

    e.preventDefault()
    e.stopPropagation()

    const code = e.code

    // Escape 取消录制
    if (code === 'Escape') {
      stopRecording()
      return
    }

    // 处理修饰键
    if (isModifierKey(code)) {
      pressedModifiers.current.add(getModifierName(code))
      return
    }

    // 处理普通按键
    const keyName = keyCodeMap[code]
    if (keyName) {
      // 构建快捷键字符串
      const shortcut = buildShortcutString(pressedModifiers.current, keyName)
      if (shortcut) {
        onChange(shortcut)
        // 短暂延迟后停止录制，让用户看到结果
        setTimeout(() => stopRecording(), 150)
      }
    }
  }

  /** 按键松开 */
  function onKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!isRecording) return

    e.preventDefault()
    e.stopPropagation()

    const code = e.code

    // 修饰键释放时从集合中移除
    if (isModifierKey(code)) {
      pressedModifiers.current.delete(getModifierName(code))
    }
  }

  /** 聚焦：开始录制并清空按键状态 */
  function onFocus() {
    setIsRecording(true)
    pressedModifiers.current.clear()
  }

  /** 失焦：停止录制 */
  function onBlur() {
    stopRecording()
  }

  /** 全局点击：点击组件外部时停止录制 */
  function onGlobalClick(e: MouseEvent) {
    if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
      stopRecording()
    }
  }

  // 挂载时注册全局点击监听，卸载时移除（避免内存泄漏）
  useEffect(() => {
    document.addEventListener('click', onGlobalClick)
    return () => {
      document.removeEventListener('click', onGlobalClick)
    }
  }, [])

  // 根据状态计算样式类名
  const className = [
    'shortcut-input',
    isRecording ? 'recording' : '',
    status === 'occupied' ? 'occupied' : '',
    status === 'available' ? 'available' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      tabIndex={0}
      className={className}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocus={onFocus}
      onBlur={onBlur}
      ref={inputRef}
    >
      {isRecording ? (
        <span className="shortcut-hint">{t('settings.pressShortcut')}</span>
      ) : displayValue ? (
        <span className="shortcut-value">{displayValue}</span>
      ) : (
        <span className="shortcut-placeholder">{placeholder}</span>
      )}
      {isRecording && <span className="recording-dot"></span>}
      {status === 'occupied' && <span className="status-dot occupied-dot" title={t('settings.shortcutOccupied')}></span>}
      {status === 'available' && <span className="status-dot available-dot"></span>}
    </div>
  )
}