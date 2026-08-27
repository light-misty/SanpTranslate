use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use crate::config::ShortcutConfig;
use crate::error::AppError;
use serde::{Deserialize, Serialize};

/// 快捷键注册状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutStatus {
    /// 快捷键名称（截图/剪贴板贴图/文本翻译）
    pub name: String,
    /// 快捷键字符串表示
    pub shortcut: String,
    /// 是否注册成功
    pub registered: bool,
    /// 是否被其他程序占用
    #[serde(rename = "occupied")]
    pub is_occupied: bool,
    /// 错误信息（如果有）
    pub error: Option<String>,
}

/// 所有快捷键的注册结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutRegistrationResult {
    /// 各快捷键状态列表
    pub statuses: Vec<ShortcutStatus>,
    /// 是否有任何快捷键注册失败
    pub has_failure: bool,
}

/// 当前已注册的快捷键（解析后的 Shortcut 对象），供全局处理器动态查询
pub struct CurrentShortcuts {
    pub capture: Shortcut,
    pub pin_clipboard: Shortcut,
    pub text_translate: Shortcut,
}

/// 统一处理全局快捷键事件（由 lib.rs 中注册的插件回调）
pub fn handle_shortcut_event(app: &tauri::AppHandle, shortcut: &Shortcut) {
    let shortcuts = match app.try_state::<Arc<Mutex<CurrentShortcuts>>>() {
        Some(s) => s,
        None => return,
    };

    let is_capture;
    let is_pin;
    let is_text_translate;
    {
        let current = match shortcuts.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        is_capture = shortcut == &current.capture;
        is_pin = shortcut == &current.pin_clipboard;
        is_text_translate = shortcut == &current.text_translate;
    }

    if is_capture {
        handle_capture_hotkey(app);
    } else if is_pin {
        handle_pin_clipboard_hotkey(app);
    } else if is_text_translate {
        handle_text_translate_hotkey(app);
    }
}

/// 注册全局快捷键（应用启动时调用）
/// 返回详细的注册结果，包含每个快捷键的占用状态
pub fn register_hotkeys(app: &tauri::AppHandle, config: &ShortcutConfig) -> Result<ShortcutRegistrationResult, AppError> {
    let capture_shortcut = parse_shortcut(&config.capture)?;
    let pin_clipboard_shortcut = parse_shortcut(&config.pin_clipboard)?;
    let text_translate_shortcut = parse_shortcut(&config.text_translate)?;

    // 使用 Arc<Mutex> 存储快捷键，闭包直接捕获 Arc 避免生命周期问题
    let shortcuts = Arc::new(Mutex::new(CurrentShortcuts {
        capture: capture_shortcut,
        pin_clipboard: pin_clipboard_shortcut,
        text_translate: text_translate_shortcut,
    }));

    // 存入应用状态，供 reregister_hotkeys 更新
    app.manage(shortcuts);

    // 辅助函数：注册单个快捷键，如果已注册则先注销再重试
    // 返回 Ok(ShortcutStatus) 包含注册结果和占用状态
    let register_one = |shortcut: Shortcut, name: &str, shortcut_str: &str| -> ShortcutStatus {
        match app.global_shortcut().register(shortcut) {
            Ok(()) => {
                log::info!("[HOTKEY] {} 快捷键注册成功", name);
                ShortcutStatus {
                    name: name.to_string(),
                    shortcut: shortcut_str.to_string(),
                    registered: true,
                    is_occupied: false,
                    error: None,
                }
            }
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("already registered") {
                    log::warn!("[HOTKEY] {} 快捷键已被注册（可能被其他程序占用），尝试注销后重试...", name);
                    // 只注销当前快捷键，避免影响其他已注册的快捷键
                    let _ = app.global_shortcut().unregister(shortcut);
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    // 重试注册
                    match app.global_shortcut().register(shortcut) {
                        Ok(()) => {
                            log::info!("[HOTKEY] {} 快捷键重新注册成功", name);
                            ShortcutStatus {
                                name: name.to_string(),
                                shortcut: shortcut_str.to_string(),
                                registered: true,
                                is_occupied: false,
                                error: None,
                            }
                        }
                        Err(e2) => {
                            log::error!("[HOTKEY] {} 快捷键注册失败: {}。该快捷键可能已被其他程序占用，请在设置中更换快捷键。", name, e2);
                            ShortcutStatus {
                                name: name.to_string(),
                                shortcut: shortcut_str.to_string(),
                                registered: false,
                                is_occupied: true,
                                error: Some(format!("快捷键被占用: {}", e2)),
                            }
                        }
                    }
                } else {
                    #[cfg(target_os = "macos")]
                    log::warn!(
                        "[PERMISSION] 快捷键注册失败需要辅助功能权限 (macOS）。\
                         请前往 系统设置 > 隐私与安全性 > 辅助功能 添加本应用"
                    );
                    ShortcutStatus {
                        name: name.to_string(),
                        shortcut: shortcut_str.to_string(),
                        registered: false,
                        is_occupied: false,
                        error: Some(format!("注册失败: {}", e)),
                    }
                }
            }
        }
    };

    let capture_status = register_one(capture_shortcut, "截图", &config.capture);
    let pin_status = register_one(pin_clipboard_shortcut, "剪贴板贴图", &config.pin_clipboard);
    let text_status = register_one(text_translate_shortcut, "文本翻译", &config.text_translate);

    let has_failure = !capture_status.registered || !pin_status.registered || !text_status.registered;

    if has_failure {
        let failed: Vec<&str> = [&capture_status, &pin_status, &text_status]
            .iter()
            .filter(|s| !s.registered)
            .map(|s| s.name.as_str())
            .collect();
        log::warn!("[HOTKEY] 以下快捷键注册失败（可能已被其他程序占用）: {}。用户可在设置页面重新配置。", failed.join(", "));
    }

    log::info!(
        "[HOTKEY] 快捷键注册完成: 截图={}, 剪贴板贴图={}, 文本翻译={}",
        config.capture,
        config.pin_clipboard,
        config.text_translate
    );

    Ok(ShortcutRegistrationResult {
        statuses: vec![capture_status, pin_status, text_status],
        has_failure,
    })
}

