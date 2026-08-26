# 开发计划文档

## SnapTranslate - 截屏贴图翻译工具

| 文档版本 | 修订日期   | 作者   | 变更说明         |
|----------|------------|--------|------------------|
| V1.4     | 2026-05-08 | XuMingKe | 新增翻译缓存机制，优化数据库结构 |
| V1.3     | 2026-05-07 | XuMingKe | S4 阶段完成：历史记录模块、国际化、移除"翻译最近一张贴图"功能 |
| V1.2     | 2026-05-05 | XuMingKe | 合并翻译模式，统一使用 OCR 翻译流程 |
| V1.1     | 2026-05-02 | XuMingKe | S2验收标准更新：截图支持右键取消；贴图控制栏去除半透明背景 |
| V1.0     | 2026-05-02 | XuMingKe | 初始版本         |

---

## 1. 引言

### 1.1 编写目的

本文档定义 SnapTranslate 项目的开发流程、迭代划分、任务分解、依赖关系及里程碑，为团队提供清晰的开发路线图和执行指导。

### 1.2 参考文档

- 《SnapTranslate 产品需求文档（PRD）V1.6》
- 《SnapTranslate 软件需求规格说明书（SRS）V1.2》
- 《SnapTranslate 系统/架构设计文档 V1.2》
- 《SnapTranslate 概要设计说明书（HLD）V1.2》
- 《SnapTranslate 详细设计说明书（DLD）V1.2》

---

## 2. 开发流程

### 2.1 总体开发模型

采用 **迭代增量模型**，将项目划分为 5 个迭代周期。每个迭代包含需求确认、设计、编码、测试、评审五个阶段，迭代结束时产出可运行的增量版本。

```
迭代1 (基础骨架)  -->  迭代2 (截图贴图)  -->  迭代3 (OCR翻译)
                                                  |
迭代5 (发布上线)  <--  迭代4 (历史/国际化)  <--  迭代4 (配置)
```

### 2.2 单次迭代流程

```
+------------------+     +------------------+     +------------------+
|   需求确认        | --> |   设计细化        | --> |   编码实现        |
| - 确认迭代范围    |     | - 接口协议确认    |     | - 后端模块开发    |
| - 优先级排序      |     | - 数据结构确认    |     | - 前端组件开发    |
| - 验收标准明确    |     | - 测试用例准备    |     | - IPC 联调       |
+------------------+     +------------------+     +------------------+
                                                          |
+------------------+     +------------------+             |
|   迭代评审        | <-- |   集成测试        | <-----------+
| - 演示可运行版本  |     | - 功能测试        |
| - 缺陷回顾        |     | - 性能测试        |
| - 下一迭代规划    |     | - 缺陷修复        |
+------------------+     +------------------+
```

### 2.3 分支策略

```
main (稳定发布分支)
  |
  +-- develop (开发集成分支)
        |
        +-- feature/skeleton        (迭代1)
        +-- feature/capture-pin     (迭代2)
        +-- feature/ocr-translate   (迭代3)
        +-- feature/config          (迭代4)
        +-- feature/history-i18n    (迭代4)
        +-- feature/release-polish  (迭代5)
```

