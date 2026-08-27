use crate::config::resolve_language;
use crate::error::AppError;
use image::RgbaImage;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

#[derive(Default)]
pub struct PinImageStore {
    pub images: HashMap<String, String>,
}

/// 缓存的全屏截图数据，用于区域裁剪
pub struct CachedScreen {
    /// 全屏截图的原始像素数据
    pub image: RgbaImage,
    /// 显示器 X 偏移（物理像素）
    pub monitor_x: i32,
    /// 显示器 Y 偏移（物理像素）
    pub monitor_y: i32,
    /// 显示器缩放因子
    pub scale_factor: f64,
    /// 捕获时 Tauri 报告的显示器物理宽度
    pub tauri_monitor_width: u32,
    /// 捕获时 Tauri 报告的显示器物理高度
    pub tauri_monitor_height: u32,
}

/// 缓存截图存储
#[derive(Default)]
pub struct CachedScreenStore {
    pub screen: Option<CachedScreen>,
    /// 蒙版窗口图像数据，供前端主动拉取
    pub overlay_image: Option<OverlayImageData>,
}

/// 区域裁剪结果，返回给前端用于创建贴图窗口
#[derive(serde::Serialize)]
pub struct CropResult {
    /// Base64 编码的 PNG 图像数据
    pub base64_data: String,
    /// 贴图窗口 X 位置（逻辑像素）
    pub x: f64,
    /// 贴图窗口 Y 位置（逻辑像素）
    pub y: f64,
    /// 贴图窗口宽度（逻辑像素，含内边距）
    pub width: f64,
    /// 贴图窗口高度（逻辑像素，含内边距和控制栏）
    pub height: f64,
    /// 裁剪区域的物理像素宽度
    pub crop_width: u32,
    /// 裁剪区域的物理像素高度
    pub crop_height: u32,
}

/// 蒙版窗口图像数据（用于事件传输）
#[derive(Clone, serde::Serialize)]
pub struct OverlayImageData {
    /// Base64 编码的图像数据
    pub data: String,
    /// MIME 类型（如 "image/jpeg"）
    pub mime: String,
}

#[derive(serde::Serialize)]
struct PinWindowInfo {
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn create_settings_window(app: &AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    // 读取配置以确定界面语言
    let language = get_config_language(app);
    let is_zh = resolve_language(&language) == "zh-CN";
    let title = if is_zh { "SnapTranslate - 设置" } else { "SnapTranslate - Settings" };

    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("/settings".into()))
        .title(title)
        .inner_size(500.0, 600.0)
        .center()
        .resizable(true)
        .build()
        .map_err(|e| AppError::ConfigError(format!("创建设置窗口失败: {}", e)))?;

    Ok(())
}

pub fn create_history_window(app: &AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("history") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    // 读取配置以确定界面语言
    let language = get_config_language(app);
    let is_zh = resolve_language(&language) == "zh-CN";
    let title = if is_zh { "SnapTranslate - 历史记录" } else { "SnapTranslate - History" };

    WebviewWindowBuilder::new(app, "history", WebviewUrl::App("/history".into()))
        .title(title)
        .inner_size(600.0, 500.0)
        .center()
        .resizable(true)
        .build()
        .map_err(|e| AppError::ConfigError(format!("创建历史记录窗口失败: {}", e)))?;

    Ok(())
}

/// 创建文本翻译窗口（单例模式，屏幕下方居中）
pub fn create_text_translate_window(app: &AppHandle) -> Result<(), AppError> {
    // 单例模式：如果已存在则聚焦
    if let Some(window) = app.get_webview_window("text-translate") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    // 读取配置以确定界面语言
    let language = get_config_language(app);
    let is_zh = resolve_language(&language) == "zh-CN";

    let monitor = app.primary_monitor()
        .ok()
        .flatten()
        .ok_or_else(|| {
            #[cfg(target_os = "linux")]
            log::warn!(
                "[WAYLAND] 无法获取主显示器信息。\
                 Wayland 可能未正确暴露显示器信息，请尝试使用 XWayland 或 X11 会话"
            );
            AppError::ConfigError("获取主显示器信息失败".to_string())
        })?;

    let scale_factor = monitor.scale_factor();
    let monitor_w = monitor.size().width as f64 / scale_factor;
    let monitor_h = monitor.size().height as f64 / scale_factor;
    let monitor_x = monitor.position().x as f64 / scale_factor;
    let monitor_y = monitor.position().y as f64 / scale_factor;

    // 窗口尺寸
    let window_w = 600.0;
    let window_h = 400.0;

    // 屏幕下方居中
    let x = monitor_x + (monitor_w - window_w) / 2.0;
    let y = monitor_y + monitor_h - window_h - 80.0;

    let title = if is_zh { "SnapTranslate - 文本翻译" } else { "SnapTranslate - Text Translate" };

    let _window = {
        let builder = WebviewWindowBuilder::new(app, "text-translate", WebviewUrl::App("/text-translate".into()))
            .title(title)
            .decorations(false)
            .always_on_top(true);
        #[cfg(not(target_os = "macos"))]
        let builder = builder.transparent(true);
        builder
            .shadow(false)
            .focusable(true)
            .resizable(false)
            .skip_taskbar(true)
            .position(x, y)
            .inner_size(window_w, window_h)
            .build()
            .map_err(|e| AppError::ConfigError(format!("创建文本翻译窗口失败: {}", e)))?
    };

    Ok(())
}

