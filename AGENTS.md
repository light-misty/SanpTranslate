"""
## 任务规范

1. 重要：未经过我的允许，严令禁止执行 git 暂存、提交、推送。
2. git-commit 提交信息使用中文，遵循约定式提交信息。
3. 重要：严令禁止你将自己列为GitHub贡献者、共同创作者等。
4. 有关 git 的操作，请使用 git-commit skill、gh-cli skill。
5. 你需要严格遵守数据诚实规则，不要不懂装懂，如果存在不确定的知识，请积极执行联网搜索。
6. 如果存在不确定的内容，请积极向我提问，不要擅作主张。
7. 保持对话语言为中文。
8. 在生成代码时添加中文注释，不要删除原有的注释，除非内容需要更改。
9. 在任务过程中禁止使用 emoji。
10. 本机操作系统为 Windows 11。
11. 严格遵守最小改动原则：优先编辑现有代码、不新建不必要文件、不添加多余注释。
12. 重要：在每次任务开始前，你必须加载 superpowers skill，并严格遵守其规范。
13. 在任务过程中，你需要积极调用相关 skills，例如：执行代码智能暂存请调用 git-commit skill。
14. 在任务过程中，如果发现有其它文件改动并且不在你的任务范围内，说明那是协作者正在进行的任务，你不需要关注并跳过它。

## Reasoning Effort

Absolute maximum with no shortcuts permitted.
You MUST be very thorough in your thinking and comprehensively decompose the problem to resolve the root cause, rigorously stress-testing your logic against all potential paths, edge cases, and adversarial scenarios.
Explicitly write out your entire deliberation process, documenting every intermediate step, considered alternative, and rejected hypothesis to ensure absolutely no assumption is left unchecked.
"""

# SnapTranslate 项目指南

## 项目概述

SnapTranslate 是一款基于 Tauri 2.x 的桌面截屏翻译工具。它能截取屏幕区域、执行 OCR（Tesseract）识别文字并调用 AI 翻译，将译文展示在右侧译文面板中，以贴图形式固定在桌面上。

## 技术栈

### 前端

- **语言**: TypeScript 5.7
- **框架**: React 18.3 + React Router DOM 6
- **UI 库**: Ant Design 5（深色主题，darkAlgorithm）
- **状态管理**: Zustand 5
- **国际化**: i18next 24 + react-i18next 15
- **构建工具**: Vite 6
- **测试框架**: Vitest 4 + Testing Library + jsdom 30
- **路径别名**: `@/` 映射到 `src/`（在 vite.config.ts 和 tsconfig.json 中配置）

### 后端（Rust）

- **框架**: Tauri 2.x
- **数据库**: SQLite（rusqlite 0.33，bundled 特性）
- **HTTP 客户端**: reqwest 0.12（rustls-tls）
- **配置格式**: TOML（toml 0.8）
- **密钥管理**: keyring 3（操作系统凭据管理器）
- **截图库**: xcap 0.9
- **图像处理**: image 0.25
- **日志**: log 0.4 + tauri-plugin-log 2.9
- **其他**: serde/serde_json、uuid、chrono、sys-locale、base64

### Tauri 插件

- tauri-plugin-opener 2
- tauri-plugin-clipboard-manager 2
- tauri-plugin-global-shortcut 2
- tauri-plugin-log 2.9
- tauri-plugin-autostart 2.5.1
- tauri-plugin-updater 2

## 项目结构

