# 详细设计说明书（DLD）

## SnapTranslate - 截屏贴图翻译工具

| 文档版本 | 修订日期   | 作者   | 变更说明         |
|----------|------------|--------|------------------|
| V1.5     | 2026-05-10 | XuMingKe | 新增界面语言配置；更新控制栏组件设计；新增 ShortcutInput 组件 |
| V1.4     | 2026-05-08 | XuMingKe | 新增翻译缓存机制，优化数据库结构 |
| V1.3     | 2026-05-07 | XuMingKe | 完成历史记录模块；移除"翻译最近一张贴图"功能 |
| V1.2     | 2026-05-05 | XuMingKe | 合并翻译模式，统一使用 OCR 翻译流程 |
| V1.1     | 2026-05-02 | XuMingKe | 截图蒙版支持右键取消；贴图控制栏去除半透明背景 |
| V1.0     | 2026-05-02 | XuMingKe | 初始版本         |

---

## 1. 引言

### 1.1 编写目的

本文档在概要设计的基础上，对各模块的内部实现进行详细设计，包括类/结构体设计、函数签名、核心算法伪代码、前端组件设计及样式规范，为编码实现提供直接参考。

### 1.2 参考文档

- 《SnapTranslate 概要设计说明书（HLD）V1.2》
- 《SnapTranslate 系统/架构设计文档 V1.2》

---

## 2. 后端模块详细设计

### 2.1 capture 模块

#### 2.1.1 模块职责

负责屏幕图像捕获，包括全屏截图和区域截图。

#### 2.1.2 核心结构体与函数

```rust
pub struct CaptureService {
    monitors: Vec<MonitorInfo>,
}

pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

impl CaptureService {
    pub fn new() -> Result<Self, AppError>;

    pub fn list_monitors(&self) -> Vec<MonitorInfo>;

    pub fn capture_fullscreen(&self, monitor_id: Option<&str>) -> Result<CapturedImage, AppError>;

    pub fn capture_region(&self, region: &CaptureRegion) -> Result<CapturedImage, AppError>;
}

pub struct CapturedImage {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub format: ImageFormat,
}

pub enum ImageFormat {
    Png,
    Jpeg,
}
```

#### 2.1.3 capture_fullscreen 算法

```
1. 获取所有显示器列表
2. 若指定 monitor_id，选择对应显示器；否则选择主显示器
3. 调用 xcap::Monitor::capture_image() 获取 RgbImage
4. 将 RgbImage 编码为 PNG 字节流
5. 封装为 CapturedImage 返回
```

#### 2.1.4 capture_region 算法

```
1. 根据 region.monitor_id 确定目标显示器
2. 调用 xcap::Monitor::capture_image() 获取全屏图像
3. 使用 image::DynamicImage::crop() 裁剪指定区域
4. 编码为 PNG 字节流
5. 封装为 CapturedImage 返回
```

---

### 2.2 ocr 模块

#### 2.2.1 模块职责

封装 Tesseract OCR 引擎，提供离线文字识别与坐标提取功能。

#### 2.2.2 核心结构体与函数

```rust
pub struct OcrEngine {
    tessdata_dir: PathBuf,
    default_lang: String,
}

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

impl OcrEngine {
    pub fn new(tessdata_dir: PathBuf, lang: &str) -> Result<Self, AppError>;

    pub fn recognize(&self, image_data: &[u8]) -> Result<OcrResult, AppError>;

    pub fn recognize_with_lang(&self, image_data: &[u8], lang: &str) -> Result<OcrResult, AppError>;

    pub fn list_available_languages(&self) -> Vec<String>;
}
```

#### 2.2.3 recognize 算法

```
1. 将 image_data 解码为 DynamicImage
2. 保存为临时 PNG 文件（Tesseract 需要文件路径输入）
3. 初始化 LepTess 实例，设置语言和 tessdata 目录
4. 设置 PSM 模式为 AUTO (3) 以适应多种布局
5. 调用 set_image() 加载图像
6. 调用 recognize() 执行识别
7. 遍历 Tesseract 的迭代器获取每个文本块：
   a. 获取文本内容 (get_utf8_text)
   b. 获取 bounding box 坐标 (BoundingBox)
   c. 获取置信度 (confidence)
8. 过滤掉空文本和低置信度块（confidence < 30）
9. 按从上到下、从左到右排序
10. 删除临时文件
11. 返回 OcrResult
```