/// 创建蒙版窗口并存储图像数据（旧流程，兼容外部调用）
#[allow(dead_code)]
pub fn create_overlay_window(app: &AppHandle, image_data: &OverlayImageData) -> Result<(), AppError> {
    {
        let store = app.state::<Mutex<CachedScreenStore>>();
        let mut store = store.lock().map_err(|e| {
            AppError::ConfigError(format!("锁定缓存失败: {}", e))
        })?;
        store.overlay_image = Some(image_data.clone());
    }

    create_overlay_window_inner(app)
}

/// 创建蒙版窗口但不设置图像数据（异步加载截图）
pub fn create_overlay_window_lazy(app: &AppHandle) -> Result<(), AppError> {
    // 清除旧的蒙版图像数据
    {
        let store = app.state::<Mutex<CachedScreenStore>>();
        let mut store = store.lock().map_err(|e| {
            AppError::ConfigError(format!("锁定缓存失败: {}", e))
        })?;
        store.overlay_image = None;
        // Windows: 蒙版窗口在截图前创建，需清除旧截图缓存防止使用过期数据
        // Linux/macOS: 蒙版窗口在截图后创建，不能在此清除截图缓存（否则会清掉刚存入的数据）
        #[cfg(target_os = "windows")]
        {
            store.screen = None;
        }
    }

    create_overlay_window_inner(app)
}

