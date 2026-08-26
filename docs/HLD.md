# 概要设计说明书（HLD）

## SnapTranslate - 截屏贴图翻译工具

| 文档版本 | 修订日期   | 作者   | 变更说明         |
|----------|------------|--------|------------------|
| V1.5     | 2026-05-10 | XuMingKe | 新增界面语言配置；更新译文展示方式为右侧面板 |
| V1.4     | 2026-05-08 | XuMingKe | 新增翻译缓存机制，优化数据库结构 |
| V1.3     | 2026-05-07 | XuMingKe | 完成历史记录模块；移除"翻译最近一张贴图"功能 |
| V1.2     | 2026-05-05 | XuMingKe | 合并翻译模式，统一使用 OCR 翻译流程 |
| V1.1     | 2026-05-02 | XuMingKe | 截图蒙版支持右键取消；贴图控制栏去除半透明背景 |
| V1.0     | 2026-05-02 | XuMingKe | 初始版本         |

---

## 1. 引言

### 1.1 编写目的

本文档在系统架构设计的基础上，进一步细化各功能模块的概要设计，定义模块间的接口规范、数据结构及核心算法，为详细设计与编码提供指导。

### 1.2 参考文档

- 《SnapTranslate 软件需求规格说明书（SRS）V1.2》
- 《SnapTranslate 系统/架构设计文档 V1.2》

---

## 2. 项目目录结构

```
SnapTranslate/
  |-- src/                          # 前端源码
  |     |-- App.tsx                 # 根组件
  |     |-- main.tsx                 # 前端入口
  |     |-- components/             # React 组件
  |     |     |-- PinWindow.tsx     # 贴图窗口组件
  |     |     |-- Overlay.tsx       # 截图蒙版组件
  |     |     |-- TransLabel.tsx    # 译文标签组件
  |     |     |-- ControlBar.tsx    # 控制栏组件
  |     |     |-- HistoryItem.tsx   # 历史条目组件
  |     |-- views/                  # 页面视图
  |     |     |-- SettingsView.tsx  # 设置页面
  |     |     |-- HistoryView.tsx   # 历史面板页面
  |     |-- stores/                 # Zustand 状态管理
  |     |     |-- pinStore.ts       # 贴图状态
  |     |     |-- configStore.ts    # 配置状态
  |     |     |-- historyStore.ts   # 历史状态
  |     |-- i18n/                   # 国际化
  |     |     |-- zh-CN.ts          # 中文语言包
  |     |     |-- en-US.ts          # 英文语言包
  |     |-- styles/                 # 全局样式
  |     |     |-- variables.css     # CSS 变量
  |     |     |-- global.css        # 全局样式
  |     |-- utils/                  # 工具函数
  |           |-- tauri.ts          # Tauri IPC 封装
  |           |-- image.ts          # 图像处理工具
  |
  |-- src-tauri/                    # Rust 后端源码
  |     |-- src/
  |     |     |-- lib.rs            # 库入口，注册所有模块
  |     |     |-- main.rs           # 可执行入口
  |     |     |-- capture/          # 截图模块
  |     |     |     |-- mod.rs
  |     |     |-- ocr/              # OCR 模块
  |     |     |     |-- mod.rs
  |     |     |-- translate/        # 翻译模块
  |     |     |     |-- mod.rs
  |     |     |-- config/           # 配置模块
  |     |     |     |-- mod.rs
  |     |     |     |-- manager.rs  # 配置读写
  |     |     |-- history/          # 历史模块
  |     |     |     |-- mod.rs
  |     |     |     |-- db.rs       # SQLite 操作
  |     |     |-- clipboard/        # 剪贴板模块
  |     |     |     |-- mod.rs
  |     |     |-- hotkey/           # 快捷键模块
  |     |     |     |-- mod.rs
  |     |     |-- tray/             # 托盘模块
  |     |     |     |-- mod.rs
  |     |     |-- window/           # 窗口管理模块
  |     |     |     |-- mod.rs
  |     |     |-- error.rs          # 统一错误类型
  |     |     |-- commands.rs       # Tauri Command 注册
  |     |-- Cargo.toml
  |     |-- tauri.conf.json         # Tauri 配置
  |     |-- capabilities/           # Tauri 权限配置
  |           |-- default.json
  |
  |-- docs/                         # 项目文档
  |-- tests/                        # 测试代码
  |-- package.json
  |-- vite.config.ts
  |-- tsconfig.json
```

---

## 3. 核心数据结构

### 3.1 后端数据结构（Rust）

#### 3.1.1 截图区域

```rust
pub struct CaptureRegion {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub monitor_id: Option<String>,
}
```