---

### 2.3 translate 模块

#### 2.3.1 模块职责

构造翻译请求，调用大模型 API，解析翻译结果。统一使用 OCR 翻译模式。

#### 2.3.2 核心结构体与函数

```rust
pub struct TranslateService {
    client: reqwest::Client,
    config: AppConfig,
}

pub struct TranslateRequest {
    pub image_data: String,
    pub target_lang: String,
}

impl TranslateService {
    pub fn new(config: AppConfig) -> Result<Self, AppError>;

    pub async fn translate_image(&self, request: TranslateRequest) -> Result<TranslateResult, AppError>;

    pub async fn test_connection(&self) -> Result<(), AppError>;
}
```

#### 2.3.3 translate_image 算法

```
1. 调用 ocr 模块执行 Tesseract 识别
2. 返回 OcrResult（含文本块及坐标）
3. 构造编号列表格式的用户消息：
   "1. {block_1.text}\n2. {block_2.text}\n..."
4. 构造系统消息：
   "You are a translation assistant. Please translate the following numbered text into {target_lang}.
    Strictly maintain the numbering format, one translation per line. Return only the translation without explanation."
5. 构造 OpenAI Chat Completions 请求体
6. 发送 POST 请求到 {api_base_url}/chat/completions
7. 设置超时为 30 秒
8. 解析响应 JSON，提取 choices[0].message.content
9. 按编号解析译文，映射回各文本块
10. 返回 TranslateResult
```

#### 2.3.4 test_connection 算法

```
1. 构造最小请求：发送 "Hello" 请求翻译
2. 设置超时为 10 秒
3. 若返回 200 状态码，返回成功
4. 若返回 401/403，返回"认证失败"
5. 若超时，返回"连接超时"
6. 其他错误返回具体错误信息
```

#### 2.3.5 Tauri Command

```rust
#[tauri::command]
pub async fn translate_image(
    image_data: String,
    target_language: String,
    app: tauri::AppHandle,
) -> Result<TranslateResult, String> {
    let config = get_config(&app).map_err(|e| e.to_string())?;
    let api_key = get_api_key(&app).map_err(|e| e.to_string())?;
    let service = TranslateService::new(config, api_key).map_err(|e| e.to_string())?;
    let request = TranslateRequest { image_data, target_lang: target_language };
    service.translate_image(request).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_api_connection(
    api_base_url: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let service = TranslateService::new_for_test(api_base_url, api_key, model)
        .map_err(|e| e.to_string())?;
    service.test_connection().await.map_err(|e| e.to_string())?;
    Ok("连接成功".to_string())
}
```

---

### 2.4 config 模块

#### 2.4.1 模块职责

管理应用配置的读写，API 密钥的安全存储与读取。

#### 2.4.2 核心结构体与函数

```rust
pub struct ConfigManager {
    config_dir: PathBuf,
    config_path: PathBuf,
}

pub struct SecureKeyStore {
    service_name: String,
}

impl ConfigManager {
    pub fn new(app: &tauri::AppHandle) -> Result<Self, AppError>;

    pub fn load(&self) -> Result<AppConfig, AppError>;

    pub fn save(&self, config: &AppConfig) -> Result<(), AppError>;

    pub fn get_config_dir(&self) -> &Path;
}

impl SecureKeyStore {
    pub fn new() -> Self;

    pub fn save_key(&self, key: &str) -> Result<(), AppError>;

    pub fn load_key(&self) -> Result<String, AppError>;

    pub fn delete_key(&self) -> Result<(), AppError>;
}
```

#### 2.4.3 配置文件读写算法

```
读取：
1. 检查 config_path 是否存在
2. 若不存在，返回默认配置
3. 若存在，读取文件内容
4. 使用 toml::from_str() 反序列化为 AppConfig
5. 返回配置

写入：
1. 使用 toml::to_string_pretty() 序列化 AppConfig
2. 确保配置目录存在
3. 写入文件（使用原子写入：先写临时文件，再重命名）
```

#### 2.4.4 密钥安全存储算法

