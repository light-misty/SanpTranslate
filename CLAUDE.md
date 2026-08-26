# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

- 在回答过程中请使用中文
- 在代码中添加中文注释

***

## 项目概述

SnapTranslate 是一款基于 Tauri 2.x 的桌面截屏翻译工具。它能截取屏幕区域、执行 OCR（Tesseract）识别文字并调用 AI 翻译，将译文展示在右侧译文面板中，以贴图形式固定在桌面上。

**当前状态：** S5 阶段已完成 — 截图、剪贴板、快捷键、贴图窗口、框选蒙版、托盘菜单、OCR、翻译、设置页面、历史记录、国际化、文本翻译、开机自启动、自动更新均已实现。最新优化包括：翻译缓存机制、原图数据存储、译文面板布局优化、界面语言即时切换、OCR 源语言选择、自动更新机制、自定义十字准星光标。

## 开发命令

```bash
# 开发模式（Vite HMR + Tauri）
pnpm run tauri dev

# 构建生产版本
pnpm run tauri build

# 仅前端（Vite 开发服务器）
pnpm run dev

# 前端类型检查
npx tsc --noEmit

# 前端单元测试（Vitest + Testing Library）
pnpm run test

# Vite 预览
pnpm run preview
```

## 架构

### 运行时流程

1. 用户按下全局快捷键（默认 `Ctrl+Alt+L`）→ 截图模块截取屏幕
2. 截图以透明窗口形式固定在原位置（贴图窗口）
3. 用户点击"AI 翻译"→ 本地 Tesseract OCR 提取文字及坐标 → 查找历史缓存（命中则跳过 API）→ 调用 AI API 翻译文本
4. 译文以标签形式覆盖在原文本位置上
5. 翻译记录自动保存到本地 SQLite 数据库（含缓存数据）

### Rust 后端（`src-tauri/src/`）

