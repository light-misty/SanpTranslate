# Tasks

- [x] Task 1: 依赖与构建配置迁移
  - [ ] SubTask 1.1: 更新 `package.json`：移除 vue/pinia/vue-i18n/vue-router/naive-ui/@vitejs/plugin-vue/vue-tsc；新增 react/react-dom/react-router-dom@6/zustand/react-i18next/i18next/antd；devDependencies 新增 @vitejs/plugin-react；`build` 脚本改为 `tsc --noEmit && vite build`；TypeScript 由 devDependencies 保留
  - [ ] SubTask 1.2: 更新 `vite.config.ts`：`@vitejs/plugin-vue` 替换为 `@vitejs/plugin-react` 的 `react()`，保留 `@` 别名、`__APP_VERSION__` define 与全部 dev server 配置
  - [ ] SubTask 1.3: 更新 `tsconfig.json`：`jsx` 设为 `"react-jsx"`，`include` 覆盖 `src/**/*.tsx`，保留 `@/*` paths 与现有严格选项
  - [ ] SubTask 1.4: 更新 `index.html`：入口脚本改为 `/src/main.tsx`，挂载点 `#app` 不变
  - [ ] SubTask 1.5: 执行依赖安装（优先 pnpm install，失败可跟随项目现状使用 npm install）
  - 验证：依赖安装成功，无版本冲突

- [x] Task 2: 应用入口、路由与国际化基础
  - [ ] SubTask 2.1: 新建 `src/main.tsx`：`createRoot` 挂载 `#app`；引入 `./styles/global.css`；antd `ConfigProvider`（darkAlgorithm，locale 随当前语言）+ `App`（antd）包裹；注册路由器
  - [ ] SubTask 2.2: 重写 `src/i18n/index.ts` 为 i18next：引入 `zh-CN.ts` / `en-US.ts` 语言包（内容不改动），默认语言按 `navigator.language` 判定 zh-CN/en-US，fallback `en-US`，插值符配置为 `{` / `}` 兼容 `{version}` 等占位符；导出 i18n 实例
  - [ ] SubTask 2.3: 新建 `src/App.tsx`：路由出口（5 条路径保持不变）；挂载时 `getConfig()` 初始化界面语言（auto 按系统语言判定），注意错误处理不阻塞渲染；`listen('language-changed')` 监听并调用 `i18n.changeLanguage`；卸载时注销监听
  - [ ] SubTask 2.4: 新建 `src/router/index.tsx`：5 条路由 `/overlay` `/pin` `/settings` `/history` `/text-translate`，均通过 `lazy(() => import('@/views/xxx'))` 懒加载（路由组件外层需 Suspense 包裹）
  - [ ] SubTask 2.5: 确认 `src/utils/tauri.ts` 与 `src/utils/logger.ts` 无需改动（仅验证类型可被 React 侧正常引用）；`src/globals.d.ts` 保留
  - [ ] SubTask 2.6: 删除 `src/main.ts`、`src/App.vue`；修改 `src/env.d.ts` 移除 vue shim 与 vue-router/vue-i18n 模块增强，保留 `vite/client` 引用（新增 `.tsx` 无需额外声明）
  - 验证：`pnpm dev` 能启动且各路由无编译错误；`__APP_VERSION__` 类型可用

- [x] Task 3: 状态管理迁移（Zustand）
  - [ ] SubTask 3.1: `src/stores/configStore.ts` → `create<ConfigState>()(...)`：state 为 config/loading/error/apiKey；actions 为 loadConfig（写 config，失败写 error 不抛出）、updateConfig（调用 saveConfig 后同步 state）、loadApiKey（get_api_key）、setApiKey（失败向上抛出）；保持与 pinia 版本一致的对外行为与类型
  - [ ] SubTask 3.2: `src/stores/pinStore.ts` → zustand：state 为 `pins: Map<string, PinState>`（更新时用新 Map 触发更新）；actions 为 addPin/removePin/getPin/updatePin（Object.assign 语义）；保留 `TranslatedBlock`/`PinState` 接口导出
  - [ ] SubTask 3.3: `src/stores/historyStore.ts` → zustand：state 为 historyList/loading/currentDetail；actions 为 loadHistory（getHistoryList(50)）、loadDetail、deleteHistory（成功后从列表移除并清空对应详情）、clearHistory、copyTranslation（writeClipboardText）；保留日志 TAG 与抛错语义
  - 验证：三个 store 的 TypeScript 类型检查通过、行为与 pinia 版本等价

