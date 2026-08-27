<h1 align="center">SnapTranslate</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.x-FFC131" alt="Tauri 2.x" />
  <img src="https://img.shields.io/static/v1?label=Rust&message=2024&color=orange" alt="Rust 2024" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript" alt="TypeScript 5.7" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Cross Platform" />
</p>

<p align="center">
  <a href="README.zh.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.md">English</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a>
</p>

## 简介

基于 Tauri 2 的桌面截屏翻译工具。框选屏幕区域 → 本地 OCR 提取文字 → AI 翻译 → 右侧面板展示结果。不弹窗、不打断工作流。

## 截图展示

<p align="center">
  <img src="docs/assets/readme-preview.png" alt="SnapTranslate" style="max-width: 100%; border-radius: 8px;" />
</p>

## 下载安装

从 [Releases](https://github.com/XuMingKe-06/SanpTranslate/releases) 下载：

| 平台 | 格式 |
|------|------|
| Windows 10+ | `.exe` |
| macOS 12+ | `.dmg` |
| Linux (x86_64) | `.AppImage` |

⚠️ **系统要求：**

- **Windows**：Windows 10 (1803+)，需 WebView2（系统自带）
- **macOS**：macOS 12+，需 WebKit（系统自带），且需通过 Homebrew 安装 Tesseract 及语言包：
  ```bash
  brew install tesseract tesseract-lang
  ```
- **Linux**：支持 X11/Wayland，需 WebKitGTK，且需安装 Tesseract 引擎及对应的语言包：
  - **Ubuntu / Debian**：
    ```bash
    sudo apt update
    sudo apt install tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng tesseract-ocr-jpn
    ```
  - **Arch Linux**：
    ```bash
    sudo pacman -S tesseract tesseract-data-chi_sim tesseract-data-eng tesseract-data-jpn
    ```

## 功能特性

- **框选截图翻译** — 全局快捷键 `Ctrl+Alt+L`，拖拽框选任意区域，截图自动贴在原位
- **剪贴板贴图** — `Ctrl+Alt+P` 将剪贴板图片贴到桌面翻译
- **文本翻译** — `Ctrl+Alt+M` 打开文本翻译窗口，`Ctrl+Enter` 快捷翻译
- **本地 OCR** — 内置 Tesseract 离线引擎，支持中文 / 英文 / 日文，自动检测语言
- **AI 翻译** — OpenAI 兼容 / Anthropic / Gemini API，自备模型与密钥
- **翻译缓存** — 重复内容自动匹配历史记录，命中缓存跳过 API 调用
- **贴图窗口** — 截图固定在原始位置，右侧译文面板支持高度拉伸
- **原文/译文切换** — 一键切换原文与翻译结果
- **一键复制** — 复制原文或译文到剪贴板
- **翻译历史** — 自动保存到本地 SQLite，支持查看/复制/删除/清空
- **多语言界面** — 简体中文 / English 界面，支持翻译为中文 / 英语 / 日语 / 韩语 / 法语 / 德语 / 西班牙语 / 俄语，跟随系统自动切换
- **快捷键冲突检测** — 自动检测快捷键是否被其他程序占用并发出警告
- **隐私安全** — 截图全在本地处理，仅翻译请求与自配 API 通信，无遥测
- **自动更新** — 启动时静默检查、下载、安装新版本
- **开机自启动** — 可选开机自动启动

## 快速上手

### 1. 配置 AI API

右键系统托盘 → **设置**，填入：

- **API 地址**：任意 OpenAI 兼容接口
- **API 密钥**：通过系统凭据管理器安全保存，不落盘
- **模型名称**：如 `gpt-4o`、`deepseek-chat`
- **目标语言**：中文、英语、日语、法语等
- **OCR 源语言**：自动检测 / 中文 / 英文 / 日文

### 2. 常用操作

```
Ctrl+Alt+L  → 框选截图并贴图到原位
                   ↓
  点击「翻译」→ OCR + AI 翻译，译文在右侧面板展示
                   ↓
  下次相同内容 → 自动命中缓存，即刻显示

Ctrl+Alt+P  → 剪贴板图片贴到桌面翻译
Ctrl+Alt+M  → 打开文本翻译窗口
```

### 3. 贴图窗口操作

| 操作 | 说明 |
|------|------|
| 翻译 / 重新翻译 | OCR + AI 翻译，重新翻译跳过缓存 |
| 复制原文/译文 | 一键复制到剪贴板 |
| 切换显示 | 切换原文与译文 |
| 拖拽 | 窗口标题区（排除按钮区域） |
| 拉伸面板 | 右侧面板边缘拖拽调整高度 |
| 关闭 | 双击图片区域 |
## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x |
| 前端 | React 18 + TypeScript + Vite 6 |
| UI 组件库 | Ant Design（深色主题） |
| 后端 | Rust (2024 edition) |
| 状态管理 | Zustand 5 |
| 路由 | react-router-dom 6 |
| 国际化 | react-i18next + i18next 24 |
| 截图 | xcap |
| OCR | Tesseract CLI（离线） |
| 翻译 | reqwest → OpenAI 兼容 API |
| 数据库 | SQLite (rusqlite) |
| 安全存储 | keyring（系统凭据管理器） |

## 从源码构建

```bash
git clone https://github.com/XuMingKe-06/SanpTranslate.git
cd SnapTranslate
pnpm install
pnpm run tauri dev    # 开发模式 (HMR)
pnpm run tauri build  # 生产构建
```

## 配置文件位置

| 内容 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 配置 | `%APPDATA%\SnapTranslate\config\config.toml` | `~/Library/Application Support/SnapTranslate/config/config.toml` | `~/.config/SnapTranslate/config/config.toml` |
| 历史数据库 | `%APPDATA%\SnapTranslate\data\history.db` | `~/Library/Application Support/SnapTranslate/data/history.db` | `~/.local/share/SnapTranslate/data/history.db` |

> API 密钥保存在系统凭据管理器中，**不存储在配置文件内**。

## 许可

[MIT License](LICENSE) — Copyright © 2026 SanpTranslate
