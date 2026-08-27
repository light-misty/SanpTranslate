import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

/** 跟随系统默认语言 */
const initialLanguage = navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US'

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: initialLanguage,
  fallbackLng: 'en-US',
  interpolation: {
    prefix: '{',
    suffix: '}',
    escapeValue: false,
  },
})

export default i18n