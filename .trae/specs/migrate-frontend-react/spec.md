# SnapTranslate 前端技术栈迁移（Vue 3 → React 18）Spec

## Why

SnapTranslate 是基于 Tauri 2.x 的桌面截屏翻译工具，当前前端采用 Vue 3 + TypeScript。目标是将前端整体迁移至 React 18 + TypeScript，Rust 后端保持不变，所有现有功能等价运行。

## What Changes

- 前端框架由 Vue 3.5 迁移至 React 18，路由 vue-router → react-router-dom v6，状态管理 Pinia → Zustand，国际化 vue-i18n → react-i18next + i18next，UI 组件库 Naive UI → Ant Design，构建工具 Vite 6 保持不变。
- 入口 `src/main.ts` → `src/main.tsx`；根组件 `src/App.vue` → `src/App.tsx`；5 条路由路径（`/overlay`、`/pin`、`/settings`、`/history`、`/text-translate`）与懒加载方式保持不变。
- 5 个视图组件与 3 个公共组件全部迁移为 `.tsx`，样式保持深色透明主题。
- 3 个 Pinia store 迁移为 Zustand store，行为完全等价。
- 国际化语言包 `zh-CN.ts` / `en-US.ts` 内容原样复用，通过配置 i18next 插值符兼容既有 `{key}` 占位符。
- `src/utils/tauri.ts`（23 个 IPC 命令与全部接口定义）与 `src/utils/logger.ts` 保持不变。
- `src/styles/variables.css` 与 `src/styles/global.css` 保持不变。
- 删除 Vue 特有文件（`.vue`、`main.ts`、`env.d.ts` 中的 vue 声明），`index.html` 挂载点仍为 `#app`。
- 保留 `@/` 路径别名、`src/` 目录结构、`__APP_VERSION__` 全局注入、Vite 6 的 `define` 与 dev server 配置。

## Impact