```
保存：
1. 调用 keyring::Entry::new("snaptranslate", "api_key")
2. 调用 entry.set_password(key)
3. 若 OS 凭据管理器不可用，回退到本地加密文件（AES-256-GCM）

读取：
1. 调用 keyring::Entry::new("snaptranslate", "api_key")
2. 调用 entry.get_password()
3. 返回密钥明文
```

---

### 2.5 history 模块

#### 2.5.1 模块职责

管理翻译历史的 CRUD 操作，生成缩略图，提供翻译缓存匹配功能。

#### 2.5.2 核心结构体与函数

```rust
pub struct HistoryService {
    db: Connection,
}

impl HistoryService {
    pub fn new(db_path: &Path) -> Result<Self, AppError>;

    pub fn add_entry(&self, entry: NewHistoryEntry) -> Result<i64, AppError>;

    pub fn get_list(&self, limit: u32) -> Result<Vec<HistoryEntry>, AppError>;

    pub fn get_detail(&self, id: i64) -> Result<HistoryEntry, AppError>;

    pub fn delete_entry(&self, id: i64) -> Result<(), AppError>;

    pub fn clear_all(&self) -> Result<(), AppError>;

    pub fn count(&self) -> Result<u32, AppError>;

    pub fn find_by_ocr_text(&self, ocr_text: &str, target_language: &str) -> Result<Option<(i64, String)>, AppError>;
}

pub struct NewHistoryEntry {
    pub image_data: Vec<u8>,
    pub ocr_text: Option<String>,
    pub translated_text: String,
    pub target_language: String,
    pub blocks_json: String,
}
```

#### 2.5.3 add_entry 算法

```
1. 将 image_data 解码为 DynamicImage
2. 生成缩略图（最大尺寸 200x200，保持宽高比）
3. 将缩略图编码为 JPEG（quality=80）以节省空间
4. 获取当前时间戳（ISO 8601 格式）
5. 执行 INSERT SQL：
   INSERT INTO history (image_blob, thumbnail, ocr_text, translated_text, target_language, blocks_json, created_at)
   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
6. 返回新记录 ID
7. 检查总记录数，若超过 max_history（默认50），删除最旧的记录
```

#### 2.5.4 find_by_ocr_text 算法

```
1. 构造查询 SQL：
   SELECT id, blocks_json FROM history 
   WHERE ocr_text = ?1 AND target_language = ?2 
   AND blocks_json IS NOT NULL AND blocks_json != '' 
   ORDER BY created_at DESC LIMIT 1
2. 执行查询
3. 若找到记录，返回 Some((id, blocks_json))
4. 若未找到，返回 None
```

#### 2.5.5 数据库初始化

```sql
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_blob BLOB,
    thumbnail BLOB NOT NULL,
    ocr_text TEXT,
    translated_text TEXT NOT NULL,
    target_language TEXT DEFAULT '',
    blocks_json TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);
```

---

### 2.6 clipboard 模块

#### 2.6.1 模块职责

系统剪贴板的图像与文本读写。

#### 2.6.2 核心函数

```rust
pub fn read_clipboard_image() -> Result<Option<Vec<u8>>, AppError>;

pub fn write_clipboard_image(image_data: &[u8]) -> Result<(), AppError>;

pub fn write_clipboard_text(text: &str) -> Result<(), AppError>;

pub fn has_clipboard_image() -> bool;
```

#### 2.6.3 read_clipboard_image 算法

```
1. 调用 tauri-plugin-clipboard-manager 的 read_image()
2. 若剪贴板无图像，返回 Ok(None)
3. 若有图像，解码为 PNG 字节流
4. 返回 Ok(Some(png_bytes))
```

---

### 2.7 hotkey 模块

#### 2.7.1 模块职责

全局快捷键的注册、监听与自定义。

#### 2.7.2 核心函数

```rust
pub fn register_hotkeys(app: &tauri::AppHandle, config: &ShortcutConfig) -> Result<(), AppError>;

pub fn unregister_hotkeys(app: &tauri::AppHandle) -> Result<(), AppError>;

pub fn update_hotkey(app: &tauri::AppHandle, action: &str, new_shortcut: &str) -> Result<(), AppError>;
```

#### 2.7.3 register_hotkeys 算法

