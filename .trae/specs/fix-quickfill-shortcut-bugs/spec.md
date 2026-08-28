# 快捷文本填充功能修复 Spec

## Why

快捷文本填充功能（feat/quick-text-fill 分支开发）存在三个已复现的缺陷，其中两个导致核心功能不可用：

1. 在快捷文本填充页面添加条目、设置快捷键与填充文本并保存后，在其他程序中按下快捷键无法填充文本（**核心功能失效**）。
2. 将已有条目的快捷键 A 改为 B、再改回 A 时，A 无法录制进快捷键输入框，界面一直显示"请按下快捷键"。
3. 填充文本输入框右端的滚动条需要隐藏。

同时经排查发现若干关联隐患（设置页保存会注销快捷填充快捷键、快捷键冲突检测存在残留注册副作用、条目间快捷键重复无提示等），需要一并修复。

## What Changes

- **修复 Bug 1**：QuickFillView 填充文本输入框（textarea）滚动条隐藏，保留滚动能力。
- **修复 Bug 2（保存后快捷键无效）**：
  - 重构 `check_shortcut_conflict` 命令，消除"探测后残留注册"副作用，并按"检测前是否已注册"完整恢复原状。
  - 重构 `register_quick_fill_shortcuts`：注册前自注销避免 already-registered 冲突；注册失败时向上返回错误，不再静默失败。
  - `save_quick_fills` 命令注册失败时返回错误信息，前端通过日志/提示反馈用户。
- **修复 Bug 3（重绑录制卡死）**：
  - 后端新增"快捷键录制中"状态 `ShortcutRecording` 与命令 `set_shortcut_recording`。
  - 全局快捷键 handler 在录制状态下，将按下的已注册快捷键以后端格式 emit 事件到前端窗口，前端 `ShortcutInput` 监听并填写，不再依赖 WebView 收不到 keydown 的场景。
  - `ShortcutInput` 组件接入录制状态与事件监听，录制结束后正确停止并回填。
- **修复关联隐患 A**：`reregister_hotkeys` 不再使用 `unregister_all()`（避免注销快捷填充快捷键），仅管理主快捷键三项注册与状态更新；快捷填充快捷键注册职责保持独立。
- **修复关联隐患 C/D**：quickfill 条目间快捷键重复与主快捷键冲突时，前端保存校验给出提示；后端注册失败明确返回错误。
- **测试**：为 `ShortcutInput`、`QuickFillView` 补齐/增强前端单测；为 `parse_shortcut`/`parse_key_code` 与 quickfill 纯逻辑补充 Rust 单测。

## Impact

- Affected specs: 快捷文本填充（QuickFillView）、快捷键录制（ShortcutInput）、全局快捷键注册（hotkey/quickfill）、设置页快捷键（SettingsView 复用 ShortcutInput）
- Affected code:
  - 前端: `src/views/QuickFillView.tsx` / `.css`、`src/components/ShortcutInput.tsx` / `.css`、`src/utils/tauri.ts`、`src/i18n/locales/*.ts`、`src/views/QuickFillView.test.tsx（新）`、`src/components/ShortcutInput.test.tsx`
  - 后端: `src-tauri/src/lib.rs`、`src-tauri/src/commands.rs`、`src-tauri/src/hotkey/mod.rs`、`src-tauri/src/quickfill/mod.rs`

---

## ADDED Requirements

### Requirement: 隐藏填充文本输入框滚动条

系统 SHALL 在快捷文本填充页面中对填充文本输入框（textarea）隐藏滚动条，同时保留文本滚动能力。

#### Scenario: 文本超出显示高度

- **WHEN** 填充文本输入框中文本内容超出显示高度
- **THEN** 输入框可继续滚动，但不显示右侧/底部滚动条

### Requirement: 录制已注册快捷键可通过事件获取按键

系统 SHALL 在快捷键录制期间，通过全局快捷键事件通道将用户按下的已注册快捷键传递给前端录制组件，避免因全局热键劫持 keydown 导致无法录制。

#### Scenario: 重绑为已全局注册的快捷键

- **WHEN** 用户在快捷填充页面录制当前已被全局注册的快捷键组合（如将 A 改回此前保存过的 A）
- **THEN** 快捷键框正常填入该组合并停止录制，不再卡在"请按下快捷键"

#### Scenario: 录制未注册快捷键（原有路径）

- **WHEN** 用户录制的快捷键组合未在任何位置注册
- **THEN** 仍通过 WebView keydown 正常录制（原逻辑保留）

### Requirement: 快捷键冲突在保存前校验

系统 SHALL 在保存快捷填充配置时，校验条目之间以及条目与主快捷键（截图/剪贴板贴图/文本翻译）之间是否存在重复，并向用户提示。

#### Scenario: 两个条目使用相同快捷键

- **WHEN** 用户为两个快捷填充条目设置完全相同的快捷键并点击保存
- **THEN** 前端给出中文提示，明确冲突项

## MODIFIED Requirements

### Requirement: 快捷键冲突检测无副作用

修改 `check_shortcut_conflict` 命令，检测过程中不残留全局注册，且按照检测前的注册状态完整恢复。

#### Scenario: 检测应用已注册的快捷键

- **WHEN** 用户打开快捷填充页面，Value 变化触发冲突检测，目标快捷键此前已被应用注册
- **THEN** 检测完成后该快捷键仍处于已注册状态，功能不受影响

#### Scenario: 检测应用未注册的快捷键

- **WHEN** 用户录制的快捷键此前未被应用注册，Value 变化触发冲突检测
- **THEN** 检测完成后系统中不残留该快捷键的全局注册

### Requirement: 快捷填充快捷键注册健壮且失败可见

修改 `register_quick_fill_shortcuts` 与 `save_quick_fills`：

- 注册前先注销目标快捷键自身，避免 already-registered 冲突重试的脆弱路径。
- 注册失败时返回错误信息，由前端日志/提示呈现，不再静默失败且无映射。

#### Scenario: 保存后快捷键可用

- **WHEN** 用户添加条目、设置快捷键与文本并保存，随后在其他程序输入框按下该快捷键
- **THEN** 文本被填充到焦点输入框

#### Scenario: 快捷键被其他程序占用

- **WHEN** 用户保存的快捷键已被其他程序注册导致注册失败
- **THEN** 前端日志记录失败原因，用户可在页面获知该快捷键不可用

### Requirement: 设置页保存不注销快捷填充快捷键

修改 `reregister_hotkeys`，仅注销/重注册主快捷键（截图/剪贴板贴图/文本翻译），不再使用 `unregister_all()` 误伤快捷填充注册。

#### Scenario: 修改设置后快捷填充仍有效

- **WHEN** 用户配置了快捷填充快捷键，随后在设置页修改主快捷键语言/快捷键并保存
- **THEN** 快捷填充快捷键注册保持不变，按下仍可正常填充

## REMOVED Requirements

### Requirement: check_shortcut_conflict 的残留注册行为

**Reason**: 探测成功后无条件"恢复注册"会把一个尚未保存的快捷键残留注册到系统，是保存后注册冲突（Bug 2）与录制拦截（Bug 3）的直接诱因。
**Migration**: 改为按检测前状态恢复；未注册过的快捷键检测后保持未注册。