/// 重新注册快捷键（配置变更后调用）
/// override_mode 为 true 时，会多次尝试强制注册快捷键
pub fn reregister_hotkeys(app: &tauri::AppHandle, new_config: &ShortcutConfig) -> Result<ShortcutRegistrationResult, AppError> {
    let new_capture = parse_shortcut(&new_config.capture)?;
    let new_pin = parse_shortcut(&new_config.pin_clipboard)?;
    let new_text_translate = parse_shortcut(&new_config.text_translate)?;

    // 注销所有已注册的快捷键
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| AppError::ConfigError(format!("注销快捷键失败: {}", e)))?;

    // 注册单个快捷键的辅助函数，带重试逻辑
    let register_with_retry = |shortcut: Shortcut, name: &str, shortcut_str: &str| -> ShortcutStatus {
        // 首次尝试注册
        match app.global_shortcut().register(shortcut) {
            Ok(()) => {
                return ShortcutStatus {
                    name: name.to_string(),
                    shortcut: shortcut_str.to_string(),
                    registered: true,
                    is_occupied: false,
                    error: None,
                };
            }
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("already registered") {
                    log::warn!("[HOTKEY] {} 快捷键已被占用，尝试注销后重试...", name);
                } else {
                    log::error!("[HOTKEY] {} 快捷键注册失败: {}", name, e);
                    return ShortcutStatus {
                        name: name.to_string(),
                        shortcut: shortcut_str.to_string(),
                        registered: false,
                        is_occupied: err_str.contains("already registered"),
                        error: Some(format!("注册失败: {}", e)),
                    };
                }
            }
        }

        // 重试：只注销当前快捷键后再次尝试
        for attempt in 1..=3 {
            let _ = app.global_shortcut().unregister(shortcut);
            std::thread::sleep(std::time::Duration::from_millis(200));
            match app.global_shortcut().register(shortcut) {
                Ok(()) => {
                    log::info!("[HOTKEY] {} 快捷键第 {} 次重试注册成功", name, attempt);
                    return ShortcutStatus {
                        name: name.to_string(),
                        shortcut: shortcut_str.to_string(),
                        registered: true,
                        is_occupied: false,
                        error: None,
                    };
                }
                Err(_) => {
                    log::warn!("[HOTKEY] {} 快捷键第 {} 次重试失败", name, attempt);
                }
            }
        }

        // 所有重试失败
        ShortcutStatus {
            name: name.to_string(),
            shortcut: shortcut_str.to_string(),
            registered: false,
            is_occupied: true,
            error: Some("快捷键被其他程序占用".to_string()),
        }
    };

    // 依次注册三个快捷键
    let capture_status = register_with_retry(new_capture, "截图", &new_config.capture);
    let pin_status = register_with_retry(new_pin, "剪贴板贴图", &new_config.pin_clipboard);
    let text_status = register_with_retry(new_text_translate, "文本翻译", &new_config.text_translate);

    // 通过 Arc 更新状态中的快捷键，使处理器能匹配新的快捷键
    let shortcuts = app.state::<Arc<Mutex<CurrentShortcuts>>>();
    let mut current = shortcuts
        .lock()
        .map_err(|e| AppError::ConfigError(format!("锁定快捷键状态失败: {}", e)))?;
    current.capture = new_capture;
    current.pin_clipboard = new_pin;
    current.text_translate = new_text_translate;

    let has_failure = !capture_status.registered || !pin_status.registered || !text_status.registered;

    log::info!(
        "[HOTKEY] 快捷键已更新: 截图={}, 剪贴板贴图={}, 文本翻译={}, 有失败={}",
        new_config.capture,
        new_config.pin_clipboard,
        new_config.text_translate,
        has_failure
    );

    Ok(ShortcutRegistrationResult {
        statuses: vec![capture_status, pin_status, text_status],
        has_failure,
    })
}