/// 创建蒙版窗口的公共逻辑（不处理图像数据）
fn create_overlay_window_inner(app: &AppHandle) -> Result<(), AppError> {
    if let Some(existing) = app.get_webview_window("overlay") {
        match existing.destroy() {
            Ok(_) => log::info!("[OVERLAY] 旧 overlay 窗口销毁成功"),
            Err(e) => log::error!("[OVERLAY] 旧 overlay 窗口销毁失败: {}", e),
        }
    }

    let monitor = app.primary_monitor()
        .ok()
        .flatten()
        .ok_or_else(|| {
            #[cfg(target_os = "linux")]
            log::warn!(
                "[WAYLAND] 无法获取主显示器信息。\
                 Wayland 下透明蒙版窗口可能无法正常渲染，请尝试使用 X11 会话"
            );
            AppError::ConfigError("获取主显示器信息失败".to_string())
        })?;

    let scale_factor = monitor.scale_factor();
    let monitor_x = monitor.position().x as f64 / scale_factor;
    let monitor_y = monitor.position().y as f64 / scale_factor;
    let monitor_w = monitor.size().width as f64 / scale_factor;
    let monitor_h = monitor.size().height as f64 / scale_factor;

    let is_wayland = {
        #[cfg(target_os = "linux")]
        {
            let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
            let wayland_display = std::env::var("WAYLAND_DISPLAY").unwrap_or_default();
            let gdk_backend = std::env::var("GDK_BACKEND").unwrap_or_default();
            (session_type == "wayland" || !wayland_display.is_empty()) && gdk_backend != "x11"
        }
        #[cfg(not(target_os = "linux"))]
        {
            false
        }
    };

    let window = {
        let builder = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("/overlay".into()))
            .title("SnapTranslate - 截图蒙版")
            .decorations(false)
            .always_on_top(true);
        #[cfg(not(target_os = "macos"))]
        let builder = builder.transparent(true);

        let builder = if is_wayland {
            builder.fullscreen(true)
        } else {
            builder
                .position(monitor_x, monitor_y)
                .inner_size(monitor_w, monitor_h)
        };

        builder
            .shadow(false)
            .focusable(true)
            .resizable(false)
            .visible(false)
            .build()
            .map_err(|e| AppError::ConfigError(format!("创建蒙版窗口失败: {}", e)))?
    };

    // Windows: 禁用 DWM 过渡动画，防止蒙版窗口显示/关闭时出现缩放动画
    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::HasWindowHandle;
        use windows_sys::Win32::Foundation::HWND;
        use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE};
        if let Ok(handle) = window.window_handle() {
            let raw = handle.as_ref();
            if let raw_window_handle::RawWindowHandle::Win32(win32) = raw {
                let hwnd = win32.hwnd.get() as *mut std::ffi::c_void;
                unsafe {
                    // 禁用 DWM 过渡动画（避免缩放动画）
                    let disabled: i32 = 1;
                    DwmSetWindowAttribute(
                        hwnd,
                        DWMWA_TRANSITIONS_FORCEDISABLED as u32,
                        &disabled as *const _ as *const std::ffi::c_void,
                        std::mem::size_of::<i32>() as u32,
                    );
                    // 防截图捕获（不影响 DWM 位图缓存，避免白色边缘）
                    SetWindowDisplayAffinity(hwnd as HWND, WDA_EXCLUDEFROMCAPTURE);
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;
        if let Ok(gtk_window) = window.gtk_window() {
            // Dock 类型窗口在 X11/GNOME 中不受面板 strut 约束，会直接覆盖在面板之上
            gtk_window.set_type_hint(gtk::gdk::WindowTypeHint::Dock);
            // 确保保持最上层
            gtk_window.set_keep_above(true);
            // 不在任务栏和分页器中显示
            gtk_window.set_skip_taskbar_hint(true);
            gtk_window.set_skip_pager_hint(true);
        }
    }

    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

fn prepare_pin_window(
    app: &AppHandle,
    image_data: &str,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<PinWindowInfo, AppError> {
    const PIN_PADDING: f64 = 14.0;
    const CONTROL_BAR_H: f64 = 36.0;

    let label = format!("pin-{}", Uuid::new_v4());

    {
        let store = app.state::<Mutex<PinImageStore>>();
        let mut store = store.lock().map_err(|e| AppError::ConfigError(format!("锁定状态失败: {}", e)))?;
        store.images.insert(label.clone(), image_data.to_string());
    }

    let scale_factor = app.primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);

    let logical_x = x as f64 / scale_factor;
    let logical_y = y as f64 / scale_factor;
    let logical_w = w as f64 / scale_factor;
    let logical_h = h as f64 / scale_factor;

    let info = PinWindowInfo {
        label,
        // 窗口位置左移/上移一个 PIN_PADDING，配合前端 padding 使图片保持在原始裁剪位置
        x: logical_x - PIN_PADDING,
        y: logical_y - PIN_PADDING,
        width: logical_w + PIN_PADDING * 2.0,
        height: logical_h + CONTROL_BAR_H + PIN_PADDING * 2.0,
    };

    Ok(info)
}

pub fn create_pin_window(
    app: &AppHandle,
    image_data: &str,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<String, AppError> {
    let info = prepare_pin_window(app, image_data, x, y, w, h)?;

    let _window = {
        let builder = WebviewWindowBuilder::new(app, &info.label, WebviewUrl::App("/pin".into()))
            .title("SnapTranslate - 贴图")
            .decorations(false)
            .always_on_top(true);
        #[cfg(not(target_os = "macos"))]
        let builder = builder.transparent(true);
        builder
            .shadow(false)
            .skip_taskbar(true)
            .resizable(false)
            .position(info.x, info.y)
            .inner_size(info.width, info.height)
            .build()
            .map_err(|e| AppError::ConfigError(format!("创建贴图窗口失败: {}", e)))?
    };

    Ok(info.label)
}

pub fn get_pin_image(app: &AppHandle, window_id: &str) -> Result<Option<String>, AppError> {
    let store = app.state::<Mutex<PinImageStore>>();
    let mut store = store.lock().map_err(|e| AppError::ConfigError(format!("锁定状态失败: {}", e)))?;
    Ok(store.images.remove(window_id))
}

pub fn close_pin_window(app: &AppHandle, window_id: &str) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window(window_id) {
        window.destroy().map_err(|e| AppError::ConfigError(format!("关闭贴图窗口 {} 失败: {}", window_id, e)))?;
    }
    Ok(())
}

/// 从配置文件读取界面语言设置，读取失败时返回 "auto"
fn get_config_language(app: &AppHandle) -> String {
    let config_manager = crate::config::ConfigManager::new(app);
    match config_manager {
        Ok(manager) => match manager.load() {
            Ok(config) => config.language,
            Err(_) => "auto".to_string(),
        },
        Err(_) => "auto".to_string(),
    }
}