| 模块          | 文件                  | 状态                                                                                                                                                                                                  |
| ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture`   | `capture/mod.rs`    | **已完成** — `CaptureService` 封装 xcap，支持全屏截图和区域截图，返回 Base64 PNG/JPEG；包含 `MonitorInfo`、`CaptureRegion`、`CapturedImage` 数据结构；支持缓存截图数据供区域裁剪使用                                                                                  |
| `ocr`       | `ocr/mod.rs`        | **已完成** — 使用 Tesseract CLI 进行本地文字识别，支持从资源目录或系统 PATH 查找 Tesseract；`extract_text_with_positions` 提取文字及坐标，TSV 解析将词级结果合并为行级块；包含 `OcrBlock` 数据结构（百分比坐标）；新增 `ocr_image` 命令支持按配置的源语言进行 OCR 识别 |
| `translate` | `translate/mod.rs`  | **已完成** — OCR 模式翻译：本地 Tesseract 提取文字及坐标 → 查找历史缓存（命中则跳过 API）→ 调用文本模型 API 翻译 → 合并坐标返回翻译块；包含 `translate_with_ocr_blocks`（接收预提取 OCR 块）、`call_text_api`（OpenAI 兼容格式）、`TranslatedBlock`/`TranslateResult`（含 `from_cache` 字段）/`TextTranslateResult`（纯文本翻译结果）数据结构；支持翻译缓存机制，避免重复翻译相同内容 |
| `update`    | `update/mod.rs`     | **已完成** — 自动更新模块：使用 `tauri-plugin-updater` 在应用启动时静默检查更新；`check_and_install_update` 发现新版本时自动下载安装，完成后调用 `app.restart()` 重启应用；仅在 release 模式下运行，dev 模式下跳过 |
| `clipboard` | `clipboard/mod.rs`  | **已完成** — `read_clipboard_image`/`write_clipboard_image`/`write_clipboard_text`，支持 Base64 和原始 RGBA 数据读写图片                                                                                |
| `hotkey`    | `hotkey/mod.rs`     | **已完成** — `register_hotkeys` 注册全局快捷键（从配置动态解析），支持 Ctrl/Shift/Alt/Super 修饰键 + A-Z/0-9/F1-F12，回调中串联截图或剪贴板操作；新增 `reregister_hotkeys` 支持快捷键配置变更后重新注册                                                                                            |
| `history`   | `history/mod.rs`    | **已完成** — `HistoryService` 管理 SQLite 数据库，支持 CRUD 操作和缩略图生成（最大 200x200 JPEG）；包含 `HistoryEntry`、`HistoryListItem`、`NewHistoryEntry`（含 `target_language` 和 `blocks_json` 字段）数据结构；新增 `find_by_ocr_text` 方法用于翻译缓存匹配；支持原图数据存储（Base64 编码）；默认最多 50 条记录，超出自动删除最旧的 |
| `config`    | `config/manager.rs` | **已完成** — 基于 TOML 的配置（API URL、模型名称、目标语言、快捷键），从 `app_config_dir/config.toml` 加载，通过临时文件+重命名实现原子写入；支持通过 keyring 管理 API 密钥；新增 `delete_api_key` 删除密钥、`get_config_path` 获取配置文件路径                                                                                                       |
| `config`    | `config/mod.rs`     | 重新导出 `AppConfig`、`ConfigManager`、`ShortcutConfig`；新增 `resolve_language` 函数解析界面语言（支持 auto 跟随系统）                                                                                                                                   |
| `window`    | `window/mod.rs`     | **已完成** — `create_settings_window`/`create_history_window`（单例模式）、`create_overlay_window`（全屏蒙版，将图像数据存入缓存供前端拉取）、`create_pin_window`（UUID 标签，窗口尺寸预留控制栏高度）、`create_text_translate_window`（文本翻译窗口，屏幕下方居中）、`close_pin_window`、`get_pin_image`、`PinImageStore`/`CachedScreenStore`/`CachedScreen`/`OverlayImageData`/`CropResult` 数据结构 |
| `tray`      | `tray/mod.rs`       | **已完成** — 系统托盘菜单：框选截图翻译、从剪贴板贴图、文本翻译、历史记录、设置、重新启动、退出；所有菜单项已接入实际逻辑；新增 `update_tray_menu` 支持语言切换后更新菜单文本；新增 `emit_language_changed` 广播语言变更事件                                                                                                                  |
| `commands`  | `commands.rs`       | **已完成** — 二十三个 Tauri 命令：`get_config`、`save_config`、`write_clipboard_image`、`read_clipboard_image`、`write_clipboard_text`、`close_pin_window`、`get_pin_image`、`capture_region_from_cache`、`get_overlay_image`、`store_pin_image`、`translate_image`、`ocr_image`、`translate_text`、`get_api_key`、`set_api_key`、`delete_api_key`、`get_config_path`、`test_api_connection`、`get_history_list`、`get_history_detail`、`delete_history`、`clear_history`、`restart_app` |
| `error`     | `error.rs`          | **已完成** — 统一的 `AppError` 枚举，`Display` 输出中文错误信息，包含 `io`、`toml`、`reqwest`、`rusqlite`、`tauri` 的 `From` 实现；新增 `TrayError` 变体 |
| `lib.rs`    | —                   | 应用入口点：注册 opener、clipboard_manager、log、autostart 插件；管理 `PinImageStore`、`CachedScreenStore`、`TrayState` 和 `HistoryService` 状态；注册所有命令；在 `setup()` 中初始化截图服务、历史服务、创建系统托盘并注册全局快捷键                                                                              |
| `main.rs`   | —                   | `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`，调用 `snap_translate_lib::run()`                                                                                                 |

**关键后端模式：** 所有模块在其目录下均为扁平化的 `mod.rs` 文件。目前只有 config 采用了拆分模块结构（config/mod.rs + config/manager.rs）。

**主要依赖库：** tauri 2、tauri-plugin-opener、tauri-plugin-clipboard-manager、tauri-plugin-global-shortcut、tauri-plugin-log、tauri-plugin-autostart、tauri-plugin-updater、serde、serde_json、xcap、reqwest、toml、keyring、rusqlite、image、base64、uuid、log、sys-locale

### 前端（`src/`）

| 层级    | 文件                          | 用途                                                                            |
| ----- | --------------------------- | ----------------------------------------------------------------------------- |
| 入口    | `main.tsx`                   | 创建 React 应用，挂载 antd ConfigProvider（深色主题）+ App、BrowserRouter 路由与根组件 App                                   |
| 根组件  | `App.tsx`                    | 路由出口；挂载时加载配置初始化界面语言，监听 `language-changed` 事件跨窗口同步语言                         |
| 路由    | `router/index.tsx`           | 五个路由（懒加载）：`/overlay`（截图蒙版）、`/pin`（贴图）、`/settings`、`/history`、`/text-translate`（文本翻译）                       |
| 组件    | `components/ControlBar.tsx`  | **已完成** — 贴图控制栏组件：根据翻译状态（idle/translating/done/error）显示翻译/重新翻译按钮、翻译中状态、复制原文/复制译文/重新翻译/原文译文切换按钮组；支持错误重试；缓存命中提示（`fromCache` prop） |
| 组件    | `components/ShortcutInput.tsx` | **已完成** — 快捷键输入组件：支持点击后监听键盘输入捕获快捷键组合，显示当前快捷键，支持清空和重新设置 |
| 组件    | `components/HistoryItem.tsx` | **已完成** — 历史条目组件：显示缩略图、翻译摘要和时间，支持悬停显示复制/删除操作按钮 |
| 状态    | `stores/configStore.ts`      | **已完成** — 配置状态管理（Zustand，通过 `invoke` 与 Rust 后端进行加载/保存），包含 `loadApiKey`/`setApiKey` 方法管理 API 密钥（从 keyring 读取/写入） |
| 状态    | `stores/pinStore.ts`         | 贴图状态管理（`TranslatedBlock`、`PinState` 及贴图实例的 Map）                               |
| 状态    | `stores/historyStore.ts`     | **已完成** — 历史记录状态管理：加载列表、查看详情、删除、清空、复制翻译                               |
| 国际化   | `i18n/index.ts`              | `i18next` 配置（react-i18next），自动检测 zh-CN 或 en-US；支持监听 `language-changed` 事件动态切换语言，插值兼容 `{param}` 占位符                                              |
| 国际化   | `i18n/locales/zh-CN.ts`      | **已完成** — 中文语言文件，覆盖通用、控制栏、贴图、设置、历史记录、文本翻译等模块                                              |
| 国际化   | `i18n/locales/en-US.ts`      | **已完成** — 英文语言文件，覆盖通用、控制栏、贴图、设置、历史记录、文本翻译等模块                                              |
| 工具函数  | `utils/tauri.ts`            | **已完成** — Tauri 命令的 TypeScript 绑定（所有命令均已覆盖），包含 `AppConfig`、`CropResult`、`OcrBlock`、`TranslatedBlock`、`TranslateResult`（含 `from_cache` 字段）、`TextTranslateResult`、`HistoryListItem`、`HistoryEntry` 等接口定义；`enableAutoStart`/`disableAutoStart`/`isAutoStartEnabled` 开机自启动 API；`ocrImage` 和 `restartApp` 命令绑定 |
| 工具函数  | `utils/logger.ts`           | 日志工具，封装 `@tauri-apps/plugin-log`，提供带时间戳和标签的 debug/info/warn/error 结构化日志输出 |
| 样式    | `styles/variables.css`      | CSS 自定义属性（深色透明主题）                                                             |
| 样式    | `styles/global.css`         | 全局重置及基础样式                                                                     |
| 视图    | `views/OverlayView.tsx`     | **已完成** — Canvas 全屏截图蒙版，支持鼠标框选（白虚线框+暗色蒙版+十字准星光标）、尺寸提示、Esc/右键关闭；选后调用后端裁剪+创建贴图窗口；拖拽状态非响应式并走 rAF 渲染 |
| 视图    | `views/PinView.tsx`         | **已完成** — 贴图窗口：显示截图、控制栏组件（翻译/复制/切换）、原生窗口拖拽（排除按钮区域）、双击图片区域关闭；集成 OCR 翻译功能、右侧译文面板布局、面板拉伸功能、自适应阴影样式；支持复制原文/译文、原文/译文切换、重新翻译（跳过缓存） |
| 视图    | `views/SettingsView.tsx`    | **已完成** — 设置页面：使用 antd（Ant Design 5）组件库，包含界面语言配置（即时切换）、通用设置（开机自启动、自动更新）、API 配置（地址/密钥/模型）、翻译配置（目标语言）、OCR 源语言配置（自动/中文/英文/日文）、快捷键配置；支持防抖自动保存和测试 API 连接；API 密钥通过 keyring 管理；支持删除 API 密钥；显示配置文件路径 |
| 视图    | `views/HistoryView.tsx`     | **已完成** — 历史记录页面：使用 antd 深色主题，支持列表展示、详情弹窗、图片放大预览、复制翻译、逐条删除、清空全部                                   |
| 视图    | `views/TextTranslateView.tsx` | **已完成** — 文本翻译页面：无边框置顶窗口，屏幕下方居中；支持输入文本翻译、Ctrl+Enter 快捷翻译、复制译文（带反馈）、缓存命中提示、Esc/双击关闭 |

**关键前端模式：** 使用 `@/` 路径别名（在 vite.config.ts 和 tsconfig.json 中均已配置）。通过 `@tauri-apps/api/core` 的 `invoke()` 进行 Tauri IPC 通信。窗口间数据传递采用"后端缓存 + 前端主动拉取"模式（非 Event 推送）。所有视图均为懒加载。

**主要依赖库：** react 18.3、react-dom 18.3、react-router-dom 6、zustand 5、i18next 24、react-i18next 15、antd 5、@tauri-apps/api 2、@tauri-apps/plugin-log、@tauri-apps/plugin-autostart；测试：vitest、@testing-library/react、jsdom

### 前端通信模式

- **蒙版窗口流程：** `lib.rs` setup → 快捷键/托盘回调 → `capture::capture_fullscreen_with_cache()` → 缓存全屏截图到 `CachedScreenStore.screen` → `window::create_overlay_window()` → 后端将 JPEG 图像数据存入 `CachedScreenStore.overlay_image` → OverlayView 调用 `get_overlay_image` 命令拉取数据 → 绘制截图 → 用户框选 → `capture_region_from_cache` 命令 → 返回 `CropResult`（含图像和位置信息）→ `store_pin_image` 存储图像 → 创建贴图窗口
- **贴图窗口流程：** `create_pin_window()` 创建 WebviewWindow → PinView 调用 `get_pin_image` 命令从 `PinImageStore` 拉取图像数据 → 显示图片 + ControlBar
- **翻译流程：** 用户点击"翻译"按钮 → PinView 调用 `get_config` 获取目标语言和 OCR 源语言 → 调用 `translate_image` 命令 → 后端按配置的 OCR 源语言执行 Tesseract OCR 提取文字及坐标 → 查找历史缓存（根据 OCR 文本和目标语言匹配，命中则直接返回）→ 未命中则调用文本模型 API 翻译 → 返回 `TranslateResult`（包含 `TranslatedBlock[]` 和 `from_cache` 标志）→ 前端在右侧译文面板渲染翻译结果 → 后端异步保存历史记录（含 `target_language` 和 `blocks_json`）
- **文本翻译流程：** 用户按 `Ctrl+Alt+M` 或托盘菜单"文本翻译" → `create_text_translate_window()` 创建文本翻译窗口 → TextTranslateView 显示输入框 → 用户输入文本并点击翻译 → 调用 `translate_text` 命令 → 后端查找历史缓存（命中则直接返回）→ 未命中则调用文本模型 API 翻译 → 返回 `TextTranslateResult`（包含 `translated_text` 和 `from_cache` 标志）→ 前端显示译文 → 后端异步保存历史记录（无图片）
- **历史记录流程：** 翻译完成 → 后端自动保存到 SQLite → 用户点击托盘"历史" → 前端调用 `get_history_list` → HistoryView 展示列表
- **语言切换流程：** 用户在设置页面切换界面语言 → `onLanguageChange` 调用 `i18n.changeLanguage` 立即切换当前窗口语言 → 调用 `save_config` 保存配置 → 后端调用 `update_tray_menu` 更新托盘菜单文本 → 后端调用 `emit_language_changed` 广播语言变更事件 → 其它窗口监听事件并通过 `i18n.changeLanguage` 同步界面语言
- **自动更新流程：** `lib.rs` setup 阶段 → 读取配置 `auto_update` 字段 → 若为 true → `update::check_and_install_update` → `updater.check()` 检查更新 → 发现新版本 → `update.download_and_install()` 静默下载安装 → 完成后 `app.restart()` 重启应用

### AppConfig 结构（Rust）

```rust
pub struct AppConfig {
    pub api_base_url: String,      // AI API 基础地址
    pub model: String,             // AI 模型名称，例如 "gpt-4o"
    pub target_language: String,   // 目标翻译语言，默认 "zh-CN"
    pub language: String,          // 界面语言，"auto" 跟随系统，"zh-CN" 或 "en-US"
    pub ocr_language: String,      // OCR 识别语言，"auto" 自动检测，"chi_sim"/"eng"/"jpn"
    pub auto_update: bool,         // 是否开启自动更新，默认 true
    pub shortcuts: ShortcutConfig, // 快捷键配置
}