```
1. 使用 tauri-plugin-global-shortcut 注册截图快捷键
   - 快捷键字符串：config.capture（默认 "Ctrl+Alt+L"）
   - 回调：触发截图流程
2. 注册剪贴板贴图快捷键
   - 快捷键字符串：config.pin_clipboard（默认 "Ctrl+Alt+P"）
   - 回调：触发剪贴板贴图流程
3. 注册失败时（冲突），返回错误提示
```

---

### 2.8 tray 模块

#### 2.8.1 模块职责

系统托盘图标的创建与菜单管理。

#### 2.8.2 核心函数

```rust
pub fn create_tray(app: &tauri::AppHandle) -> Result<(), AppError>;
```

#### 2.8.3 create_tray 算法

```
1. 创建 TrayIconBuilder
2. 设置图标（从资源目录加载）
3. 设置提示文字（"SnapTranslate"）
4. 构建菜单项：
   - "框选截图翻译  Ctrl+Alt+L" -> 触发截图
   - "从剪贴板贴图  Ctrl+Alt+P" -> 触发贴图
   - Separator
   - "截图与翻译历史" -> 打开历史面板
   - Separator
   - "设置" -> 打开设置窗口
   - "退出" -> 退出应用
5. 设置菜单点击事件处理器
6. 构建 TrayIcon
```

---

### 2.9 window 模块

#### 2.9.1 模块职责

管理各类窗口的创建、销毁与属性设置。

#### 2.9.2 核心函数

```rust
pub fn create_overlay_window(app: &tauri::AppHandle, monitor: &MonitorInfo) -> Result<Window, AppError>;

pub fn create_pin_window(
    app: &tauri::AppHandle,
    image_data: &str,
    x: i32, y: i32, w: u32, h: u32,
) -> Result<String, AppError>;

pub fn close_pin_window(app: &tauri::AppHandle, window_id: &str) -> Result<(), AppError>;

pub fn create_settings_window(app: &tauri::AppHandle) -> Result<Window, AppError>;

pub fn create_history_window(app: &tauri::AppHandle) -> Result<Window, AppError>;
```

#### 2.9.3 create_pin_window 算法

```
1. 生成唯一窗口标签（如 "pin-{uuid}"）
2. 创建 WebviewWindowBuilder：
   - label: 窗口标签
   - url: "/pin"（贴图页面路由）
   - title: ""（空标题）
   - decorations: false（无边框）
   - always_on_top: true（置顶）
   - skip_taskbar: true（不在任务栏显示）
   - transparent: true（透明背景）
   - position: (x, y)
   - size: (width, height + control_bar_height)
   - resizable: false
3. 初始化时通过 event 传递图像数据到前端
4. 返回窗口标签
```

#### 2.9.4 create_overlay_window 算法

```
1. 创建全屏透明窗口：
   - decorations: false
   - always_on_top: true
   - transparent: true
   - fullscreen: true
   - focusable: true（需要接收鼠标事件）
   - resizable: false
2. 窗口覆盖指定显示器
3. url: "/overlay"（截图蒙版页面路由）
4. 通过 event 传递全屏图像数据到前端
```

---

## 3. 前端模块详细设计

### 3.1 PinView.vue 贴图窗口组件

#### 3.1.1 组件职责

显示截图图像、控制栏按钮、译文覆盖标签，处理拖拽移动与双击关闭。

#### 3.1.2 状态

```typescript
const state = reactive({
  imageDataUrl: '',
  position: { x: 0, y: 0 },
  size: { width: 0, height: 0 },
  translateStatus: 'idle' as 'idle' | 'translating' | 'done' | 'error',
  ocrBlocks: [] as TranslatedBlock[],
  showOriginal: false,
  errorMessage: '',
})
```

#### 3.1.3 模板结构

```html
<div class="pin-container" @mousedown="onDragStart" @dblclick="onDoubleClick">
  <div class="image-area" ref="imageArea">
    <img :src="state.imageDataUrl" class="pin-image" draggable="false" />

    <!-- 译文标签 -->
    <template v-if="!state.showOriginal">
      <TransLabel
        v-for="(block, index) in state.ocrBlocks"
        :key="index"
        :block="block"
        @click="onLabelClick(block)"
      />
    </template>
  </div>

  <ControlBar
    :translate-status="state.translateStatus"
    :show-original="state.showOriginal"
    :has-translation="state.ocrBlocks.length > 0"
    @translate="onTranslate"
    @copy-all="onCopyAll"
    @toggle-original="onToggleOriginal"
  />
</div>
```