/// 截屏流程（托盘菜单点击触发）：延迟 250ms 等待托盘菜单从屏幕上消失后再截图
/// 快捷键触发时直接使用 handle_capture_hotkey，无需此延迟
pub fn handle_capture_flow(app: &tauri::AppHandle) -> Result<(), AppError> {
    // Windows: 立即创建蒙版窗口，让用户感知蒙版已响应
    // content_protected 防止截图时捕获蒙版窗口
    #[cfg(target_os = "windows")]
    if let Err(e) = crate::window::create_overlay_window_lazy(app) {
        log::error!("[HOTKEY] 创建 overlay 窗口失败: {}", e);
    }

    let app_clone = app.clone();
    std::thread::spawn(move || {
        // 等待托盘菜单弹出框完全从屏幕消失（系统菜单关闭动画 + 合成器刷新）
        std::thread::sleep(std::time::Duration::from_millis(250));

        let result = (|| -> Result<(), crate::error::AppError> {
            let monitor = app_clone
                .primary_monitor()
                .ok()
                .flatten()
                .ok_or_else(|| crate::error::AppError::ConfigError("获取主显示器信息失败".to_string()))?;
            let scale_factor = monitor.scale_factor();
            let monitor_x = (monitor.position().x as f64 * scale_factor).round() as i32;
            let monitor_y = (monitor.position().y as f64 * scale_factor).round() as i32;

            // 捕获原始像素（托盘菜单已消失）
            let rgba_image = {
                let state = app_clone.state::<std::sync::Mutex<crate::capture::CaptureService>>();
                let locked = state.lock().map_err(|e| {
                    crate::error::AppError::ConfigError(format!("锁定截图服务失败: {}", e))
                })?;
                locked.capture_fullscreen_raw(None)?
            };

            // 存储原始像素到缓存
            {
                let store = app_clone.state::<std::sync::Mutex<crate::window::CachedScreenStore>>();
                let mut store = store.lock().map_err(|e| {
                    crate::error::AppError::ConfigError(format!("锁定缓存失败: {}", e))
                })?;
                store.screen = Some(crate::window::CachedScreen {
                    image: rgba_image.clone(),
                    monitor_x,
                    monitor_y,
                    scale_factor,
                    tauri_monitor_width: monitor.size().width,
                    tauri_monitor_height: monitor.size().height,
                });
            }

            // Linux/macOS: 截图完成后切回主线程创建蒙版窗口（GTK 窗口必须在主线程创建）
            #[cfg(not(target_os = "windows"))]
            {
                let app_main = app_clone.clone();
                app_clone.run_on_main_thread(move || {
                    if let Err(e) = crate::window::create_overlay_window_lazy(&app_main) {
                        log::error!("[HOTKEY] 创建 overlay 窗口失败: {}", e);
                    } else {
                        log::info!("[HOTKEY] overlay 窗口创建成功（屏幕数据已就绪，后台编码截图中...）");
                    }
                }).ok();
            }

            // 后台编码 JPEG（用于蒙版背景显示）
            let app_jpeg = app_clone.clone();
            std::thread::spawn(move || {
                let result = (|| -> Result<(), crate::error::AppError> {
                    let dynamic_image = image::DynamicImage::ImageRgba8(rgba_image);
                    let jpeg_base64 = crate::capture::encode_to_base64_jpeg(&dynamic_image, 50)?;
                    let store = app_jpeg.state::<std::sync::Mutex<crate::window::CachedScreenStore>>();
                    let mut store = store.lock().map_err(|e| {
                        crate::error::AppError::ConfigError(format!("锁定缓存失败: {}", e))
                    })?;
                    store.overlay_image = Some(crate::window::OverlayImageData {
                        data: jpeg_base64,
                        mime: "image/jpeg".to_string(),
                    });
                    log::info!("[HOTKEY] 后台 JPEG 编码完成，蒙版背景数据已就绪");
                    Ok(())
                })();
                if let Err(e) = result {
                    log::error!("[HOTKEY] 后台 JPEG 编码失败: {}", e);
                }
            });

            Ok(())
        })();

        if let Err(e) = result {
            log::error!("[HOTKEY] 截图流程处理失败: {}", e);
            // Windows: 截图失败时销毁已创建的蒙版窗口
            #[cfg(target_os = "windows")]
            if let Some(window) = app_clone.get_webview_window("overlay") {
                let _ = window.destroy();
            }
        }
    });

    Ok(())
}

