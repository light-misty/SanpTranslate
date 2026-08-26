# Checklist

## 构建配置

- [x] package.json 已移除 vue 相关依赖并新增 react/react-dom/react-router-dom/zustand/react-i18next/i18next/antd 及 @vitejs/plugin-react，`build` 脚本为 `tsc --noEmit && vite build`
- [x] vite.config.ts 使用 React 插件，保留 `@` 别名、`__APP_VERSION__` define 与 dev server 配置
- [x] tsconfig.json `jsx: "react-jsx"` 且 include 覆盖 `.tsx`，`@/*` paths 保留
- [x] index.html 入口为 `/src/main.tsx`，挂载点 `#app` 不变

## 应用基础

- [x] `src/main.tsx` 以 createRoot 挂载，注册 antd ConfigProvider(darkAlgorithm) + App、路由器与全局样式
- [x] 5 条路由路径（/overlay、/pin、/settings、/history、/text-translate）不变且全部懒加载
- [x] `src/App.tsx` 挂载时按配置初始化语言，并监听 `language-changed` 事件实时切换；卸载时注销监听
- [x] i18n 使用 i18next，语言包内容未被改动，`{key}` 插值符兼容（{version}/{date}/{error} 渲染正确），支持跟随系统/中文/English

## 状态管理

- [x] configStore：config/loading/error/apiKey 与 loadConfig/updateConfig/loadApiKey/setApiKey，失败写 error 不抛出的语义与原版一致
- [x] pinStore：Map 结构 pins 与 addPin/removePin/getPin/updatePin，TranslatedBlock/PinState 类型保留
- [x] historyStore：historyList/loading/currentDetail 与 loadHistory/loadDetail/deleteHistory/clearHistory/copyTranslation，日志与抛错语义一致

## IPC 工具层

- [x] src/utils/tauri.ts 未被修改（23 个命令 + 9 个接口定义不变）
- [x] src/utils/logger.ts 未被修改

## 视图与组件

- [x] OverlayView：Canvas 全屏绘制、evenodd 镂空蒙版 + 白虚线框、自定义十字光标、尺寸提示、Esc/右键关闭、get_overlay_image 轮询、框选后创建贴图窗口（capture_region_from_cache + store_pin_image + 销毁蒙版）；拖拽状态非响应式且绘制走 rAF
- [x] PinView：图片拉取/逻辑尺寸计算、窗口几何与 setSize 80ms 节流、防越界平移、边缘亮度自适应阴影、译文面板（自适应高度/拉伸）、翻译流程（translateImage/OCR 复制/复制译文/切换原文）、拖拽移动与双击关闭
- [x] SettingsView：界面语言即时生效、开机自启动、API 配置（提供商/地址/密钥/模型）、测试连接、翻译配置、快捷键（3 项 + 恢复默认）、自动更新（检查/进度/重启）、路径展示与"打开"；500ms 防抖自动保存
- [x] HistoryView：列表、详情弹窗（原文/译文/时间/复制/删除）、图片放大预览、清空全部（带确认）、空状态
- [x] TextTranslateView：拖拽标题栏/双击关闭、Ctrl+Enter、目标语言临时覆盖、缓存提示、复制反馈 1.5s、Esc 关闭
- [x] ControlBar/ShortcutInput/HistoryItem 三个公共组件行为与样式等价

## 样式与后端

- [x] src/styles/variables.css 与 src/styles/global.css 未改动，视图/组件样式规则与原 scoped 样式保持一致（深色透明主题）
- [x] src-tauri/ 目录零改动
- [x] 源码中无残留 `.vue` 文件与 vue 相关 import/依赖引用

## 构建与运行

- [x] `pnpm build`（tsc --noEmit && vite build）通过，无类型错误
- [x] `pnpm dev` 正常启动，无控制台报错，HMR 可用