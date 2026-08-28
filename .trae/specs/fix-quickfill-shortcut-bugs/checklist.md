# Checklist

## Bug 1：滚动条隐藏
- [x] `.quickfill-textarea` 滚动条隐藏样式已添加（WebKit 与 Firefox/scrollbar-width 兼容）
- [x] 输入框文本溢出时仍可滚动（非禁止滚动）
- [x] QuickFillView 组件测试覆盖渲染/增删改/保存/空状态

## Bug 2：保存后快捷键无效
- [x] `check_shortcut_conflict` 不再残留注册：检测未注册过的快捷键后系统不残留该注册
- [x] `check_shortcut_conflict` 检测应用已注册快捷键后，原注册完整恢复
- [x] `register_quick_fill_shortcuts` 注册前自注销，不再依赖 already-registered 重试脆弱路径
- [x] `save_quick_fills` 注册失败返回错误信息（日志记录、前端可感知）
- [ ] 添加条目→设置快捷键+文本→保存→外部程序输入框按下快捷键→文本成功填充（人工冒烟验证）

## Bug 3：重绑录制卡死
- [x] 后端存在 `ShortcutRecording` 状态与 `set_shortcut_recording` 命令
- [x] 全局快捷键 handler 在录制中 emit `quick-fill-record` 事件（携带后端格式字符串），且不触发填充
- [x] `ShortcutInput` 监听事件回填并停止录制；按"保存过快捷键 A → 改为 B → 再改回 A"流程录制成功（人工冒烟验证）
- [x] 未注册快捷键仍可通过 keydown 路径录制（原逻辑回归）
- [x] `ShortcutInput.test.tsx` 覆盖事件回填与 keydown 两条路径

## 隐患 A：reregister_hotkeys 误注销
- [x] `reregister_hotkeys` 不再调用 `unregister_all()`
- [x] 设置页保存主快捷键/语言后，快捷填充快捷键注册保持不变

## 隐患 C/D：冲突校验与失败提示
- [x] QuickFillView 保存前校验条目间快捷键重复并提示
- [x] QuickFillView 保存前校验与主快捷键冲突并提示
- [x] 快捷键被占用/注册失败时前端有提示或日志可查

## 全面验证
- [x] `npx tsc --noEmit` 通过
- [x] `pnpm run test` 全部通过（60 个用例）
- [x] `cargo test` 全部通过（40 个用例）
- [x] `cargo build` 编译通过
- [x] 每次任务完成均按 git-commit skill 分阶段提交并推送（无一次性大提交）