use crate::config::ShortcutConfig;
use crate::config::resolve_language;
use crate::error::AppError;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIcon;
use tauri::AppHandle;
use tauri::Emitter;

/// 托盘图标状态，用于后续更新菜单
pub struct TrayState {
    pub tray: Option<TrayIcon>,
}

impl Default for TrayState {
    fn default() -> Self {
        TrayState { tray: None }
    }
}

/// 托盘菜单的多语言文本
struct TrayText {
    capture_translate: String,
    pin_clipboard: String,
    text_translate: String,
    quick_fill: String,
    history: String,
    settings: String,
    restart: String,
    quit: String,
}

/// 根据语言代码获取托盘菜单文本
fn get_tray_text(language: &str, shortcuts: &ShortcutConfig) -> TrayText {
    let effective_lang = resolve_language(language);
    let is_zh = effective_lang == "zh-CN";

    if is_zh {
        TrayText {
            capture_translate: format!("框选截图翻译  {}", shortcuts.capture),
            pin_clipboard: format!("从剪贴板贴图  {}", shortcuts.pin_clipboard),
            text_translate: format!("文本翻译  {}", shortcuts.text_translate),
            quick_fill: "快捷文本填充".to_string(),
            history: "截图与翻译历史".to_string(),
            settings: "设置".to_string(),
            restart: "重新启动".to_string(),
            quit: "退出".to_string(),
        }
    } else {
        TrayText {
            capture_translate: format!("Capture & Translate  {}", shortcuts.capture),
            pin_clipboard: format!("Pin from Clipboard  {}", shortcuts.pin_clipboard),
            text_translate: format!("Text Translate  {}", shortcuts.text_translate),
            quick_fill: "Quick Text Fill".to_string(),
            history: "Translation History".to_string(),
            settings: "Settings".to_string(),
            restart: "Restart".to_string(),
            quit: "Quit".to_string(),
        }
    }
}