fn handle_capture_hotkey(app: &tauri::AppHandle) {
    log::info!("[HOTKEY] 截图快捷键触发");

    // Windows: 立即创建蒙版窗口，让用户感知蒙版已响应
    // content_protected 防止截图时捕获蒙版窗口
    #[cfg(target_os = "windows")]
    if let Err(e) = crate::window::create_overlay_window_lazy(app) {
        log::error!("[HOTKEY] 创建 overlay 窗口失败: {}", e);
        return;
    }

    // 将耗时的 xcap 截图操作放到后台线程，快捷键回调立即返回
    // xcap::Monitor::capture_image() 在 Linux X11 下可能耗时 200-600ms
    let app_clone = app.clone();
    std::thread::spawn(move || {
        // --- 后台线程：执行阻塞截图 ---
        let result = (|| -> Result<(), crate::error::AppError> {
            let monitor = app_clone
                .primary_monitor()
                .ok()
                .flatten()
                .ok_or_else(|| crate::error::AppError::ConfigError("获取主显示器信息失败".to_string()))?;
            let scale_factor = monitor.scale_factor();
            let monitor_x = (monitor.position().x as f64 * scale_factor).round() as i32;
            let monitor_y = (monitor.position().y as f64 * scale_factor).round() as i32;

            // 阻塞截图（耗时操作，在后台线程中执行）
            let rgba_image = {
                let state = app_clone.state::<std::sync::Mutex<crate::capture::CaptureService>>();
                let locked = state.lock().map_err(|e| {
                    crate::error::AppError::ConfigError(format!("锁定截图服务失败: {}", e))
                })?;
                locked.capture_fullscreen_raw(None)?
            };

            // 将原始像素存入缓存
            {
                let store = app_clone.state::<std::sync::Mutex<crate::window::CachedScreenStore>>();
                let mut store = store.lock().map_err(|e| {
                    crate::error::AppError::ConfigError(format!("锁定缓存失败: {}", e))
                })?;
                store.screen = Some(crate::window::CachedScreen {
                    image: rgba_image.clone(),
                    monitor_x,
                    monitor_y,
                    scale_factor,
                    tauri_monitor_width: monitor.size().width,
                    tauri_monitor_height: monitor.size().height,
                });
            }

            // Linux/macOS: 截图完成后切回主线程创建蒙版窗口（GTK 窗口必须在主线程创建）
            #[cfg(not(target_os = "windows"))]
            {
                let app_main = app_clone.clone();
                app_clone.run_on_main_thread(move || {
                    if let Err(e) = crate::window::create_overlay_window_lazy(&app_main) {
                        log::error!("[HOTKEY] 创建 overlay 窗口失败: {}", e);
                    } else {
                        log::info!("[HOTKEY] overlay 窗口已创建（截图数据已就绪）");
                    }
                }).ok();
            }

            // 后台编码 JPEG（用于蒙版背景显示）
            let app_jpeg = app_clone.clone();
            std::thread::spawn(move || {
                let result = (|| -> Result<(), crate::error::AppError> {
                    let dynamic_image = image::DynamicImage::ImageRgba8(rgba_image);
                    let jpeg_base64 = crate::capture::encode_to_base64_jpeg(&dynamic_image, 50)?;
                    let store = app_jpeg.state::<std::sync::Mutex<crate::window::CachedScreenStore>>();
                    let mut store = store.lock().map_err(|e| {
                        crate::error::AppError::ConfigError(format!("锁定缓存失败: {}", e))
                    })?;
                    store.overlay_image = Some(crate::window::OverlayImageData {
                        data: jpeg_base64,
                        mime: "image/jpeg".to_string(),
                    });
                    log::info!("[HOTKEY] 后台 JPEG 编码完成");
                    Ok(())
                })();
                if let Err(e) = result {
                    log::error!("[HOTKEY] 后台 JPEG 编码失败: {}", e);
                }
            });

            Ok(())
        })();

        if let Err(e) = result {
            log::error!("[HOTKEY] 截图快捷键处理失败: {}", e);
            // Windows: 截图失败时销毁已创建的蒙版窗口
            #[cfg(target_os = "windows")]
            if let Some(window) = app_clone.get_webview_window("overlay") {
                let _ = window.destroy();
            }
        }
    });
}