- [x] Task 4: 公共组件迁移（含样式）
  - [ ] SubTask 4.1: `src/components/ControlBar.tsx`：props（translateStatus/showOriginal/hasTranslation/errorMessage/fromCache/ocrLoading/vertical）与 6 个回调事件等价迁移；按钮组按状态划分（idle/error 显示翻译+复制原文(OCR)；translating 禁用；done 显示复制原文/复制译文/重新翻译/显示原文或译文/缓存提示）；样式沿用原规则
  - [ ] SubTask 4.2: `src/components/ShortcutInput.tsx`：受控 value + onChange；录制状态（focus 进入、blur/全局点击/Esc 取消）；修饰键（Control/Alt/Shift/Meta）集合累加，至少一个修饰键 + 普通键（keyCodeMap 映射）组合；`buildShortcutString` 按 Ctrl/Alt/Shift/Win 顺序拼 `+`；`formatShortcut` 显示格式化（Ctrl/Alt/Shift/Win 映射与其它键大写）；录制动画点与样式沿用
  - [ ] SubTask 4.3: `src/components/HistoryItem.tsx`：entry 展示缩略图（base64 jpeg → data URI）或文件占位 SVG；点击行触发 detail、操作按钮（复制/删除，stopPropagation 防止冒泡）悬停显示；样式沿用
  - 验证：组件在 settings/history 页面渲染无误，快捷键输入与格式化行为与 vue 版一致

- [x] Task 5: OverlayView 迁移（含样式）
  - [ ] SubTask 5.1: Canvas 初始化（dpr 缩放全屏）与绘制：有截图绘制图片，否则半透明遮罩；框架线选中时用 `evenodd` clip 绘制暗色镂空蒙版 + 白色虚线框，禁止 clearRect 闪烁
  - [ ] SubTask 5.2: 拖拽状态用 ref/普通变量（非响应式），Canvas 与光标位置更新走 rAF；自定义白色十字光标（drop-shadow 轮廓，初始隐藏避免 (0,0) 残影）；尺寸提示低频 state 更新
  - [ ] SubTask 5.3: 事件：mousedown/mousemove/mouseup 框选（尺寸 <5px 忽略）；Esc 与右键关闭；挂载时轮询 `get_overlay_image`（100ms×50 次 + 最终补偿）加载全屏截图
  - [ ] SubTask 5.4: 框选完成：以 `WebviewWindow` 创建 `/pin` 窗口（透明/无装饰/置顶/位置含 PIN_PADDING=14 与控制栏 36 计算）；`capture_region_from_cache(物理像素)` → `store_pin_image(label)` → 销毁蒙版窗口；挂载/卸载清理键盘监听与 rAF
  - 验证：pnpm dev 下 `/overlay` 可绘制截图蒙版并完成框选建窗全流程

- [x] Task 6: PinView 迁移（含样式）
  - [ ] SubTask 6.1: 挂载读取窗口 label → `getPinImage` 轮询拉图（60×50ms）；Base64 处理（含 data URI 前缀剥离），图片加载后计算逻辑尺寸、设置图片区显式宽高、`imageLoaded=true` 后调整窗口
  - [ ] SubTask 6.2: 窗口几何：核心叠放区宽 `max(逻辑宽,160)`，控制栏宽 `90+8`，高含译文面板下限 150，外圈 `PIN_PADDING*2`；`setSize` 80ms 节流（含 pending 合并逻辑）；初始/翻译完成时防越界平移（currentMonitor 判断右边界）
  - [ ] SubTask 6.3: 边缘亮度自适应阴影：Canvas 采样四边（步长/深度按原实现），平均亮度 <0.45 用亮色辉光阴影，否则暗色阴影
  - [ ] SubTask 6.4: 译文面板：过滤空译文块渲染；翻译完成后面板按内容自适应高度（先取消显式高度再测 scrollHeight，兜底 120）；拉伸手柄调整高度并走节流窗口更新
  - [ ] SubTask 6.5: ControlBar 交互接线：translate/retranslate(`forceRetranslate=true`)/copyOriginal/ocrCopyOriginal(OCR 复制)/copyTranslation/toggleOriginal（切换后重新调整窗口）
  - [ ] SubTask 6.6: 拖拽移动（startDragging，排除按钮与手柄，位移>3px 判定）与双击图片关闭窗口
  - 验证：`/pin` 下贴图展示、翻译、面板拉伸、阴影自适应与窗口调整行为与 vue 版一致