#### 3.1.2 OCR 识别结果

```rust
pub struct OcrTextBlock {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub confidence: f32,
}

pub struct OcrResult {
    pub blocks: Vec<OcrTextBlock>,
    pub processing_time_ms: u64,
}
```

#### 3.1.3 翻译结果

```rust
pub struct TranslatedBlock {
    pub original: String,
    pub translated: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub struct TranslateResult {
    pub blocks: Vec<TranslatedBlock>,
}
```

#### 3.1.4 配置数据

```rust
pub struct AppConfig {
    pub api_base_url: String,
    pub model: String,
    pub target_language: String,
    pub language: String,          // 界面语言：auto/zh-CN/en-US
    pub shortcuts: ShortcutConfig,
}

pub struct ShortcutConfig {
    pub capture: String,       // 默认 "Ctrl+Alt+L"
    pub pin_clipboard: String, // 默认 "Ctrl+Alt+P"
}
```

#### 3.1.5 历史记录

```rust
pub struct HistoryEntry {
    pub id: i64,
    pub thumbnail: Vec<u8>,
    pub ocr_text: Option<String>,
    pub translated_text: String,
    pub created_at: String,
}
```

#### 3.1.6 统一错误类型

```rust
pub enum AppError {
    CaptureError(String),
    OcrError(String),
    TranslateError(String),
    ConfigError(String),
    DatabaseError(String),
    ClipboardError(String),
    NetworkError(String),
}
```

### 3.2 前端数据结构（TypeScript）

#### 3.2.1 贴图状态

```typescript
interface PinState {
  pinId: string
  imageDataUrl: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  translateStatus: 'idle' | 'translating' | 'done' | 'error'
  ocrBlocks: TranslatedBlock[]
  showOriginal: boolean
}
```

#### 3.2.2 译文标签

```typescript
interface TranslatedBlock {
  original: string
  translated: string
  x: number
  y: number
  width: number
  height: number
}
```

---

## 4. 模块接口设计

### 4.1 Tauri Command 接口

以下为前端可调用的后端命令，所有命令返回 `Result<T, AppError>`。

#### 4.1.1 截图相关

| 命令名               | 参数                          | 返回值               | 说明               |
|---------------------|-------------------------------|----------------------|--------------------|
| `capture_fullscreen`| `{ monitor_id: Option<String>}`| `{ image_data: String }` (Base64) | 捕获全屏图像 |
| `capture_region`    | `{ region: CaptureRegion }`   | `{ image_data: String }` (Base64) | 捕获指定区域图像 |

#### 4.1.2 OCR 相关

| 命令名          | 参数                            | 返回值          | 说明               |
|----------------|---------------------------------|-----------------|--------------------|
| `ocr_recognize`| `{ image_data: String, lang: String }` | `OcrResult` | 对图像执行 OCR 识别 |

#### 4.1.3 翻译相关

| 命令名                    | 参数                                       | 返回值             | 说明                     |
|--------------------------|--------------------------------------------|--------------------|--------------------------|
| `translate_image`        | `{ image_data: String, target_language: String }` | `TranslateResult` | OCR 翻译 |
| `test_api_connection`    | `{ api_base_url: String, api_key: String, model: String }` | `String` | 测试 API 连接 |

#### 4.1.4 配置相关

| 命令名            | 参数                  | 返回值        | 说明               |
|------------------|----------------------|---------------|--------------------|
| `get_config`     | 无                   | `AppConfig`   | 读取配置            |
| `save_config`    | `{ config: AppConfig }` | `{ success: bool }` | 保存配置 |
| `get_api_key`    | 无                   | `String`      | 从凭据管理器读取密钥 |
| `set_api_key`    | `{ key: String }`    | `{ success: bool }` | 保存密钥到凭据管理器 |

#### 4.1.5 历史相关

| 命令名             | 参数                    | 返回值                | 说明               |
|-------------------|------------------------|-----------------------|--------------------|
| `get_history_list`| `{ limit: u32 }`       | `Vec<HistoryEntry>`   | 获取历史列表        |
| `get_history_detail`| `{ id: i64 }`        | `HistoryEntry`        | 获取历史详情        |
| `delete_history`  | `{ id: i64 }`          | `{ success: bool }`   | 删除单条历史        |
| `clear_history`   | 无                     | `{ success: bool }`   | 清空全部历史        |

#### 4.1.6 剪贴板相关

| 命令名               | 参数  | 返回值                     | 说明               |
|---------------------|-------|---------------------------|--------------------|
| `read_clipboard_image`| 无  | `Option<String>` (Base64) | 读取剪贴板图像     |
| `write_clipboard_image`| `{ image_data: String }` | `{ success: bool }` | 写入图像到剪贴板 |
| `write_clipboard_text`| `{ text: String }` | `{ success: bool }` | 写入文本到剪贴板 |