fn handle_pin_clipboard_hotkey(app: &tauri::AppHandle) {
    log::info!("[HOTKEY] 剪贴板贴图快捷键触发");

    let result = (|| -> Result<(), AppError> {
        // 优先从后台监控缓存中获取最近的图片（即使当前剪贴板已被文本覆盖）
        let image_data = {
            let cache = app.state::<crate::clipboard::ClipboardImageCache>();
            match cache.get() {
                Some(data) => {
                    log::info!("[HOTKEY] 使用剪贴板图片缓存");
                    data
                }
                None => {
                    // 缓存中没有图片，回退到直接读取当前剪贴板
                    match crate::clipboard::read_clipboard_image(app)? {
                        Some(data) => data,
                        None => {
                            log::info!("[HOTKEY] 剪贴板无图像，跳过");
                            return Ok(());
                        }
                    }
                }
            }
        };

        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&image_data)
            .map_err(|e| AppError::ClipboardError(format!("Base64 解码失败: {}", e)))?;
        let img = image::load_from_memory(&bytes)
            .map_err(|e| AppError::ClipboardError(format!("图像解码失败: {}", e)))?;
        let (img_w, img_h) = (img.width(), img.height());

        let (mon_x, mon_y, mon_w, mon_h) = {
            let state = app.state::<std::sync::Mutex<crate::capture::CaptureService>>();
            let locked = state.lock().map_err(|e| {
                AppError::ConfigError(format!("锁定截图服务失败: {}", e))
            })?;
            locked.get_primary_monitor_info()?
        };

        let x = mon_x + ((mon_w - img_w) as i32) / 2;
        let y = mon_y + ((mon_h - img_h) as i32) / 2;

        crate::window::create_pin_window(app, &image_data, x, y, img_w, img_h)?;
        Ok(())
    })();

    if let Err(e) = result {
        log::error!("[HOTKEY] 剪贴板贴图快捷键处理失败: {}", e);
    }
}

/// 文本翻译快捷键处理：创建文本翻译窗口
fn handle_text_translate_hotkey(app: &tauri::AppHandle) {
    log::info!("[HOTKEY] 文本翻译快捷键触发");

    if let Err(e) = crate::window::create_text_translate_window(app) {
        log::error!("[HOTKEY] 创建文本翻译窗口失败: {}", e);
    }
}