#### 3.1.4 核心方法

```typescript
async function onTranslate() {
  state.translateStatus = 'translating'
  try {
    const config = await invoke('get_config')
    const result = await invoke('translate_image', {
      imageData: extractBase64(state.imageDataUrl),
      targetLanguage: config.target_language,
    })
    state.ocrBlocks = result.blocks
    state.translateStatus = 'done'
  } catch (e) {
    state.translateStatus = 'error'
    state.errorMessage = String(e)
  }
}

function onDragStart(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.control-bar')) return
  const startX = e.screenX
  const startY = e.screenY
  const startPos = { ...state.position }

  function onMouseMove(e: MouseEvent) {
    state.position.x = startPos.x + (e.screenX - startX)
    state.position.y = startPos.y + (e.screenY - startY)
    // 调用 Tauri 窗口 API 移动窗口
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onDoubleClick() {
  invoke('close_pin_window', { windowId: props.pinId })
}

async function onLabelClick(block: TranslatedBlock) {
  await invoke('write_clipboard_text', { text: block.translated })
  // 显示"已复制"提示
}

async function onCopyAll() {
  const allText = state.ocrBlocks.map(b => b.translated).join('\n')
  await invoke('write_clipboard_text', { text: allText })
}

function onToggleOriginal() {
  state.showOriginal = !state.showOriginal
}
```

---

### 3.2 OverlayView.vue 截图蒙版组件

#### 3.2.1 组件职责

显示半透明蒙版，处理用户框选交互。

#### 3.2.2 状态

```typescript
const state = reactive({
  isSelecting: false,
  startX: 0,
  startY: 0,
  endX: 0,
  endY: 0,
  fullscreenImage: '',
})
```

#### 3.2.3 模板结构

```html
<div class="overlay-container" @mousedown="onMouseDown" @mousemove="onMouseMove"
     @mouseup="onMouseUp" @keydown.esc="onEsc" @contextmenu.prevent="onContextMenu">
  <canvas ref="canvas" class="overlay-canvas"></canvas>
  <div v-if="state.isSelecting" class="selection-rect"
       :style="selectionStyle"></div>
</div>
```

#### 3.2.4 核心方法

```typescript
function onMouseDown(e: MouseEvent) {
  state.isSelecting = true
  state.startX = e.clientX
  state.startY = e.clientY
  state.endX = e.clientX
  state.endY = e.clientY
}

function onMouseMove(e: MouseEvent) {
  if (!state.isSelecting) return
  state.endX = e.clientX
  state.endY = e.clientY
}

async function onMouseUp(e: MouseEvent) {
  if (!state.isSelecting) return
  state.isSelecting = false

  const x = Math.min(state.startX, state.endX)
  const y = Math.min(state.startY, state.endY)
  const width = Math.abs(state.endX - state.startX)
  const height = Math.abs(state.endY - state.startY)

  if (width < 5 || height < 5) return

  const imageData = await invoke('capture_region_from_cache', { x, y, width, height })
  await invoke('write_clipboard_image', { imageData })
  await invoke('store_pin_image', { imageData })
  await invoke('create_pin_window', { x, y, width, height })

  // 关闭蒙版窗口
  await getCurrentWindow().close()
}

function onEsc() {
  getCurrentWindow().close()
}

function onContextMenu() {
  getCurrentWindow().close()
}
```

---

### 3.3 TransLabel.vue 译文标签组件

#### 3.3.1 Props

```typescript
defineProps<{
  block: TranslatedBlock
}>()

defineEmits<{
  click: []
}>()
```

#### 3.3.2 模板与样式

```html
<div class="trans-label"
     :style="{
       left: block.x + 'px',
       top: block.y + 'px',
       minWidth: block.width + 'px',
     }"
     @click="$emit('click')">
  {{ block.translated }}
</div>
```

```css
.trans-label {
  position: absolute;
  background: rgba(0, 0, 0, 0.75);
  color: #ffffff;
  font-size: 14px;
  line-height: 1.4;
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 0;
  white-space: pre-wrap;
  word-break: break-word;
  pointer-events: auto;
  user-select: none;
}

.trans-label:hover {
  background: rgba(0, 0, 0, 0.85);
}
```