#### 4.1.7 窗口相关

| 命令名              | 参数                                    | 返回值          | 说明               |
|--------------------|-----------------------------------------|-----------------|--------------------|
| `create_pin_window`| `{ image_data: String, x: i32, y: i32, w: u32, h: u32 }` | `{ window_id: String }` | 创建贴图窗口 |
| `close_pin_window` | `{ window_id: String }`                 | `{ success: bool }` | 关闭贴图窗口 |

---

## 5. 核心流程概要设计

### 5.1 截图流程

```
1. hotkey 模块检测到 Ctrl+Alt+L
2. 调用 capture::capture_fullscreen() 获取全屏图像
3. 调用 window::create_overlay_window() 创建蒙版窗口
4. 前端 Overlay.tsx 绘制蒙版，监听鼠标事件
5. 用户拖拽选区，前端实时绘制选区矩形
6. 用户松开鼠标，前端调用 capture_region_from_cache 命令
7. capture 模块裁剪选区图像，返回 Base64
8. clipboard 模块将图像写入系统剪贴板
9. window 模块创建贴图窗口（原位）
10. 关闭蒙版窗口

注：步骤4-5期间，用户可按 Esc 或右键点击取消截图，直接销毁蒙版窗口
```

### 5.2 OCR 翻译流程

```
1. 前端调用 translate_image 命令，传入图像数据和目标语言
2. translate 模块调用 ocr 模块执行 Tesseract 识别
3. 返回 OcrResult（含文本块及坐标）
4. translate 模块构造 Prompt，调用大模型 API
5. 解析 API 响应，映射译文到各文本块
6. 返回 TranslateResult（含翻译块列表）
7. 前端渲染译文覆盖标签
```

### 5.3 剪贴板贴图流程

```
1. hotkey 模块检测到 Ctrl+Alt+P
2. 调用 clipboard::read_clipboard_image()
3. 若剪贴板无图像，静默忽略
4. 若有图像，调用 window::create_pin_window() 创建贴图窗口
5. 贴图窗口默认显示在屏幕中央
```

---

## 6. 数据库设计

### 6.1 SQLite 表结构

#### history 表

| 字段名           | 类型       | 约束              | 说明               |
|-----------------|------------|-------------------|--------------------|
| id              | INTEGER    | PRIMARY KEY AUTO  | 自增主键           |
| thumbnail       | BLOB       | NOT NULL          | 缩略图数据         |
| ocr_text        | TEXT       | NULL              | OCR 识别原文       |
| translated_text | TEXT       | NOT NULL          | 翻译后文本         |
| created_at      | TEXT       | NOT NULL          | ISO 8601 时间戳    |

#### 索引

```sql
CREATE INDEX idx_history_created_at ON history(created_at DESC);
```

---

## 7. 配置文件设计

### 7.1 config.toml 结构

```toml
[api]
base_url = "https://api.example.com/v1"
model = "gpt-4o-mini"
target_language = "zh-CN"

[general]
language = "auto"
max_history = 50
log_enabled = false

[shortcuts]
capture = "Ctrl+Alt+L"
pin_clipboard = "Ctrl+Alt+P"
```

---

## 8. API 通信设计

### 8.1 文本翻译 API 请求格式

兼容 OpenAI Chat Completions API：

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "You are a translation assistant. Please translate the following text into {target_language}. Return each paragraph in the original order, separated by numbers."
    },
    {
      "role": "user",
      "content": "1. {text_block_1}\n2. {text_block_2}\n3. {text_block_3}"
    }
  ],
  "temperature": 0.3
}
```

---

## 9. 国际化设计

### 9.1 语言检测逻辑

```
1. 读取 config.toml 中 general.language 字段
2. 若为 "auto"，检测操作系统语言
3. 匹配支持的语言列表（zh-CN, en-US）
4. 若无匹配，默认使用 en-US
5. 加载对应语言包
```

### 9.2 语言包结构

每个语言包导出一个扁平的 key-value 对象：

```typescript
export default {
  'tray.capture': '框选截图翻译',
  'tray.pin_clipboard': '从剪贴板贴图',
  'tray.history': '截图与翻译历史',
  'tray.settings': '设置',
  'tray.quit': '退出',
  'pin.translate': 'AI翻译',
  'pin.translating': '翻译中...',
  'pin.copy_all': '复制全部',
  'pin.toggle_original': '原文/译文',
  'pin.copied': '已复制',
  'settings.title': '设置',
  // ...
}
```

---
