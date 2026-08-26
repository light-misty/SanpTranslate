import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'
import './styles/global.css'
import './i18n'
import App from './App'

/** 根组件：组装 antd 暗色主题与语言 locale、路由 */
function Main() {
  const { i18n } = useTranslation()
  // 根据当前界面语言选择 antd 组件库语言
  const antdLocale = i18n.language === 'zh-CN' ? zhCN : enUS
  return (
    <ConfigProvider locale={antdLocale} theme={{ algorithm: theme.darkAlgorithm }}>
      <AntdApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('app')!).render(<Main />)