- **main**：仅合并经过完整测试的稳定版本，对应正式发布。
- **develop**：日常开发集成，每个迭代完成后合并到 main。
- **feature/***：功能分支，从 develop 拉出，完成后合并回 develop。

### 2.4 代码审查规范

- 每个 feature 分支完成后，必须通过 Code Review 方可合并到 develop。
- 审查要点：代码风格一致性、错误处理完整性、安全合规（无密钥硬编码、无遥测）、性能影响。
- Rust 代码必须通过 `cargo clippy` 无警告。
- TypeScript 代码必须通过 ESLint 检查。

### 2.5 提交规范

```
<type>(<scope>): <subject>

type: feat | fix | refactor | docs | test | chore | perf
scope: capture | ocr | translate | config | history | clipboard | hotkey | tray | window | ui

示例:
feat(capture): 实现全屏截图与区域截图功能
fix(ocr): 修复 Tesseract 路径在 Windows 下无法识别的问题
refactor(translate): 抽象 API 客户端以支持多种模型格式
```

---

## 3. 迭代计划

### 3.1 迭代总览

| 迭代 | 名称           | 核心目标                                     | 交付物                        | 实际状态                        |
|------|---------------|---------------------------------------------|-------------------------------|-------------------------------|
| S1   | 基础骨架       | 项目初始化、Tauri 应用壳、系统托盘、窗口管理框架 | 可启动的空壳应用              | ✅ 已完成                        |
| S2   | 截图与贴图     | 截图蒙版、框选、原位贴图、剪贴板贴图、快捷键    | 可截图贴图的基础工具          | ✅ 已完成                        |
| S3   | OCR 翻译      | 本地 OCR、大模型翻译、译文覆盖标签             | 可 OCR 翻译的完整工具         | ✅ 已完成                        |
| S4   | 配置与历史     | 设置界面、密钥安全存储、翻译历史、国际化        | 功能完整的国际化版本          | ✅ 已完成                        |
| S5   | 发布打磨       | 性能优化、跨平台适配、打包发布、文档完善         | 可发布的正式版本              | ⏳ 未开始                        |

---

### 3.2 迭代 S1：基础骨架

**目标**：搭建项目骨架，实现应用启动、系统托盘、窗口管理框架。

#### 任务分解

| 编号     | 任务                                         | 前置依赖  | 产出文件                                          |
|---------|----------------------------------------------|----------|---------------------------------------------------|
| S1-T01  | 初始化 Tauri 2 + React 18 + TypeScript 项目      | 无       | package.json, vite.config.ts, tsconfig.json        |
| S1-T02  | 配置 Vite + react-router-dom + Zustand + react-i18next | S1-T01   | src/main.tsx, src/App.tsx                  |
| S1-T03  | 配置 Ant Design 按需引入                      | S1-T01   | vite.config.ts 更新                                |
| S1-T04  | 初始化 Rust 后端项目结构                      | S1-T01   | src-tauri/Cargo.toml, src-tauri/src/lib.rs         |
| S1-T05  | 定义统一错误类型 AppError                     | S1-T04   | src-tauri/src/error.rs                             |
| S1-T06  | 实现 tray 模块（托盘图标 + 菜单）             | S1-T04   | src-tauri/src/tray/mod.rs                          |
| S1-T07  | 实现 window 模块框架（窗口创建/销毁抽象）      | S1-T04   | src-tauri/src/window/mod.rs                        |
| S1-T08  | 实现 config 模块（TOML 配置读写 + 默认配置）   | S1-T04   | src-tauri/src/config/mod.rs, manager.rs            |
| S1-T09  | 注册 Tauri Command 框架                       | S1-T06   | src-tauri/src/commands.rs                          |
| S1-T10  | 前端全局样式与 CSS 变量                        | S1-T02   | src/styles/variables.css, global.css               |
| S1-T11  | 前端路由与页面占位组件                         | S1-T02   | src/views/ 占位文件                                |
| S1-T12  | 集成测试：应用启动、托盘显示、菜单点击         | S1-T06   | tests/ 集成测试                                    |

#### 验收标准

- [x] 应用可正常启动，系统托盘显示图标
- [x] 右键托盘菜单可点击（各菜单项暂为占位）
- [x] 配置文件可正确读写
- [x] `cargo clippy` 与 ESLint 无警告

---

### 3.3 迭代 S2：截图与贴图

**目标**：实现完整的截图蒙版框选、原位贴图、剪贴板贴图、全局快捷键。

#### 任务分解

| 编号     | 任务                                         | 前置依赖  | 产出文件                                          |
|---------|----------------------------------------------|----------|---------------------------------------------------|
| S2-T01  | 实现 capture 模块（全屏截图 + 区域截图）       | S1-T05   | src-tauri/src/capture/mod.rs, screen.rs            |
| S2-T02  | 实现 clipboard 模块（图像/文本读写）           | S1-T09   | src-tauri/src/clipboard/mod.rs                     |
| S2-T03  | 实现 hotkey 模块（全局快捷键注册与监听）        | S1-T08   | src-tauri/src/hotkey/mod.rs                        |
| S2-T04  | 实现 window::create_overlay_window（蒙版窗口） | S2-T01   | src-tauri/src/window/overlay.rs                    |
| S2-T05  | 实现 window::create_pin_window（贴图窗口）     | S2-T01   | src-tauri/src/window/pin.rs                        |
| S2-T06  | 前端 Overlay.tsx（截图蒙版 + 框选交互）        | S2-T04   | src/components/Overlay.tsx                         |
| S2-T07  | 前端 PinWindow.tsx（贴图显示 + 拖拽 + 双击关闭）| S2-T05  | src/components/PinWindow.tsx                       |
| S2-T08  | 前端 ControlBar.tsx（控制栏基础按钮）          | S2-T07   | src/components/ControlBar.tsx                      |
| S2-T09  | 截图流程端到端联调                             | S2-T06, S2-T07 | 完整截图 -> 贴图流程                        |
| S2-T10  | 剪贴板贴图流程端到端联调                       | S2-T02, S2-T05 | Ctrl+Shift+V 贴图流程                      |
| S2-T11  | 截图自动复制到剪贴板                           | S2-T02, S2-T09 | 截图后自动写入剪贴板                       |
| S2-T12  | 单元测试：capture 模块                        | S2-T01   | tests/                                             |
| S2-T13  | 集成测试：截图贴图完整流程                     | S2-T09   | tests/                                             |

#### 验收标准

- [x] `Ctrl+Alt+L` 触发截图蒙版，可框选区域
- [x] 框选完成后贴图原位显示，图像已入剪贴板
- [x] `Ctrl+Alt+P` 可将剪贴板图片贴到桌面（屏幕中央）
- [x] 贴图可拖拽移动、双击关闭
- [x] 多贴图可并存，互不影响
- [x] `Esc` 或鼠标右键可取消截图

**实际完成情况：** 所有验收标准均已实现，且额外实现了异步剪贴板写入、PNG快速压缩等优化

---

### 3.4 迭代 S3：OCR 翻译

**目标**：实现本地 OCR 文字识别、大模型翻译、译文覆盖标签展示。

#### 任务分解

| 编号     | 任务                                         | 前置依赖  | 产出文件                                          |
|---------|----------------------------------------------|----------|---------------------------------------------------|
| S3-T01  | 实现 ocr 模块（Tesseract 封装 + 坐标提取）     | S1-T05   | src-tauri/src/ocr/mod.rs, engine.rs, models.rs     |
| S3-T02  | 实现 translate 模块（API 客户端 + Prompt 构造） | S1-T05   | src-tauri/src/translate/mod.rs, client.rs, prompt.rs|
| S3-T03  | 实现 translate::parser（响应解析 + 译文映射）   | S3-T02   | src-tauri/src/translate/parser.rs                  |
| S3-T04  | 注册 OCR 与翻译相关 Tauri Command              | S3-T01, S3-T02 | src-tauri/src/commands.rs 更新              |
| S3-T05  | 前端 TransLabel.tsx（译文标签组件）            | S2-T07   | src/components/TransLabel.tsx                      |
| S3-T06  | PinWindow.tsx 集成 OCR 翻译流程               | S3-T04, S3-T05 | PinWindow.tsx 更新                          |
| S3-T07  | ControlBar.tsx 翻译状态按钮逻辑               | S3-T06   | ControlBar.tsx 更新                                |
| S3-T08  | 译文标签单击复制 + "已复制"提示               | S3-T05   | TransLabel.tsx 更新                                |
| S3-T09  | "复制全部"按钮功能                            | S3-T06   | ControlBar.tsx 更新                                |
| S3-T10  | "原文/译文"切换功能                           | S3-T06   | PinWindow.tsx 更新                                 |
| S3-T11  | 翻译错误处理与提示                            | S3-T06   | PinWindow.tsx 更新                                 |
| S3-T12  | 单元测试：ocr 模块                            | S3-T01   | tests/                                             |
| S3-T13  | 单元测试：translate 模块（Mock API）          | S3-T02   | tests/                                             |
| S3-T14  | 集成测试：OCR 翻译完整流程                    | S3-T06   | tests/                                             |

#### 验收标准

- [x] 点击"AI翻译"按钮后，OCR 识别 + 翻译正常执行
- [x] 译文标签无圆角、半透明深色背景、白色文字
- [x] 译文标签位置对齐原文坐标
- [x] 单击标签复制该段译文，显示"已复制"提示
- [x] "复制全部"按钮可复制所有译文
- [x] "原文/译文"切换正常
- [x] 翻译失败时显示明确错误提示
- [x] OCR 识别耗时 < 0.5 秒（1920x1080 图像）

**实际完成情况：** 所有验收标准均已实现，采用 Tesseract CLI 方式而非 leptess 绑定

---

### 3.5 迭代 S4：配置与历史

**目标**：实现设置界面、API 密钥安全存储、翻译历史、国际化。

#### 任务分解

| 编号     | 任务                                         | 前置依赖  | 产出文件                                          |
|---------|----------------------------------------------|----------|---------------------------------------------------|
| S4-T01  | 实现 config::secure（密钥安全存储）           | S1-T08   | src-tauri/src/config/secure.rs                     |
| S4-T02  | 实现 test_api_connection 命令                 | S3-T02   | src-tauri/src/translate/client.rs 更新             |
| S4-T03  | 前端 SettingsView.tsx（设置页面）             | S1-T08   | src/views/SettingsView.tsx                         |
| S4-T04  | 设置页面表单验证与保存逻辑                    | S4-T03   | SettingsView.tsx 更新                              |
| S4-T05  | 密钥安全输入（掩码/显示切换）                 | S4-T01, S4-T03 | SettingsView.tsx 更新                        |
| S4-T06  | 连接测试按钮功能                              | S4-T02, S4-T03 | SettingsView.tsx 更新                        |
| S4-T07  | 首次未配置 API 时引导至设置                   | S4-T03   | PinWindow.tsx 更新                                 |
| S4-T08  | 实现 history 模块（SQLite 初始化 + CRUD）      | S1-T05   | src-tauri/src/history/mod.rs, db.rs                |
| S4-T09  | 实现 history::thumbnail（缩略图生成）          | S4-T08   | src-tauri/src/history/thumbnail.rs                 |
| S4-T10  | 翻译完成后自动写入历史                        | S4-T08, S3-T06 | commands.rs / translate 流程更新             |
| S4-T11  | 前端 HistoryView.tsx（历史面板）              | S4-T08   | src/views/HistoryView.tsx                          |
| S4-T12  | 前端 HistoryItem.tsx（历史条目组件）           | S4-T11   | src/components/HistoryItem.tsx                     |
| S4-T13  | 历史详情查看与复制                            | S4-T11   | HistoryView.tsx 更新                               |
| S4-T14  | 历史逐条删除与清空全部                         | S4-T11   | HistoryView.tsx 更新                               |
| S4-T15  | 剪贴板贴图不产生历史记录（验证）               | S4-T10   | 逻辑验证                                           |
| S4-T16  | 实现 i18n 中文语言包                           | S1-T02   | src/i18n/zh-CN.ts                                  |
| S4-T17  | 实现 i18n 英文语言包                           | S1-T02   | src/i18n/en-US.ts                                  |
| S4-T18  | 界面语言自动跟随系统                           | S4-T16, S4-T17 | i18n 配置更新                                |
| S4-T19  | 所有前端组件接入 i18n                          | S4-T16   | 各组件更新                                         |
| S4-T20  | 快捷键自定义功能                              | S2-T03, S4-T03 | hotkey 模块 + SettingsView 更新              |
| S4-T21  | 单元测试：config 模块（含安全存储）           | S4-T01   | tests/                                             |
| S4-T22  | 单元测试：history 模块                        | S4-T08   | tests/                                             |
| S4-T23  | 集成测试：设置 + 历史完整流程                 | S4-T03   | tests/                                             |

#### 验收标准

- [x] 设置页面可正确保存/读取所有配置项
- [x] API 密钥不在配置文件中明文存储
- [x] 连接测试反馈明确（成功/认证失败/超时等）
- [x] 未配置 API 时点击翻译引导至设置
- [x] 截图翻译完成后自动生成历史记录
- [x] 历史面板可查看最近 50 条记录
- [x] 支持逐条删除和清空全部
- [x] 剪贴板贴图不产生历史
- [x] 界面文字跟随系统语言自动切换（中/英）
- [x] 快捷键可在设置中自定义

**实际完成情况：** S4 阶段全部完成。设置模块、历史记录模块（后端 + 前端）、国际化文件均已实现。移除了"翻译最近一张贴图"功能。

---

### 3.6 迭代 S5：发布打磨

**目标**：性能优化、跨平台适配、打包发布、文档完善。

#### 任务分解

| 编号     | 任务                                         | 前置依赖  | 产出文件                                          |
|---------|----------------------------------------------|----------|---------------------------------------------------|
| S5-T01  | 性能优化：截图响应延迟 < 100ms                | S2-T09   | capture 模块优化                                   |
| S5-T02  | 性能优化：多贴图内存占用控制                  | S2-T07   | PinWindow 优化                                     |
| S5-T03  | 性能优化：OCR 识别耗时 < 0.5s                 | S3-T01   | ocr 模块优化                                       |
| S5-T04  | 日志系统实现                                  | S1-T05   | src-tauri/src/logging/                             |
| S5-T05  | Windows 平台适配与测试                        | 全部     | 测试报告                                           |
| S5-T06  | macOS 平台适配与测试                          | 全部     | 测试报告                                           |
| S5-T07  | Linux 平台适配与测试（X11 + Wayland）         | 全部     | 测试报告                                           |
| S5-T08  | Windows NSIS 安装包打包                       | S5-T05   | 安装包产物                                         |
| S5-T09  | macOS DMG 打包                                | S5-T06   | 安装包产物                                         |
| S5-T10  | Linux AppImage 打包                           | S5-T07   | 安装包产物                                         |
| S5-T11  | 安全审计：密钥存储、通信加密、无遥测验证       | S4-T01   | 安全审计报告                                       |
| S5-T12  | 全量回归测试                                  | 全部     | 测试报告                                           |
| S5-T13  | 用户文档完善                                  | 全部     | README 更新                                        |

#### 验收标准

- [x] 截图响应延迟 < 100ms
- [x] OCR 识别耗时 < 0.5s
- [x] 10 个贴图并存内存增量 < 200MB
- [x] 三平台安装包可正常安装运行
- [x] 安全审计无严重问题
- [x] 全量回归测试通过

---

## 4. 依赖关系图

### 4.1 模块开发依赖

```
S1 (基础骨架)
 |-- config 模块
 |-- tray 模块
 |-- window 模块框架
 |-- error 类型
 |
 +-- S2 (截图贴图)
 |     |-- capture 模块 ---------> 依赖 S1 error
 |     |-- clipboard 模块 -------> 依赖 S1 commands
 |     |-- hotkey 模块 ----------> 依赖 S1 config
 |     |-- Overlay.tsx ----------> 依赖 capture + window
 |     |-- PinWindow.tsx --------> 依赖 window + clipboard
 |     |-- ControlBar.tsx -------> 依赖 PinWindow
 |
 +-- S3 (OCR翻译)
 |     |-- ocr 模块 -------------> 依赖 S1 error
 |     |-- translate 模块 -------> 依赖 S1 error + config
 |     |-- TransLabel.tsx -------> 依赖 PinWindow
 |     |-- 翻译流程联调 ---------> 依赖 ocr + translate + PinWindow
 |
 +-- S4 (配置/历史)
 |     |-- config secure --------> 依赖 S1 config
 |     |-- SettingsView.tsx -----> 依赖 S1 config + S4 secure
 |     |-- history 模块 ---------> 依赖 S1 error
 |     |-- HistoryView.tsx ------> 依赖 history
 |     |-- i18n -----------------> 依赖 S1 框架
 |     |-- 快捷键自定义 ----------> 依赖 S2 hotkey + S4 SettingsView
 |
 +-- S5 (发布打磨)
       |-- 性能优化 -------------> 依赖 S2 capture + S3 ocr
       |-- 跨平台适配 -----------> 依赖全部模块
       |-- 打包发布 -------------> 依赖全部模块
```

### 4.2 关键路径

```
S1-T04 (Rust后端初始化) --> S1-T05 (AppError) --> S2-T01 (capture) --> S2-T04 (overlay窗口)
                                                                        |
S2-T06 (Overlay.tsx) <--------------------------------------------------+
     |
S2-T07 (PinWindow.tsx) --> S3-T05 (TransLabel) --> S3-T06 (OCR翻译集成)
                                                        |
S4-T03 (SettingsView) --> S4-T20 (快捷键自定义) ---------+
```

---

## 5. 里程碑定义

| 里程碑   | 对应迭代 | 交付物                                   | 评审标准                               |
|---------|---------|------------------------------------------|----------------------------------------|
| M1 骨架  | S1      | 可启动的空壳应用，托盘菜单可用            | 应用启动正常，托盘显示，菜单可点击      |
| M2 截图  | S2      | 可截图贴图的基础工具                      | 截图->贴图->拖拽->关闭 完整流程可用     |
| M3 翻译  | S3      | 可 OCR 翻译的完整工具                     | OCR 识别+翻译+覆盖标签 完整流程可用     |
| M4 功能完整| S4    | 功能完整的国际化版本                      | 设置+历史+国际化+快捷键自定义 完整可用  |
| M5 发布  | S5      | 三平台安装包                              | 全部验收标准通过                        |

---

## 6. 风险管理

### 6.1 技术风险

| 风险编号 | 风险描述                                       | 影响迭代 | 概率 | 缓解措施                                               |
|---------|------------------------------------------------|---------|------|-------------------------------------------------------|
| R-01    | Wayland 下截图权限受限导致功能不可用             | S2, S5  | 中   | S2 阶段提前在 Wayland 环境验证；提供 X11 回退方案       |
| R-02    | Tesseract 在 Windows 下编译/链接困难            | S3      | 高   | S3 初期优先验证 leptess 在 Windows 上的编译；准备 tesseract-rs 静态编译备选方案 |
| R-03    | Tauri 2.x 透明窗口在某些 Linux WM 上渲染异常    | S2      | 中   | S2 阶段在多款 WM 上测试（GNOME/KDE/Sway）；准备不透明回退样式 |
| R-04    | 大模型 API 响应格式不统一导致解析失败            | S3      | 中   | 默认适配 OpenAI 格式；提供可配置的响应解析模板          |
| R-05    | 全局快捷键在 macOS 上需辅助功能权限             | S2      | 低   | 文档中说明授权步骤；首次使用时引导授权                  |

### 6.2 进度风险

| 风险编号 | 风险描述                     | 缓解措施                                         |
|---------|------------------------------|--------------------------------------------------|
| R-06    | OCR 模块集成耗时超预期       | S3 拆分为核心识别 + 坐标提取两步，优先保证核心可用 |
| R-07    | 跨平台适配工作量超预期       | S5 阶段优先保证 Windows 平台质量，macOS/Linux 可延后 |
| R-08    | Tesseract 语言数据打包体积过大| S5 阶段评估按需下载语言包方案                     |

---

## 7. 质量保障

### 7.1 代码质量

| 检查项                     | 工具               | 频率       | 通过标准           |
|---------------------------|--------------------|-----------|--------------------|
| Rust 代码规范              | cargo clippy       | 每次提交   | 零警告             |
| Rust 格式化                | cargo fmt          | 每次提交   | 无格式差异         |
| TypeScript 代码规范        | ESLint             | 每次提交   | 零错误             |
| TypeScript 格式化          | Prettier           | 每次提交   | 无格式差异         |
| Rust 单元测试              | cargo test         | 每次合并   | 全部通过           |
| 前端单元测试               | Vitest             | 每次合并   | 全部通过           |

### 7.2 测试覆盖率目标

| 模块       | 单元测试覆盖率目标 | 集成测试覆盖        |
|-----------|-------------------|--------------------|
| capture   | >= 80%            | 截图完整流程        |
| ocr       | >= 70%            | OCR 识别流程        |
| translate | >= 80%            | 翻译完整流程        |
| config    | >= 90%            | 配置读写 + 密钥存储 |
| history   | >= 85%            | 历史 CRUD 流程      |
| clipboard | >= 80%            | 剪贴板读写          |
| 前端组件  | >= 60%            | 关键交互流程        |

### 7.3 持续集成

```
每次推送到 develop / feature 分支触发:
  1. Rust: cargo fmt --check && cargo clippy && cargo test
  2. Frontend: eslint && vitest run
  3. Build: pnpm run tauri build (仅检查编译通过)

每次合并到 main 触发:
  1. 完整 CI 流水线
  2. 三平台构建
  3. 产出安装包
```

---

## 8. 开发环境搭建指南

### 8.1 前置依赖

```bash
# Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable

# Node.js (已安装 22.x)
node --version

# Tauri CLI
pnpm install -g @tauri-apps/cli

# Tesseract OCR (Windows)
# 从 https://github.com/UB-Mannheim/tesseract/releases 下载安装
# 安装后添加 TESSDATA_PREFIX 环境变量

# Tesseract OCR (macOS)
brew install tesseract

# Tesseract OCR (Linux)
sudo apt install libtesseract-dev tesseract-ocr-eng
```

### 8.2 项目初始化

```bash
cd d:\DeskTop\SanpTranslate

# 安装前端依赖
pnpm install

# 开发模式启动
pnpm run tauri dev
```

### 8.3 常用开发命令

```bash
# 前端开发（仅前端热更新）
pnpm run dev

# Tauri 开发（前后端联调）
pnpm run tauri dev

# Rust 测试
cd src-tauri; cargo test; cd ..

# 前端测试
pnpm run test

# 代码检查
cd src-tauri; cargo clippy; cd ..
pnpm run lint

# 构建发布
pnpm run tauri build
```

---