```
SanpTranslate/
├── src/                          # 前端源码
│   ├── main.tsx                  # 入口：React 应用创建 + antd ConfigProvider
│   ├── App.tsx                   # 根组件：语言初始化 + 跨窗口语言同步
│   ├── components/               # 通用组件
│   │   ├── ControlBar.tsx        # 贴图控制栏（翻译/复制/切换按钮）
│   │   ├── HistoryItem.tsx       # 历史记录条目
│   │   └── ShortcutInput.tsx     # 快捷键输入组件
│   ├── views/                # 视图组件（对应不同窗口）
│   │   ├── OverlayView.tsx       # 截图蒙版（Canvas 全屏框选）
│   │   ├── PinView.tsx           # 贴图窗口（截图+译文+控制栏）
│   │   ├── SettingsView.tsx      # 设置页面
│   │   ├── HistoryView.tsx       # 历史记录页面
│   │   └── TextTranslateView.tsx # 文本翻译窗口
│   ├── stores/               # Zustand 状态管理
│   │   ├── configStore.ts        # 配置状态
│   │   ├── pinStore.ts           # 贴图状态
│   │   └── historyStore.ts       # 历史记录状态
│   ├── router/               # 路由配置
│   │   └── index.tsx             # 五个路由（懒加载）
│   ├── i18n/                 # 国际化
│   │   ├── index.ts              # i18next 配置
│   │   └── locales/              # 语言文件
│   │       ├── zh-CN.ts          # 中文
│   │       └── en-US.ts          # 英文
│   ├── utils/                # 工具函数
│   │   ├── tauri.ts              # Tauri 命令绑定（TypeScript 接口）
│   │   └── logger.ts             # 日志工具
│   └── styles/               # 样式
│       ├── variables.css         # CSS 自定义属性
│       └── global.css            # 全局样式
├── src-tauri/                    # Rust 后端源码
│   ├── Cargo.toml                # Rust 依赖配置
│   ├── tauri.conf.json           # Tauri 应用配置
│   ├── build.rs                  # 构建脚本
│   ├── capabilities/             # 权限配置
│   ├── icons/                    # 应用图标
│   ├── nsis/                     # NSIS 安装包模板
│   ├── resources/                # 资源文件
│   │   └── tesseract/            # 捆绑的 Tesseract OCR（Windows）
│   └── src/                      # Rust 源码
│       ├── main.rs               # 应用入口
│       ├── lib.rs                # 应用核心（插件注册、setup）
│       ├── commands.rs           # Tauri 命令定义（23个命令）
│       ├── error.rs              # 统一错误类型 AppError
│       ├── capture/              # 截图模块
│       ├── clipboard/            # 剪贴板模块
│       ├── config/               # 配置模块
│       │   ├── mod.rs            # 模块导出
│       │   └── manager.rs        # 配置管理器实现
│       ├── history/              # 历史记录模块（SQLite）
│       ├── hotkey/               # 全局快捷键模块
│       ├── logging/              # 日志管理模块
│       ├── ocr/                  # OCR 模块（Tesseract CLI）
│       ├── translate/            # 翻译模块
│       │   ├── mod.rs            # 核心翻译逻辑
│       │   ├── openai.rs         # OpenAI 兼容 API
│       │   ├── anthropic.rs      # Anthropic API
│       │   └── gemini.rs         # Gemini API
│       ├── tray/                 # 系统托盘模块
│       ├── update/               # 自动更新模块
│       └── window/               # 窗口管理模块
├── docs/                         # 文档
│   ├── ARCHITECTURE.md           # 架构文档
│   ├── DEV_PLAN.md               # 开发计划
│   ├── PRD.md                    # 产品需求文档
│   └── ...                       # 其他文档
├── .github/workflows/            # CI/CD 配置
│   └── release.yml               # 发布工作流
├── package.json                  # 前端依赖
├── vite.config.ts                # Vite 配置
├── tsconfig.json                 # TypeScript 配置
└── vitest.config.ts              # Vitest 配置
```

## 构建和测试命令

```bash
# 安装依赖（使用 pnpm）
pnpm install

# 开发模式（Vite HMR + Tauri）
pnpm run tauri dev

# 构建生产版本
pnpm run tauri build

# 仅前端开发服务器
pnpm run dev

# 前端类型检查
npx tsc --noEmit

# 前端单元测试
pnpm run test

# Vite 预览
pnpm run preview
```

## 编码约定

### 前端（TypeScript/React）

1. **命名规范**：
   - 组件文件使用 PascalCase（如 `ControlBar.tsx`）
   - 工具函数和常量使用 camelCase
   - CSS 类名使用 kebab-case
   - 路由路径使用 kebab-case（如 `/text-translate`）

2. **组件模式**：
   - 函数组件 + Hooks
   - 使用 `useRef` 存储非响应式量（跨渲染保持不变的值）
   - 使用 `useMemo` 缓存计算结果
   - 组件 Props 定义使用 `interface`，放在组件文件顶部

3. **状态管理**：
   - 使用 Zustand 进行全局状态管理
   - Store 使用 `create` 函数创建，状态和 actions 分离
   - 不可变更新：使用展开运算符或 Map 副本

4. **国际化**：
   - 使用 `useTranslation` hook 获取 `t` 函数
   - 语言包采用嵌套结构（如 `controlBar.translate`）
   - 支持 `{param}` 占位符语法（兼容 vue-i18n）

5. **日志**：
   - 使用封装的 `logger` 工具（`@/utils/logger`）
   - 日志格式：`[时间戳][TAG] 消息 | 数据`
   - 所有日志调用需传入 TAG 参数标识来源模块

6. **样式**：
   - CSS 自定义属性定义在 `variables.css`
   - 深色透明主题（rgba 黑色背景 + 白色文字）
   - 组件样式文件与组件文件同名（如 `ControlBar.css`）

### 后端（Rust）

