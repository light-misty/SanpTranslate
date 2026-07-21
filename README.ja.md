<h1 align="center">SnapTranslate</h1>

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" alt="SnapTranslate Logo" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.x-FFC131" alt="Tauri 2.x" />
  <img src="https://img.shields.io/static/v1?label=Rust&message=2024&color=orange" alt="Rust 2024" />
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue 3.5" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript" alt="TypeScript 5.7" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Cross Platform" />
</p>

<p align="center">
  <a href="README.zh.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.md">English</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a>
</p>

## 概要

Tauri 2 ベースのデスクトップスクリーンショット翻訳ツールです。画面の領域を選択 → ローカル OCR でテキスト抽出 → AI 翻訳 → 右側パネルに結果表示。ポップアップや作業中断はありません。

## スクリーンショット

<p align="center">
  <img src="docs/assets/readme-preview.png" alt="SnapTranslate" style="max-width: 100%; border-radius: 8px;" />
</p>

## ダウンロードとインストール

[Releases](https://github.com/XuMingKe-06/SanpTranslate/releases) からダウンロード:

| プラットフォーム | 形式 |
|-----------------|------|
| Windows 10+ | `.exe` |
| macOS 12+ | `.dmg` |
| Linux (x86_64) | `.AppImage` |

⚠️ **システム要件:**

- **Windows**: Windows 10 (1803+), WebView2 が必要 (システム標準搭載)
- **macOS**: macOS 12+, WebKit が必要 (システム標準搭載). Homebrew 経由で Tesseract および言語データのインストールが必要:
  ```bash
  brew install tesseract tesseract-lang
  ```
- **Linux**: X11/Wayland 対応、WebKitGTK が必要。Tesseract OCR エンジンおよび該当する言語パックのインストールが必要:
  - **Ubuntu / Debian**:
    ```bash
    sudo apt update
    sudo apt install tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng tesseract-ocr-jpn
    ```
  - **Arch Linux**:
    ```bash
    sudo pacman -S tesseract tesseract-data-chi_sim tesseract-data-eng tesseract-data-jpn
    ```

## 機能一覧

- **領域選択翻訳** — グローバルホットキー `Ctrl+Alt+L`、領域をドラッグ選択、スクリーンショットを元の位置に自動貼り付け
- **クリップボード貼り付け** — `Ctrl+Alt+P` クリップボード画像をデスクトップに貼り付けて翻訳
- **テキスト翻訳** — `Ctrl+Alt+M` テキスト翻訳ウィンドウを開く、`Ctrl+Enter` で素早く翻訳
- **ローカル OCR** — Tesseract オフラインエンジン内蔵、中国語 / 英語 / 日本語対応、自動言語検出
- **AI 翻訳** — OpenAI 互換 API、モデルとキーは自己管理
- **翻訳キャッシュ** — 同一コンテンツは履歴を自動照合、キャッシュヒット時は API 呼び出しをスキップ
- **固定ウィンドウ** — スクリーンショットを元の位置に固定、右側翻訳パネルは高さ調整可能
- **原文/翻訳切替** — ワンクリックで原文と翻訳結果を切替
- **ワンクリックコピー** — 原文または翻訳文をクリップボードにコピー
- **翻訳履歴** — ローカル SQLite に自動保存、表示/コピー/削除/クリア対応
- **バイリンガル UI** — 簡体字中国語 / English、システム言語自動検出
- **プライバシー** — スクリーンショットは全てローカル処理、翻訳のみ自己管理の API と通信、テレメトリーなし
- **自動更新** — 起動時に自動チェック、ダウンロードおよびインストール
- **自動起動** — 起動時自動実行オプション

## クイックスタート

### 1. AI API の設定

システムトレイを右クリック → **設定** で入力:

- **API アドレス**: OpenAI 互換エンドポイント
- **API キー**: OS 認証情報マネージャーに安全保存、ディスクに書き込まれません
- **モデル名**: 例: `gpt-4o`、`deepseek-chat`
- **翻訳先言語**: 中国語、英語、日本語、フランス語など
- **OCR ソース言語**: 自動検出 / 中国語 / 英語 / 日本語

### 2. 基本操作

```
Ctrl+Alt+L  → 領域選択、スクリーンショットを元の位置に貼り付け
                   ↓
  「翻訳」クリック → OCR + AI 翻訳、結果を右側パネルに表示
                   ↓
  同じ内容次回 → 自動キャッシュヒット、即時結果

Ctrl+Alt+P  → クリップボード画像をデスクトップに貼り付けて翻訳
Ctrl+Alt+M  → テキスト翻訳ウィンドウを開く
```

### 3. 固定ウィンドウの操作

| 操作 | 説明 |
|------|------|
| 翻訳 / 再翻訳 | OCR + AI 翻訳、再翻訳はキャッシュをスキップ |
| 原文/翻訳文をコピー | ワンクリックでクリップボードにコピー |
| 切替 | 原文と翻訳を切替 |
| 移動 | ウィンドウタイトル領域（ボタン領域を除く） |
| パネル伸縮 | 右側パネル端をドラッグ |
| 閉じる | 画像領域をダブルクリック |
## 技術スタック

| 階層 | 技術 |
|------|------|
| デスクトップフレームワーク | Tauri 2.x |
| フロントエンド | Vue 3.5 + TypeScript + Vite 6 |
| UI | Naive UI (ダークテーマ) |
| バックエンド | Rust (2024 edition) |
| 状態管理 | Pinia 3 |
| ルーティング | Vue Router 5 |
| 国際化 | vue-i18n 11 |
| キャプチャ | xcap |
| OCR | Tesseract CLI (オフライン) |
| 翻訳 | reqwest → OpenAI 互換 API |
| データベース | SQLite (rusqlite) |
| セキュアストレージ | keyring (OS 認証情報マネージャー) |

## ソースコードからのビルド

```bash
git clone https://github.com/XuMingKe-06/SanpTranslate.git
cd SnapTranslate
npm install
npm run tauri dev    # 開発モード (HMR)
npm run tauri build  # プロダクションビルド
```

## 設定ファイルの場所

| 内容 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 設定ファイル | `%APPDATA%\SnapTranslate\config\config.toml` | `~/Library/Application Support/SnapTranslate/config/config.toml` | `~/.config/SnapTranslate/config/config.toml` |
| 履歴 DB | `%APPDATA%\SnapTranslate\data\history.db` | `~/Library/Application Support/SnapTranslate/data/history.db` | `~/.local/share/SnapTranslate/data/history.db` |

> API キーは OS 認証情報マネージャーに保存され、**設定ファイルには保存されません**。

## ライセンス

[MIT License](LICENSE) — Copyright © 2026 SanpTranslate