pub struct ShortcutConfig {
    pub capture: String,           // 截图翻译快捷键，默认 "Ctrl+Alt+L"
    pub pin_clipboard: String,     // 从剪贴板贴图快捷键，默认 "Ctrl+Alt+P"
    pub text_translate: String,    // 文本翻译快捷键，默认 "Ctrl+Alt+M"
}
```

### 关键设计决策

- **配置存储：** TOML 文件存储在磁盘上，API 密钥通过操作系统凭据管理器（`keyring` crate）保存 — 不写入配置文件
- **界面语言：** 支持"跟随系统"、"简体中文"、"English"三种选项；"跟随系统"时使用 `sys-locale` 检测系统语言；切换语言后立即生效，无需点击保存
- **翻译流程：** 本地 Tesseract OCR 提取文字及坐标 → 查找历史缓存（根据 OCR 文本和目标语言匹配）→ 未命中则调用 AI API 翻译 → 按行匹配坐标返回翻译块
- **翻译缓存：** 历史记录存储 `target_language` 和 `blocks_json` 字段，用于缓存匹配；命中缓存时直接返回翻译结果，跳过 API 调用
- **译文展示：** 翻译结果显示在右侧独立面板，支持高度拉伸；原文/译文切换时隐藏/显示译文面板
- **OCR 源语言：** 支持 `auto`（自动检测）、`chi_sim`（中文简体）、`eng`（英文）、`jpn`（日文）四种模式；自动检测模式通过 Tesseract 内置语言检测实现，可在设置页面配置；新增 `ocr_image` 命令支持按配置的源语言执行 OCR 识别
- **自动更新：** 使用 `tauri-plugin-updater` 实现，在 `setup()` 中根据 `auto_update` 配置决定是否检查更新；检查更新、下载安装均在后台静默完成，安装完成后自动重启应用；更新检查仅在 release 构建中执行，dev 模式下跳过
- **Tesseract 资源：** 项目捆绑 Tesseract 可执行文件和语言数据（`src-tauri/resources/tesseract/`），包含中文简体（`chi_sim.traineddata`）和英文（`eng.traineddata`）训练数据，以及 Windows DLL 依赖；OCR 模块优先从资源目录查找，开发模式下回退到系统 PATH
- **贴图窗口：** 每张贴图截图都是一个独立的透明 Tauri Webview 窗口，定位在原始截取坐标处，窗口尺寸 = 图片尺寸 + 14px 内边距 + 36px 控制栏高度
- **图像缓存：** 全屏截图缓存于 `CachedScreenStore`（含 `screen` 和 `overlay_image`），贴图图像缓存于 `PinImageStore`，前端通过命令主动拉取而非 Event 推送
- **错误处理：** 统一的 `AppError` 枚举，`Display` 输出中文错误信息，包含所有主要错误类型的 `From` 实现
- **窗口管理：** 设置和历史记录窗口为单例（如果已打开则复用现有窗口）；蒙版窗口为单例（打开前先关闭已有实例）；贴图窗口每次创建新实例（UUID 标签）；文本翻译窗口为单例
- **UI 框架：** Ant Design（antd 5）已在设置页面和历史页面中使用，全局通过 `ConfigProvider` 应用深色主题（darkAlgorithm），message/modal 通过 `App.useApp()` 获取随主题渲染的实例
- **日志系统：** 使用 `tauri-plugin-log`，输出到 Stdout、Webview 控制台和日志文件目录
- **历史记录：** SQLite 数据库存储在 `{app_data_dir}/data/history.db`，最多保存 50 条记录，缩略图最大 200x200 JPEG 格式；数据库包含 `target_language` 和 `blocks_json` 列用于翻译缓存；新增 `image_blob` 列存储原图数据（Base64 编码）；文本翻译记录的 `image_data` 和 `thumbnail` 为 null
- **开机自启动：** 使用 `tauri-plugin-autostart` 插件实现，支持 Windows/macOS/Linux 跨平台自启动
- **NSIS 安装包：** 使用自定义 NSIS 安装包模板（`src-tauri/nsis/installer.nsi`），提供 Windows 平台的自定义安装体验；模板支持安装路径选择、桌面快捷方式、自动更新权限配置等；`bundle.targets` 已优化为仅生成 NSIS（Windows）、DMG+app（macOS）、AppImage（Linux），不再生成 MSI、deb、rpm 等冗余格式
