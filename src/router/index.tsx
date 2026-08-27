import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

// 各窗口路由组件（懒加载，路径与后端窗口 URL 一致）
const OverlayView = lazy(() => import('@/views/OverlayView'))
const PinView = lazy(() => import('@/views/PinView'))
const SettingsView = lazy(() => import('@/views/SettingsView'))
const HistoryView = lazy(() => import('@/views/HistoryView'))
const TextTranslateView = lazy(() => import('@/views/TextTranslateView'))
const QuickFillView = lazy(() => import('@/views/QuickFillView'))

/** 路由出口组件 */
export default function AppRoutes() {
  return (
    <Suspense fallback={<div style={{ height: '100%' }} />}>
      <Routes>
        <Route path="/overlay" element={<OverlayView />} />
        <Route path="/pin" element={<PinView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="/history" element={<HistoryView />} />
        <Route path="/text-translate" element={<TextTranslateView />} />
        <Route path="/quick-fill" element={<QuickFillView />} />
      </Routes>
    </Suspense>
  )
}