/// 构建托盘菜单（不含事件处理）
fn build_tray_menu(app: &AppHandle, text: &TrayText) -> Result<Menu<tauri::Wry>, AppError> {
    let capture_item = MenuItem::with_id(
        app,
        "capture",
        &text.capture_translate,
        true,
        None::<&str>,
    )?;
    let pin_clipboard_item = MenuItem::with_id(
        app,
        "pin_clipboard",
        &text.pin_clipboard,
        true,
        None::<&str>,
    )?;
    let text_translate_item = MenuItem::with_id(
        app,
        "text_translate",
        &text.text_translate,
        true,
        None::<&str>,
    )?;
    let quick_fill_item = MenuItem::with_id(
        app,
        "quick_fill",
        &text.quick_fill,
        true,
        None::<&str>,
    )?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let history_item = MenuItem::with_id(app, "history", &text.history, true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let settings_item = MenuItem::with_id(app, "settings", &text.settings, true, None::<&str>)?;
    // 开发模式下禁用重启菜单项
    let restart_item = MenuItem::with_id(
        app,
        "restart",
        &text.restart,
        !cfg!(debug_assertions),
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", &text.quit, true, None::<&str>)?;

    Ok(Menu::with_items(
        app,
        &[
            &capture_item,
            &pin_clipboard_item,
            &text_translate_item,
            &quick_fill_item,
            &separator1,
            &history_item,
            &separator2,
            &settings_item,
            &restart_item,
            &quit_item,
        ],
    )?)
}

/// 创建系统托盘图标及菜单
pub fn create_tray(app: &AppHandle, shortcuts: &ShortcutConfig, language: &str) -> Result<(), AppError> {
    let text = get_tray_text(language, shortcuts);
    let menu = build_tray_menu(app, &text)?;

    // 获取 tauri.conf.json 中配置的默认托盘图标（ID 为 "main"），避免创建第二个图标
    let tray = app.tray_by_id("main").ok_or_else(|| {
        AppError::ConfigError("找不到默认托盘图标".to_string())
    })?;

    // 设置托盘菜单
    tray.set_menu(Some(menu)).map_err(|e| {
        AppError::ConfigError(format!("设置托盘菜单失败: {}", e))
    })?;

    // 设置左键点击行为
    tray.set_show_menu_on_left_click(cfg!(target_os = "macos")).map_err(|e| {
        AppError::ConfigError(format!("设置托盘左键点击行为失败: {}", e))
    })?;

    tray.on_menu_event(|app, event| match event.id.as_ref() {
        "capture" => {
            match crate::hotkey::handle_capture_flow(app) {
                Ok(_) => {}
                Err(e) => log::error!("截图失败: {}", e),
            }
        }
        "pin_clipboard" => {
            match (|| -> Result<(), AppError> {
                use base64::Engine;
                use base64::engine::general_purpose::STANDARD;

                let image_data = match crate::clipboard::read_clipboard_image(app)? {
                    Some(data) => data,
                    None => return Ok(()),
                };

                let bytes = STANDARD.decode(&image_data)
                    .map_err(|e| AppError::ClipboardError(format!("Base64 解码失败: {}", e)))?;
                let img = image::load_from_memory(&bytes)
                    .map_err(|e| AppError::ClipboardError(format!("图像解码失败: {}", e)))?;
                let (img_w, img_h) = (img.width(), img.height());

                let (mon_x, mon_y, mon_w, mon_h) = {
                    let state = app.state::<std::sync::Mutex<crate::capture::CaptureService>>();
                    let locked = state.lock().map_err(|e| AppError::ConfigError(format!("锁定截图服务失败: {}", e)))?;
                    locked.get_primary_monitor_info()?
                };

                let center_x = mon_x + ((mon_w - img_w) as i32) / 2;
                let center_y = mon_y + ((mon_h - img_h) as i32) / 2;

                crate::window::create_pin_window(app, &image_data, center_x, center_y, img_w, img_h)?;
                Ok(())
            })() {
                Ok(_) => {}
                Err(e) => log::error!("剪贴板贴图失败: {}", e),
            }
        }
        "text_translate" => {
            if let Err(e) = crate::window::create_text_translate_window(app) {
                log::error!("创建文本翻译窗口失败: {}", e);
            }
        }
        "quick_fill" => {
            if let Err(e) = crate::window::create_quick_fill_window(app) {
                log::error!("创建快捷填充配置窗口失败: {}", e);
            }
        }
        "history" => {
            if let Err(e) = crate::window::create_history_window(app) {
                log::error!("创建历史窗口失败: {}", e);
            }
        }
        "settings" => {
            if let Err(e) = crate::window::create_settings_window(app) {
                log::error!("创建设置窗口失败: {}", e);
            }
        }
        "restart" => {
            #[cfg(debug_assertions)]
            {
                log::warn!("开发模式下不支持重启功能，请手动重启开发服务器");
            }
            #[cfg(not(debug_assertions))]
            {
                app.restart();
            }
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    });

    // 将 TrayIcon 存储到状态中，以便后续更新菜单
    let state = app.state::<std::sync::Mutex<TrayState>>();
    let mut tray_state = state.lock().map_err(|e| {
        AppError::ConfigError(format!("锁定 TrayState 失败: {}", e))
    })?;
    *tray_state = TrayState { tray: Some(tray) };

    Ok(())
}

/// 更新托盘菜单的语言（配置保存后调用）
pub fn update_tray_menu(app: &AppHandle, shortcuts: &ShortcutConfig, language: &str) -> Result<(), AppError> {
    let state = app.state::<std::sync::Mutex<TrayState>>();
    let tray_state = state.lock().map_err(|e| {
        AppError::ConfigError(format!("锁定 TrayState 失败: {}", e))
    })?;

    if let Some(tray) = tray_state.tray.as_ref() {
        let text = get_tray_text(language, shortcuts);
        let menu = build_tray_menu(app, &text)?;
        tray.set_menu(Some(menu)).map_err(|e| {
            AppError::ConfigError(format!("更新托盘菜单失败: {}", e))
        })?;
    }

    Ok(())
}

/// 通知所有窗口语言已变更
pub fn emit_language_changed(app: &AppHandle, language: &str) {
    let effective_lang = resolve_language(language);
    if let Err(e) = app.emit("language-changed", &effective_lang) {
        log::error!("广播语言变更事件失败: {}", e);
    }
}