1. **模块组织**：
   - 每个功能模块一个目录，包含 `mod.rs`
   - 模块在 `lib.rs` 中声明（`mod module_name;`）
   - 复杂模块可拆分（如 `config/mod.rs` + `config/manager.rs`）

2. **命名规范**：
   - 结构体/函数使用 snake_case
   - 常量使用 SCREAMING_SNAKE_CASE
   - 命令函数使用 `#[tauri::command]` 宏

3. **错误处理**：
   - 统一使用 `AppError` 枚举
   - `Display` trait 输出中文错误信息
   - 使用 `?` 运算符传播错误，配合 `map_err` 转换
   - 实现了 `From` trait 自动转换（io、toml、reqwest、rusqlite、tauri）

4. **日志**：
   - 使用 `log` crate 的宏（`log::info!`、`log::error!` 等）
   - 日志标签格式：`[MODULE]`（如 `[OCR]`、`[CMD]`、`[TRANSLATE]`）
   - dev 模式 Debug 级别，prod 模式 Info 级别

5. **并发模式**：
   - 使用 `std::sync::Mutex` 保护共享状态
   - 通过 `app.state::<Mutex<T>>()` 获取状态
   - 耗时操作使用 `tauri::async_runtime::spawn_blocking`
   - 异步命令使用 `pub async fn`

6. **配置管理**：
   - TOML 格式存储在 `app_config_dir/config.toml`
   - 原子写入：先写临时文件，再重命名
   - API 密钥通过 keyring 存储，不写入配置文件

7. **窗口管理**：
   - 设置/历史/文本翻译窗口使用单例模式（已存在则复用）
   - 贴图窗口每次创建新实例（UUID 标签）
   - 蒙版窗口打开前先关闭已有实例

### 前后端通信

1. **IPC 模式**：
   - 前端通过 `invoke()` 调用后端命令
   - 后端命令在 `commands.rs` 中定义
   - TypeScript 接口定义在 `utils/tauri.ts`

2. **数据传递**：
   - 窗口间数据采用"后端缓存 + 前端主动拉取"模式
   - 全屏截图缓存于 `CachedScreenStore`
   - 贴图图像缓存于 `PinImageStore`
   - 非 Event 推送模式

3. **跨窗口通信**：
   - 语言变更通过 `emit` 广播事件
   - 前端通过 `listen` 监听事件

## CI/CD 配置

### GitHub Actions 发布工作流（`.github/workflows/release.yml`）

**触发条件**：推送 `v*` 标签时触发

**工作流阶段**：

1. **validate**：验证 tag 版本号与 Cargo.toml 一致
2. **build**：跨平台构建（矩阵策略）
   - Windows（x86_64-pc-windows-msvc）
   - macOS（x86_64-apple-darwin）
   - Linux（x86_64-unknown-linux-gnu）
3. **publish**：创建 Draft Release 并上传产物

**构建产物**：
- Windows: NSIS 安装包（`.exe`）+ 签名文件（`.sig`）
- macOS: DMG（`.dmg`）+ tar.gz（`.app.tar.gz`）+ 签名文件
- Linux: AppImage（`.AppImage`）+ 签名文件

**自动更新**：
- 生成 `latest.json` 更新清单
- 上传到 Release 供 tauri-plugin-updater 检查

**并发控制**：
- 使用 `concurrency.group: release-${{ github.ref }}`
- `cancel-in-progress: true`（新发布取消旧的）

## 关键设计决策

1. **翻译流程**：本地 Tesseract OCR 提取文字及坐标 → 查找历史缓存 → 未命中则调用 AI API 翻译 → 按行匹配坐标返回翻译块

2. **翻译缓存**：历史记录存储 `target_language` 和 `blocks_json` 字段，用于缓存匹配；命中缓存时直接返回翻译结果，跳过 API 调用

3. **译文展示**：翻译结果显示在右侧独立面板，支持高度拉伸；原文/译文切换时隐藏/显示译文面板

4. **API Provider 支持**：支持 OpenAI 兼容、Anthropic、Gemini 三种 API Provider，通过 `api_provider` 字段分发

5. **OCR 源语言**：支持 `auto`（自动检测）、`chi_sim`（中文简体）、`eng`（英文）、`jpn`（日文）四种模式

6. **Tesseract 资源**：Windows 平台捆绑 Tesseract 可执行文件和语言数据，优先从资源目录查找，回退到系统 PATH

7. **贴图窗口**：每张贴图截图都是一个独立的透明 Tauri Webview 窗口，定位在原始截取坐标处

8. **日志策略**：dev 模式日志写入项目根目录 `log/`，prod 模式写入 OS 标准日志目录；单文件最大 10MB，保留所有历史日志，过期清理（30天）
