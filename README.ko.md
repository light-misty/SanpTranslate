<h1 align="center">SnapTranslate</h1>

<p align="center">
  <img src="docs/icon.png" alt="SnapTranslate Icon" width="128" />
</p>

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

## 소개

Tauri 2 기반 데스크톱 스크린샷 번역 도구입니다. 화면 영역을 선택 → 로컬 OCR로 텍스트 추출 → AI 번역 → 우측 패널에 결과 표시. 팝업 없이 작업 흐름을 방해하지 않습니다. 빠른 텍스트 입력을 지원하며, 단축키와 입력 텍스트 매핑을 설정하여 단축키로 포커스된 입력란에 자동 입력할 수 있습니다.

## 스크린샷 미리보기

<p align="center">
  <img src="docs/assets/readme-preview.png" alt="SnapTranslate" style="max-width: 100%; border-radius: 8px;" />
</p>

## 다운로드 및 설치

[Releases](https://github.com/XuMingKe-06/SanpTranslate/releases) 페이지에서 다운로드:

| 플랫폼 | 형식 |
|--------|------|
| Windows 10+ | `.exe` |
| macOS 12+ | `.dmg` |
| Linux (x86_64) | `.AppImage` |

⚠️ **시스템 요구 사항:**

- **Windows**: Windows 10 (1803+), WebView2 필요 (시스템 기본 제공)
- **macOS**: macOS 12+, WebKit 필요 (시스템 기본 제공). Homebrew를 통해 Tesseract 및 언어 데이터 패키지 설치 필요:
  ```bash
  brew install tesseract tesseract-lang
  ```
- **Linux**: X11/Wayland 지원, WebKitGTK 필요. Tesseract OCR 엔진 및 해당 언어 팩 설치 필요:
  - **Ubuntu / Debian**:
    ```bash
    sudo apt update
    sudo apt install tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng tesseract-ocr-jpn
    ```
  - **Arch Linux**:
    ```bash
    sudo pacman -S tesseract tesseract-data-chi_sim tesseract-data-eng tesseract-data-jpn
    ```

## 기능 목록

- **영역 선택 번역** — 전역 단축키 `Ctrl+Alt+L`, 영역 드래그 선택, 스크린샷 원위치 자동 고정
- **클립보드 고정** — `Ctrl+Alt+P` 클립보드 이미지를 데스크톱에 붙여넣고 번역
- **텍스트 번역** — `Ctrl+Alt+M` 텍스트 번역 창 열기, `Ctrl+Enter` 빠른 번역
- **빠른 텍스트 입력** — 단축키와 입력 텍스트 매핑 설정, 단축키로 포커스된 입력란에 자동 입력, 내장 템플릿 지원 (Git 워크트리 프롬프트 등)
- **로컬 OCR** — Tesseract 오프라인 엔진 내장, 중국어 / 영어 / 일본어 지원, 소스 언어 설정 또는 자동 감지 가능
- **AI 번역** — OpenAI 호환 / Anthropic / Gemini API 지원, 모델과 키 직접 준비
- **번역 캐시** — 반복 내용 자동 기록 조회, 캐시 히트 시 API 호출 스킵
- **고정 창** — 스크린샷 원래 위치에 고정, 우측 번역 패널 높이 조절 가능
- **원문/번역 전환** — 원클릭 원문과 번역 결과 전환
- **원클릭 복사** — 원문 또는 번역문을 클립보드에 복사
- **번역 기록** — 로컬 SQLite에 자동 저장, 보기/복사/삭제/비우기 지원
- **다국어 UI** — 간체 중국어 / English 인터페이스, 중국어 / 영어 / 일본어 / 한국어 / 프랑스어 / 독일어 / 스페인어 / 러시아어 번역 지원, 시스템 언어 자동 감지
- **단축키 충돌 감지** — 단축키가 다른 프로그램에서 사용 중인 경우 자동으로 감지하고 경고
- **프라이버시 보안** — 스크린샷 전부 로컬 처리, 번역만 자체 API와 통신, 텔레메트리 없음
- **자동 업데이트** — 시작 시 자동 확인, 다운로드 및 설치
- **자동 시작** — 부팅 시 자동 실행 옵션

## 빠른 시작

### 1. AI API 설정

시스템 트레이 우클릭 → **설정**에서 입력:

- **API 제공자**: OpenAI / Anthropic / Gemini
- **API 주소**: 각 제공자의 API 엔드포인트
- **API 키**: OS 자격 증명 관리자에 안전 저장, 디스크 미기록
- **모델 이름**: 예: `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-2.5-flash`
- **번역 대상 언어**: 중국어, 영어, 일본어, 프랑스어 등
- **OCR 소스 언어**: 자동 감지 / 중국어 / 영어 / 일본어

### 2. 기본 조작

```
Ctrl+Alt+L  → 영역 선택, 스크린샷 원래 위치에 고정
                   ↓
  "번역" 클릭 → OCR + AI 번역, 결과 우측 패널 표시
                   ↓
  동일 내용 다음 → 자동 캐시 히트, 즉시 결과

Ctrl+Alt+P  → 클립보드 이미지를 데스크톱에 붙여넣고 번역
Ctrl+Alt+M  → 텍스트 번역 창 열기
```

### 3. 빠른 텍스트 입력

시스템 트레이 우클릭 → **빠른 텍스트 입력**, 단축키와 입력 텍스트 매핑 설정:

- "항목 추가"를 클릭하여 새 단축키 매핑 생성
- 단축키와 대응하는 입력 텍스트 설정
- 내장 템플릿 (Git 워크트리 프롬프트 등) 으로 빠른 설정 지원
- 입력란에 포커스가 있는 상태에서 단축키를 누르면 자동 입력

### 4. 고정 창 조작

| 조작 | 설명 |
|------|------|
| 번역 / 다시 번역 | OCR + AI 번역, 다시 번역은 캐시 스킵 |
| 원문/번역문 복사 | 원클릭 클립보드 복사 |
| 전환 | 원문과 번역 전환 |
| 이동 | 창 제목 영역 (버튼 영역 제외) |
| 패널 늘리기 | 우측 패널 가장자리 드래그 |
| 닫기 | 이미지 영역 더블클릭 |

## 기술 스택

| 계층 | 기술 |
|------|------|
| 데스크톱 프레임워크 | Tauri 2.x |
| 프론트엔드 | React 18 + TypeScript + Vite 6 |
| UI | Ant Design (다크 테마) |
| 백엔드 | Rust (2024 edition) |
| 상태 관리 | Zustand 5 |
| 라우팅 | react-router-dom 6 |
| 국제화 | react-i18next + i18next 24 |
| 캡처 | xcap |
| OCR | Tesseract CLI (오프라인) |
| 번역 | reqwest → OpenAI 호환 / Anthropic / Gemini API |
| 데이터베이스 | SQLite (rusqlite) |
| 보안 저장소 | keyring (OS 자격 증명 관리자) |

## 소스 코드에서 빌드

```bash
git clone https://github.com/light-misty/SanpTranslate.git
cd SnapTranslate
pnpm install
pnpm run tauri dev    # 개발 모드 (HMR)
pnpm run tauri build  # 프로덕션 빌드
```

## 설정 파일 위치

| 내용 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 설정 파일 | `%APPDATA%\SnapTranslate\config\config.toml` | `~/Library/Application Support/SnapTranslate/config/config.toml` | `~/.config/SnapTranslate/config/config.toml` |
| 기록 DB | `%APPDATA%\SnapTranslate\data\history.db` | `~/Library/Application Support/SnapTranslate/data/history.db` | `~/.local/share/SnapTranslate/data/history.db` |

> API 키는 OS 자격 증명 관리자에 저장되며, **설정 파일에 저장되지 않습니다**.

## 라이선스

[MIT License](LICENSE) — Copyright © 2026 SanpTranslate