---

### 3.4 ControlBar.vue 控制栏组件

#### 3.4.1 Props

```typescript
defineProps<{
  translateStatus: 'idle' | 'translating' | 'done' | 'error'
  showOriginal: boolean
  hasTranslation: boolean
  errorMessage?: string
  fromCache?: boolean
}>()

defineEmits<{
  translate: []
  retranslate: []
  copyOriginal: []
  copyTranslation: []
  toggleOriginal: []
}>()
```

#### 3.4.2 模板

```html
<div class="control-bar">
  <!-- idle 或 error 状态：显示翻译/重新翻译按钮 -->
  <button v-if="translateStatus === 'idle' || translateStatus === 'error'" class="btn" @click="$emit('translate')">
    {{ translateStatus === 'error' ? t('controlBar.retranslate') : t('controlBar.translate') }}
  </button>

  <!-- error 状态：显示错误提示 -->
  <span v-if="translateStatus === 'error' && errorMessage" class="error-msg">
    {{ errorMessage }}
  </span>

  <!-- translating 状态：显示禁用的翻译中按钮 -->
  <button v-else-if="translateStatus === 'translating'" class="btn" disabled>
    {{ t('controlBar.translating') }}
  </button>

  <!-- done 状态：显示操作按钮组 -->
  <template v-else-if="translateStatus === 'done'">
    <button class="btn" @click="$emit('copyOriginal')">{{ t('controlBar.copyOriginal') }}</button>
    <button class="btn" @click="$emit('copyTranslation')">{{ t('controlBar.copyTranslation') }}</button>
    <button class="btn" @click="$emit('retranslate')">{{ t('controlBar.retranslate') }}</button>
    <button class="btn" @click="$emit('toggleOriginal')">
      {{ showOriginal ? t('controlBar.showTranslation') : t('controlBar.showOriginal') }}
    </button>
    <span v-if="fromCache" class="cache-hint">{{ t('controlBar.cacheHit') }}</span>
  </template>
</div>
```

#### 3.4.3 样式