/// 解析快捷键字符串（公共函数，供测试可用性使用）
pub fn parse_shortcut_for_test(shortcut_str: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = shortcut_str.split('+').collect();

    let mut modifiers = Modifiers::empty();
    let mut key_code = None;

    for part in parts {
        let trimmed = part.trim();
        match trimmed.to_lowercase().as_str() {
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "shift" => modifiers |= Modifiers::SHIFT,
            "alt" => modifiers |= Modifiers::ALT,
            "super" | "win" | "meta" => modifiers |= Modifiers::SUPER,
            _ => {
                key_code = parse_key_code(trimmed).ok();
            }
        }
    }

    let key = key_code?;
    Some(Shortcut::new(Some(modifiers), key))
}

fn parse_shortcut(shortcut_str: &str) -> Result<Shortcut, AppError> {
    let parts: Vec<&str> = shortcut_str.split('+').collect();

    let mut modifiers = Modifiers::empty();
    let mut key_code = None;

    for part in parts {
        let trimmed = part.trim();
        match trimmed.to_lowercase().as_str() {
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "shift" => modifiers |= Modifiers::SHIFT,
            "alt" => modifiers |= Modifiers::ALT,
            "super" | "win" | "meta" => modifiers |= Modifiers::SUPER,
            _ => {
                key_code = Some(parse_key_code(trimmed)?);
            }
        }
    }

    let key = key_code.ok_or_else(|| {
        AppError::ConfigError(format!("快捷键缺少按键: {}", shortcut_str))
    })?;

    Ok(Shortcut::new(Some(modifiers), key))
}

fn parse_key_code(key: &str) -> Result<Code, AppError> {
    if key.len() > 1 {
        let lower = key.to_lowercase();
        if let Some(stripped) = lower.strip_prefix('f') {
            let num: u32 = stripped
                .parse()
                .map_err(|_| AppError::ConfigError(format!("无效的功能键: {}", key)))?;
            return match num {
                1 => Ok(Code::F1),
                2 => Ok(Code::F2),
                3 => Ok(Code::F3),
                4 => Ok(Code::F4),
                5 => Ok(Code::F5),
                6 => Ok(Code::F6),
                7 => Ok(Code::F7),
                8 => Ok(Code::F8),
                9 => Ok(Code::F9),
                10 => Ok(Code::F10),
                11 => Ok(Code::F11),
                12 => Ok(Code::F12),
                _ => Err(AppError::ConfigError(format!(
                    "不支持的功能键编号: {}",
                    num
                ))),
            };
        }
    }

    if key.len() == 1 {
        let c = key.chars().next().unwrap();
        if c.is_ascii_alphabetic() {
            return Ok(match c.to_ascii_uppercase() {
                'A' => Code::KeyA,
                'B' => Code::KeyB,
                'C' => Code::KeyC,
                'D' => Code::KeyD,
                'E' => Code::KeyE,
                'F' => Code::KeyF,
                'G' => Code::KeyG,
                'H' => Code::KeyH,
                'I' => Code::KeyI,
                'J' => Code::KeyJ,
                'K' => Code::KeyK,
                'L' => Code::KeyL,
                'M' => Code::KeyM,
                'N' => Code::KeyN,
                'O' => Code::KeyO,
                'P' => Code::KeyP,
                'Q' => Code::KeyQ,
                'R' => Code::KeyR,
                'S' => Code::KeyS,
                'T' => Code::KeyT,
                'U' => Code::KeyU,
                'V' => Code::KeyV,
                'W' => Code::KeyW,
                'X' => Code::KeyX,
                'Y' => Code::KeyY,
                'Z' => Code::KeyZ,
                _ => unreachable!(),
            });
        }
        if c.is_ascii_digit() {
            return Ok(match c {
                '0' => Code::Digit0,
                '1' => Code::Digit1,
                '2' => Code::Digit2,
                '3' => Code::Digit3,
                '4' => Code::Digit4,
                '5' => Code::Digit5,
                '6' => Code::Digit6,
                '7' => Code::Digit7,
                '8' => Code::Digit8,
                '9' => Code::Digit9,
                _ => unreachable!(),
            });
        }
    }

    Err(AppError::ConfigError(format!(
        "不支持的按键: {}",
        key
    )))
}
