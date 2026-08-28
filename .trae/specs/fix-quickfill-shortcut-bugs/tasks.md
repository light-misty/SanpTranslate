# Tasks

- [ ] Task 1: 隐藏填充文本输入框滚动条
  - [ ] SubTask 1.1: 补充/新增 QuickFillView 组件测试（渲染条目、增删改、保存调用、空状态），确保后续改动有回归基线
  - [ ] SubTask 1.2: QuickFillView.css 中为 `.quickfill-textarea` 添加滚动条隐藏样式（`::-webkit-scrollbar { display: none }`、`scrollbar-width: none`）
  - [ ] SubTask 1.3: 运行 `pnpm run test` 通过；按 git-commit skill 分阶段提交并推送

- [ ] Task 2: 重构快捷键冲突检测与快捷填充注册（修复 Bug 2 根因）
  - [ ] SubTask 2.1: 后端新增 `hotkey::parse_shortcut` / `parse_key_code` 单元测试（大小写、混合修饰键、F 键、非法输入、缺失按键等）
  - [ ] SubTask 2.2: 重构 `commands.rs::check_shortcut_conflict`：检测前记录"目标快捷键是否已被本应用注册"；探测完成后按原状态恢复，未注册过的不残留注册
  - [ ] SubTask 2.3: 重构 `quickfill::register_quick_fill_shortcuts`：注册前先注销目标快捷键自身避免 already-registered 脆弱重试；注册失败时收集错误信息
  - [ ] SubTask 2.4: `save_quick_fills` 命令在注册失败时返回错误信息（并记录日志）
  - [ ] SubTask 2.5: `cargo test` 与 `pnpm run test` 通过；提交并推送

- [ ] Task 3: 支持录制已全局注册的快捷键（修复 Bug 3）
  - [ ] SubTask 3.1: 后端新增 `ShortcutRecording(Mutex<bool>)` 状态（lib.rs manage）与命令 `set_shortcut_recording`；lib.rs 全局快捷键 handler 在"录制中"时，将按下的快捷键序列化后 emit 刷新事件 `quick-fill-record`（携带后端格式字符串），且不触发实际填充
  - [ ] SubTask 3.2: 前端 `utils/tauri.ts` 新增 `setShortcutRecording` 绑定与 `onShortcutRecorded` 监听封装
  - [ ] SubTask 3.3: `ShortcutInput` 组件接入录制状态（onFocus 开启 / stopRecording·onBlur 关闭）与 `quick-fill-record` 事件监听，收到事件后回填值并停止录制；保留 keydown 路径
  - [ ] SubTask 3.4: 补强 `ShortcutInput.test.tsx`（新增：事件回填路径、录制状态开关调用、keydown 原路径回归）
  - [ ] SubTask 3.5: `pnpm run test` 通过；提交并推送

- [ ] Task 4: 隔离 reregister_hotkeys 与快捷填充注册（修复隐患 A）
  - [ ] SubTask 4.1: `hotkey::reregister_hotkeys` 移除 `unregister_all()`，改为仅更新主快捷键三项的注册与 `CurrentShortcuts` 状态（注销旧主快捷键 → 注册新主快捷键）
  - [ ] SubTask 4.2: `cargo test` 通过；提交并推送

- [ ] Task 5: 快捷键重复校验与注册失败提示（修复隐患 C/D）
  - [ ] SubTask 5.1: QuickFillView 保存前校验：条目间快捷键重复、与主快捷键（get_config 返回的 shortcuts）重复；冲突时弹窗/提示并阻止保存
  - [ ] SubTask 5.2: `save_quick_fills` 注册失败时前端捕获错误并提示用户（结合 Task 2 后端错误返回）
  - [ ] SubTask 5.3: 补强 `QuickFillView.test.tsx`（重复校验用例）；`pnpm run test` 通过；提交并推送

- [ ] Task 6: 全面回归与交付验证
  - [ ] SubTask 6.1: `npx tsc --noEmit`、`pnpm run test`、`cargo test`、`cargo build` 全部通过
  - [ ] SubTask 6.2: 审查 quickfill/hotkey/ShortcutInput 代码确认无其他同类问题（如 unregister_all 误用、残留注册、静默失败）
  - [ ] SubTask 6.3: 对照 checklist.md 逐项核验，修复遗留问题；最终提交并推送

# Task Dependencies

- [Task 2] 依赖 [Task 1]（Task 1 建立 QuickFillView 测试基线）
- [Task 3] 依赖 [Task 2]（复用状态管理/shortcut 序列化；Task 3 的 handler 变更与 Task 2 的注册重构同处 quickfill 链路）
- [Task 5] 依赖 [Task 2]（后端错误返回）与 [Task 1]（QuickFillView 测试基线）
- [Task 6] 依赖全部前置任务