```css
.control-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  background: transparent;
  min-height: var(--control-bar-height);
}

.btn {
  padding: 4px 12px;
  border: none;
  border-radius: var(--border-radius);
  background: #3a3a40;
  color: #f0f0f0;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn:hover {
  background: #4e4e55;
}

.cache-hint {
  font-size: 12px;
  color: #4caf50;
  margin-left: auto;
  white-space: nowrap;
}

.error-msg {
  font-size: 12px;
  color: var(--color-danger);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

### 3.5 SettingsView.vue 设置页面

#### 3.5.1 组件职责

提供 API 配置表单，快捷键自定义，连接测试。

#### 3.5.2 表单字段

| 字段             | 组件类型   | 验证规则                       |
|-----------------|-----------|--------------------------------|
| 界面语言         | Select    | 必填，选项：跟随系统/简体中文/English |
| API 基础地址     | Input     | 必填，合法 URL                 |
| API 密钥        | Input (password) | 必填，可切换显示/隐藏   |
| 模型名称        | Input     | 必填                           |
| 目标翻译语言     | Select    | 必填，选项：中文/英文/日文/韩文/法文/德文/西班牙文/俄文 |
| 截图快捷键       | ShortcutInput | 合法快捷键组合                |
| 贴图快捷键       | ShortcutInput | 合法快捷键组合                |

---

### 3.6 ShortcutInput.vue 快捷键输入组件

#### 3.6.1 组件职责

提供快捷键捕获和显示功能，支持点击后监听键盘输入捕获快捷键组合。

#### 3.6.2 Props

```typescript
defineProps<{
  modelValue: string  // 当前快捷键值，如 "Ctrl+Alt+L"
  placeholder?: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
```

#### 3.6.3 模板

```html
<div class="shortcut-input" @click="startListening">
  <input
    type="text"
    :value="displayValue"
    :placeholder="placeholder"
    readonly
    @keydown="onKeydown"
  />
  <button v-if="modelValue" class="clear-btn" @click.stop="clearValue">
    ×
  </button>
</div>
```

#### 3.6.4 样式

```css
.shortcut-input {
  display: flex;
  align-items: center;
  background: #2a2a30;
  border-radius: var(--border-radius);
  padding: 0 8px;
}

.shortcut-input input {
  flex: 1;
  background: transparent;
  border: none;
  color: #f0f0f0;
  font-size: 14px;
  padding: 8px 0;
  cursor: pointer;
}

.shortcut-input input:focus {
  outline: none;
}

.clear-btn {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
}

.clear-btn:hover {
  color: #fff;
}
```

---

### 3.7 HistoryView.vue 历史面板

#### 3.7.1 组件职责

展示翻译历史列表，支持查看详情、复制、删除。

#### 3.7.2 模板结构

```html
<div class="history-container">
  <div class="history-header">
    <h2>{{ t('history.title') }}</h2>
    <button class="btn-danger" @click="onClearAll">{{ t('history.clear_all') }}</button>
  </div>
  <div class="history-list">
    <HistoryItem
      v-for="entry in historyList"
      :key="entry.id"
      :entry="entry"
      @copy="onCopy"
      @delete="onDelete"
      @detail="onDetail"
    />
  </div>
</div>
```

---

## 4. 全局样式规范

### 4.1 CSS 变量

```css
:root {
  --color-bg-primary: rgba(0, 0, 0, 0.75);
  --color-bg-secondary: rgba(0, 0, 0, 0.6);
  --color-bg-control: rgba(0, 0, 0, 0.6);
  --color-text-primary: #ffffff;
  --color-text-secondary: rgba(255, 255, 255, 0.7);
  --color-accent: rgba(255, 255, 255, 0.85);
  --color-accent-hover: rgba(255, 255, 255, 1);
  --color-danger: rgba(239, 68, 68, 0.8);
  --border-radius: 0;
  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  --control-bar-height: 36px;
  --label-padding: 2px 4px;
}
```

### 4.2 设计原则

- 所有圆角设为 0（直角设计），保持简洁利落风格。
- 半透明深色背景 + 白色文字，确保高对比度可读性。
- 控制栏使用透明背景，按钮上边界贴合图片下边界，左边界与图片左边界对齐。
- 按钮无圆角，使用半透明背景，hover 时增强亮度。

---

## 5. 错误处理设计

### 5.1 后端错误处理

```rust
impl From<xcap::Error> for AppError {
    fn from(e: xcap::Error) -> Self { AppError::CaptureError(e.to_string()) }
}

impl From<leptess::errors::LeptessError> for AppError {
    fn from(e: leptess::errors::LeptessError) -> Self { AppError::OcrError(e.to_string()) }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            AppError::NetworkError("请求超时".to_string())
        } else if e.is_connect() {
            AppError::NetworkError("无法连接到服务器".to_string())
        } else {
            AppError::NetworkError(e.to_string())
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self { AppError::DatabaseError(e.to_string()) }
}
```

### 5.2 前端错误处理

```typescript
async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (e) {
    const message = String(e)
    // 根据错误类型显示不同提示
    if (message.includes('NetworkError') || message.includes('超时')) {
      showError('网络连接失败，请检查网络设置')
    } else if (message.includes('401') || message.includes('认证')) {
      showError('API 认证失败，请检查密钥配置')
    } else {
      showError(`操作失败: ${message}`)
    }
    throw e
  }
}
```

---

## 6. 日志设计

### 6.1 日志级别

| 级别   | 使用场景                                     |
|-------|---------------------------------------------|
| ERROR | 翻译失败、OCR 错误、数据库异常               |
| WARN  | 快捷键冲突、API 响应异常、OCR 置信度低       |
| INFO  | 截图完成、翻译完成、配置保存                  |
| DEBUG | IPC 调用详情、API 请求/响应内容（默认关闭）   |

### 6.2 日志格式

```
[2026-05-02T14:30:15.123Z] [INFO] [translate] OCR翻译完成, 耗时: 342ms, 文本块数: 5
[2026-05-02T14:30:16.456Z] [ERROR] [translate] API请求失败: 连接超时
```

### 6.3 日志存储

- 默认关闭，用户可在设置中开启。
- 日志文件路径：`{data_dir}/logs/snaptranslate.log`
- 日志轮转：单文件最大 5MB，保留最近 3 个文件。

---