- Affected specs：前端全部能力（入口、路由、状态管理、国际化、IPC 工具层、5 个视图、3 个公共组件、样式系统、构建流程）。
- Affected code：[package.json](file:///d:/DeskTop/SanpTranslate-react-frontend-migration/package.json)、[vite.config.ts](file:///d:/DeskTop/SanpTranslate-react-frontend-migration/vite.config.ts)、[tsconfig.json](file:///d:/DeskTop/SanpTranslate-react-frontend-migration/tsconfig.json)、[index.html](file:///d:/DeskTop/SanpTranslate-react-frontend-migration/index.html) 与 `src/` 下全部前端文件。
- 后端 `src-tauri/` 零改动；`src/utils/tauri.ts` 中 23 个命令绑定及 SettingsView 直接调用的 `reveal_in_explorer` 命令接口签名全部不变。

## MODIFIED Requirements

### Requirement: 应用入口与路由
- 系统 SHALL 在 `src/main.tsx` 中以 React 18 `createRoot` 初始化应用，注册 react-router-dom、react-i18next、antd 暗色主题 `ConfigProvider`（darkAlgorithm）并引入全局样式。
- 系统 SHALL 保持 5 条路由路径（`/overlay`、`/pin`、`/settings`、`/history`、`/text-translate`）不变，所有路由组件使用懒加载，路由挂在 `#app`。
- 系统 SHALL 在根组件挂载时从后端加载配置并应用界面语言（`auto` 按 `navigator.language` 判定），并监听后端广播的 `language-changed` 事件实时切换语言。
- 系统 SHALL 保留 `__APP_VERSION__` 全局常量（typescript 全局声明 + Vite `define` 注入）。

#### Scenario: 应用启动初始化语言
- **WHEN** 任意窗口首次加载
- **THEN** 界面按配置语言显示（跟随系统/简体中文/English），并与原 Vue 行为一致

#### Scenario: 跨窗口语言切换
- **WHEN** 设置页修改界面语言并有其它窗口已打开
- **THEN** 当前窗口立即切换，其它窗口通过 `language-changed` 事件同步切换

### Requirement: 状态管理（Zustand）
- 系统 SHALL 使用 Zustand 实现 `configStore`（config/loading/error/apiKey 与 loadConfig/updateConfig/loadApiKey/setApiKey，失败时写 error 字段不抛出），`pinStore`（`Map<string, PinState>` 的 addPin/removePin/getPin/updatePin，保留 `TranslatedBlock`/`PinState` 类型），`historyStore`（historyList/loading/currentDetail 与 loadHistory/loadDetail/deleteHistory/clearHistory/copyTranslation，均带日志与异常抛出）。
- 系统 SHALL 保持与 Pinia 版本相同的对外行为与类型定义。

#### Scenario: 保存配置
- **WHEN** 设置页触发配置保存
- **THEN** 配置写入后端，本地 state 同步更新，失败时设置 error 供页面提示

### Requirement: 国际化
- 系统 SHALL 使用 react-i18next 提供 `t()` 能力，语言包复用现有 `zh-CN.ts` / `en-US.ts` 内容（不做文案改动）。
- 系统 SHALL 配置 i18next 插值符为 `{` / `}`，兼容语言包中已有的 `{version}`、`{date}`、`{error}` 占位符。
- 系统 SHALL 支持"跟随系统（auto）"、"简体中文（zh-CN）"、"English（en-US）"三种选项，默认语言按 `navigator.language` 判定，fallback 为 `en-US`。

#### Scenario: 切换界面语言
- **WHEN** 用户切换语言选项
- **THEN** 所有 `t()` 文案立即更新，且语言设置持久化到后端

### Requirement: IPC 工具层
- 系统 SHALL 保持 `src/utils/tauri.ts` 的 23 个命令绑定与全部 9 个接口定义（AppConfig/ShortcutConfig/CropResult/OcrBlock/TranslatedBlock/TranslateResult/TextTranslateResult/HistoryListItem/HistoryEntry）不做任何修改。
- 系统 SHALL 保持 `src/utils/logger.ts` 日志工具不变。

#### Scenario: 命令调用
- **WHEN** 任一视图调用 IPC 命令
- **THEN** 参数名、返回值类型与后端 Rust 命令签名完全一致

### Requirement: 截图蒙版 OverlayView
- 系统 SHALL 保持全屏 Canvas 绘制、鼠标框选（白色虚线框 + `evenodd` clip 暗色镂空蒙版）、自定义白色十字准星光标、实时尺寸提示、Esc 键与右键关闭。
- 系统 SHALL 保持性能优化：拖拽/光标位置使用非响应式状态（React ref/普通变量），Canvas 绘制与光标更新走 `requestAnimationFrame`，尺寸提示低频更新 state。
- 系统 SHALL 保持 `get_overlay_image` 轮询拉取（100ms × 50 次 + 最终补偿），框选完成后：创建 `/pin` 透明贴图窗口（`WebviewWindow`，窗口位置/宽高含 `PIN_PADDING=14` 与控制栏高度 36）→ `capture_region_from_cache`（物理像素坐标）→ `store_pin_image` → 销毁蒙版窗口。

#### Scenario: 框选截图
- **WHEN** 用户在蒙版上框选一个区域（宽高不小于 5px）并松开鼠标
- **THEN** 创建贴图窗口并展示裁剪图像，随后蒙版关闭

### Requirement: 贴图窗口 PinView
- 系统 SHALL 保持截图图像展示、右侧垂直 ControlBar、可拉伸高度的译文面板、边缘亮度自适应阴影（Canvas 采样四边，阈值 0.45 选亮/暗阴影）。
- 系统 SHALL 保持窗口几何逻辑：核心叠放区宽 `max(图片逻辑宽,160)` + 控制栏宽（已加载时 `90+8`）+ `PIN_PADDING*2`；高度含译文面板并下限 150；`setSize` 采用 80ms 节流；初始加载与翻译完成后执行防越界平移。
- 系统 SHALL 保持交互：按下拖拽（`startDragging`，排除控制栏按钮与面板拉伸手柄）、双击图片关闭窗口、面板拉伸后更新窗口高度。
- 系统 SHALL 保持翻译流程：`getConfig` → `translateImage`（forceRetranslate 参数区分翻译/重新翻译）→ 面板按内容自适应初始高度 → 更新窗口；以及 OCR 复制原文（idle 态）、复制译文、原文/译文切换。

#### Scenario: 翻译流程
- **WHEN** 用户点击"翻译"按钮且图片已就绪
- **THEN** 状态进入 translating，成功后展示译文面板并调整窗口大小，缓存命中时显示提示

### Requirement: 设置页面 SettingsView
- 系统 SHALL 保持全部设置区块：界面语言（即时生效并保存）、通用设置（开机自启动开关）、API 配置（提供商/地址/密钥/模型，密钥走系统密钥环，含保存/删除/测试连接）、翻译配置（目标语言/OCR 源语言）、快捷键配置（3 个快捷键 + 恢复默认）、更新设置（版本展示/自动更新开关/手动检查/下载进度/安装重启）、配置与日志文件路径展示及"打开"（`reveal_in_explorer`）。
- 系统 SHALL 将 Naive UI 组件等价迁移为 antd 组件（Card/Form/Input/Select/Button/Switch/Progress/Typography/Tooltip/Spin），message/modal 使用跟随暗色主题的 antd 实例（App.useApp 或等价全局实例）。
- 系统 SHALL 保持表单交互细节：非 `language`/`api_key` 字段 500ms 防抖自动保存；语言变更单独即时保存；API 密钥由独立按钮保存/删除。
- 系统 SHALL 保持自动更新逻辑使用 `@tauri-apps/plugin-updater` 的 `check()` 与 `downloadAndInstall()`（含 Started/Progress/Finished 事件与进度条、重启对话框）。Update 对象不得被深响应式包装。

#### Scenario: 自动保存
- **WHEN** 用户修改 API 地址、模型、目标语言等字段并停顿 500ms
- **THEN** 配置自动保存到后端，失败时弹出错误提示

### Requirement: 历史记录 HistoryView
- 系统 SHALL 保持历史列表（缩略图/摘要/时间）、详情弹窗（缩略图/原文/译文/时间、复制原文/译文、删除）、图片放大预览、清空全部（带确认）、空状态展示。
- 系统 SHALL 保持 HistoryItem 悬停显示复制/删除操作按钮，点击条目查看详情。

#### Scenario: 查看与删除
- **WHEN** 用户点击历史条目
- **THEN** 加载详情并弹出弹窗；确认删除后列表与详情同步移除

### Requirement: 文本翻译 TextTranslateView
- 系统 SHALL 保持标题栏拖拽（`data-tauri-drag-region`）与双击关闭、关闭按钮、可滚动输入区、目标语言下拉（临时覆盖，不回写配置）、翻译按钮状态机（idle/translating/done/error）、Ctrl+Enter 快捷翻译、输入变化重置结果、译文面板（缓存提示 + 复制反馈 1.5s）、错误提示。
- 系统 SHALL 保持 Esc 键关闭窗口，挂载时读取 `getConfig` 初始化默认目标语言并自动聚焦输入框。

#### Scenario: 快捷翻译
- **WHEN** 用户在输入框按下 Ctrl+Enter
- **THEN** 调用 `translateText` 翻译，完成后显示译文并可复制

### Requirement: 样式系统
- 系统 SHALL 保持 `src/styles/variables.css`（深色透明主题 CSS 变量）与 `src/styles/global.css`（全局重置，`#app` 全屏）不变。
- 系统 SHALL 将各视图/组件的 scoped 样式迁移为 React 侧的独立样式文件（CSS Modules 或同名单文件 CSS），样式规则与原 Vue scoped 样式保持一致（含自定义滚动条、hover 效果、动画）。

### Requirement: 构建与开发流程
- 系统 SHALL 更新 `package.json`：移除 vue/pinia/vue-i18n/vue-router/naive-ui/@vitejs/plugin-vue/vue-tsc，新增 react/react-dom/react-router-dom/zustand/react-i18next/i18next/antd，devDependencies 新增 `@vitejs/plugin-react`，`build` 脚本改为 `tsc --noEmit && vite build`。
- 系统 SHALL 更新 `vite.config.ts` 使用 React 插件，保留 `@` 别名与 `__APP_VERSION__` 注入及原有 dev server 配置。
- 系统 SHALL 更新 `tsconfig.json` 设置 `jsx: "react-jsx"` 并让 include 覆盖 `src/**/*.tsx`，保留 `@/*` paths。
- 系统 SHALL 保证 `pnpm build`（tsc 类型检查 + vite build）通过，`pnpm dev` 正常启动且 HMR 可用，`src-tauri` 编译与运行不受影响。

#### Scenario: 构建通过
- **WHEN** 执行 `pnpm build`
- **THEN** 类型检查与打包均成功，无报错输出

## REMOVED Requirements

### Requirement: Vue 特有文件与声明
**Reason**: 前端技术栈整体迁移至 React。
**Migration**: `src/main.ts`、`src/App.vue`、`src/views/*.vue`、`src/components/*.vue` 删除，由 `src/main.tsx`、`src/App.tsx`、`src/views/*.tsx`、`src/components/*.tsx` 对应实现替代；`src/env.d.ts` 中 vue shim 与 vue-router/vue-i18n 模块增强移除，保留 `vite/client` 引用。