- [x] Task 7: SettingsView 迁移（含样式）
  - [ ] SubTask 7.1: Naive UI → antd：ConfigProvider(darkAlgorithm)/Card/Form(horizontal + labelCol 100px)/Input/Input.Password/Select/Button(loading/type)/Switch/Progress/Typography.Text/Tooltip/Spin；message/modal 使用 antd `App.useApp()`（由入口 App 包裹）以跟随暗色主题
  - [ ] SubTask 7.2: 表单状态（扁平 formData，useState/单一对象）、provider 动态占位符（3 个提供商）、语言/提供商/目标语言/OCR 语言选项列表（i18n 标签）
  - [ ] SubTask 7.3: 初始化：并行 loadConfig/loadApiKey/getConfigPath/getLogDir/isAutoStartEnabled（后两个带 catch 兜底）→ populateForm（api_key 不填充）→ 置 initialized
  - [ ] SubTask 7.4: 界面语言即时生效并保存（configStore.updateConfig，成功后按错误字段提示）；其余字段 500ms 防抖自动保存（exclude language/api_key）
  - [ ] SubTask 7.5: API 密钥独立保存/删除按钮 + 系统密钥环读写 + "密钥已保存在密钥环"Tooltip；测试连接（校验 URL/模型/密钥按序提示）
  - [ ] SubTask 7.6: 开机自启动 Switch（enableAutoStart/disableAutoStart，失败回滚状态）；快捷键区（3 个 ShortcutInput + 恢复默认）；恢复默认按钮消息提示
  - [ ] SubTask 7.7: 自动更新：`check()`（开发模式禁用提示）→ `downloadAndInstall()` 进度（Started/Progress/Finished）→ 重启对话框（restartApp）；`Update` 对象用 ref/普通变量持有（不得深响应式包装）
  - [ ] SubTask 7.8: 配置/日志路径展示与"打开"（invoke `reveal_in_explorer`）；版本号 `__APP_VERSION__`
  - 验证：`/settings` 可加载、修改自动保存、语言即时切换、更新检查与密钥管理可用

- [x] Task 8: HistoryView 迁移（含样式）
  - [ ] SubTask 8.1: 列表区：加载状态 Spin、空状态（SVG + 文案）、HistoryItem 列表渲染
  - [ ] SubTask 8.2: 详情弹窗（antd Modal，maxWidth 520px）：缩略图（点击放大预览）/原文(带复制)/译文(带复制)/时间；footer 删除按钮（确认框）
  - [ ] SubTask 8.3: 图片放大预览弹窗（点击遮罩关闭）；复制/删除/清空全部交互（确认框 + message 反馈）；详情中的复制（原文/译文）与删除
  - [ ] SubTask 8.4: 挂载时 `loadHistory()`，失败 message 提示；样式沿用（隐藏滚动条、detail-text 等）
  - 验证：`/history` 列表加载、详情/预览/复制/删除/清空均正常

- [x] Task 9: TextTranslateView 迁移（含样式）
  - [ ] SubTask 9.1: 标题栏 `data-tauri-drag-region`（拖拽）与双击/按钮关闭；挂载读取 `getConfig` 设置默认目标语言并聚焦输入框；Esc 关闭与卸载清理
  - [ ] SubTask 9.2: 输入区与翻译按钮状态机（idle/translating/done/error）；Ctrl+Enter 与按钮触发（done/error 时走强制重译）；输入变化重置结果
  - [ ] SubTask 9.3: 译文面板：缓存命中提示、复制按钮（1.5s 复选反馈）、译文滚动区；错误提示条
  - [ ] SubTask 9.4: 目标语言下拉临时覆盖（不回写配置）；样式沿用
  - 验证：`/text-translate` 可输入、翻译、复制、快捷翻译与关闭

- [x] Task 10: 清理与构建验证
  - [ ] SubTask 10.1: 删除全部 `.vue` 文件（App.vue、views/*.vue、components/*.vue）与 `src/main.ts`
  - [ ] SubTask 10.2: 运行 `pnpm build`（等价 `tsc --noEmit && vite build`），修复所有类型错误与构建警告
  - [ ] SubTask 10.3: 启动 `pnpm dev` 冒烟：确认 Vite 启动无报错、`/settings` 可打开（如无法起 Tauri，则以 dev 访问 + 构建产物为准，并在结果中说明）
  - [ ] SubTask 10.4: 核对 `src-tauri/` 与 `src/utils/tauri.ts`、`src/utils/logger.ts` 无改动
  - 验证：构建通过、无遗留 vue 文件引用、无 vue 依赖残留
- [x] Task 11: 全量回归验证（对照清单检查）
  - [ ] SubTask 11.1: 逐项核对 checklist.md 中全部检查点，标记通过/未通过
  - [ ] SubTask 11.2: 对未通过项补充修复任务并复验

# Task Dependencies

- Task 1 无依赖，最先执行
- Task 2 依赖 Task 1（入口/路由/i18n 需要新依赖与构建配置）
- Task 3、4 依赖 Task 2（store 与公共组件基于基础框架）
- Task 5、6、7、8、9 依赖 Task 3、4（视图使用 store 与公共组件）
- Task 10 依赖 Task 5-9（需全部迁移完成后进行清理与最终构建）
- Task 11 依赖 Task 10

# 并行说明

- Task 3、4 可在 Task 2 后可并行
- Task 5-9 在 Task 3、4 完成后可并行（相互之间无状态依赖，窗口/命令访问独立）