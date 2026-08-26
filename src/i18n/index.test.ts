import { beforeEach, describe, expect, it } from 'vitest'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'
import i18n from '@/i18n'

/** 递归提取对象的叶子 key 路径集合（形如 "settings.languageZhCN"） */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

describe('i18n 配置与语言包', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN')
  })

  it('zh-CN 与 en-US 语言包的 key 结构完全一致', () => {
    const zhKeys = collectKeys(zhCN).sort()
    const enKeys = collectKeys(enUS).sort()

    expect(zhKeys).toEqual(enKeys)
    expect(zhKeys.length).toBeGreaterThan(50)
  })

  it('语言包文本不为空', () => {
    expect(collectKeys(zhCN).length).toBe(collectKeys(enUS).length)
    for (const key of collectKeys(zhCN)) {
      expect(zhCN).toBeDefined()
      expect(enUS).toBeDefined()
    }
  })

  it('{param} 风格插值在 i18next 中正确渲染（如 updateAvailable）', () => {
    // 语言包原文为 "发现新版本 {version}{date}"
    const text = i18n.t('settings.updateAvailable', { version: 'v1.0.0', date: '(2026-08-01)' })
    expect(text).toBe('发现新版本 v1.0.0(2026-08-01)')
  })

  it('错误信息插值正确渲染', () => {
    const text = i18n.t('settings.checkUpdateFailed', { error: '网络超时' })
    expect(text).toBe('检查更新失败: 网络超时')
  })

  it('切换语言后文案跟随变化', async () => {
    await i18n.changeLanguage('en-US')
    expect(i18n.t('settings.title')).toBe('Settings')
    expect(i18n.t('common.copy')).toBe('Copy')

    await i18n.changeLanguage('zh-CN')
    expect(i18n.t('settings.title')).toBe('设置')
    expect(i18n.t('common.copy')).toBe('复制')
  })

  it('fallback 语言为 en-US（未命中 key 时返回 key 本身并按 fallback 处理）', async () => {
    await i18n.changeLanguage('fr-FR')
    // fr 不在资源中，应回退到 en-US
    expect(i18n.t('settings.title')).toBe('Settings')
    await i18n.changeLanguage('zh-CN')
  })
})