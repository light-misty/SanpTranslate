use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::ImageEncoder;
use std::io::Cursor;
use std::sync::{Arc, Mutex};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::error::AppError;

/// 剪贴板图片缓存
/// 后台线程持续监控剪贴板，一旦检测到图片即缓存其 Base64 数据
/// 供 Ctrl+Alt+P 快捷键使用，即使后续复制了文本也能找到最近的图片
#[derive(Clone)]
pub struct ClipboardImageCache(pub Arc<Mutex<Option<String>>>);

impl ClipboardImageCache {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }

    /// 获取缓存的图片 Base64 数据（如果有）
    pub fn get(&self) -> Option<String> {
        self.0.lock().ok()?.clone()
    }

    /// 更新缓存（内部使用，由后台监控线程调用）
    fn set(&self, data: String) {
        if let Ok(mut cache) = self.0.lock() {
            *cache = Some(data);
        }
    }
}

/// 启动剪贴板图片监控后台线程
/// 每秒检查一次剪贴板是否有图片，有则缓存其 Base64 数据
pub fn start_clipboard_watcher(app_handle: tauri::AppHandle, cache: ClipboardImageCache) {
    std::thread::spawn(move || {
        log::info!("[CLIPBOARD] 剪贴板图片监控已启动");
        loop {
            match read_clipboard_image(&app_handle) {
                Ok(Some(data)) => {
                    cache.set(data);
                }
                Ok(None) => {
                    // 剪贴板当前无图片，保持缓存不变
                }
                Err(e) => {
                    log::debug!("[CLIPBOARD] 读取剪贴板失败: {}", e);
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
    });
}

/// 将 Base64 编码的图像数据写入系统剪贴板
/// 算法: Base64 解码 -> 直接构造 tauri Image -> 写入剪贴板
pub fn write_clipboard_image(app: &tauri::AppHandle, image_data: &str) -> Result<(), AppError> {
    // Base64 解码
    let bytes = BASE64
        .decode(image_data)
        .map_err(|e| AppError::ClipboardError(format!("Base64 解码失败: {}", e)))?;

    // 直接从 PNG 字节构造 tauri Image，避免冗余的解码/编码循环
    let tauri_image = tauri::image::Image::from_bytes(&bytes)
        .map_err(|e| AppError::ClipboardError(format!("构造 tauri Image 失败: {}", e)))?;

    // 写入剪贴板
    let clipboard = app.clipboard();
    clipboard
        .write_image(&tauri_image)
        .map_err(|e| AppError::ClipboardError(format!("写入剪贴板图像失败: {}", e)))?;
    Ok(())
}

/// 将原始 RGBA 数据直接写入系统剪贴板
/// 算法: 直接从 RGBA 数据构造 tauri Image -> 写入剪贴板
/// 跳过 PNG 编码/解码循环，性能远优于 write_clipboard_image
pub fn write_clipboard_image_raw(
    app: &tauri::AppHandle,
    rgba_data: Vec<u8>,
    width: u32,
    height: u32,
) -> Result<(), AppError> {
    let tauri_image = tauri::image::Image::new(&rgba_data, width, height);
    let clipboard = app.clipboard();
    clipboard
        .write_image(&tauri_image)
        .map_err(|e| AppError::ClipboardError(format!("写入剪贴板图像失败: {}", e)))?;
    Ok(())
}

/// 从系统剪贴板读取图像，返回 Base64 编码数据
/// 算法: 从剪贴板读取 tauri Image -> RGBA 数据快速 PNG 编码 -> Base64 编码
/// 如果剪贴板中没有图像，返回 Ok(None)
pub fn read_clipboard_image(app: &tauri::AppHandle) -> Result<Option<String>, AppError> {
    let clipboard = app.clipboard();

    // 尝试读取图像，无图像时返回 Ok(None)
    let tauri_image = match clipboard.read_image() {
        Ok(img) => img,
        Err(_) => return Ok(None),
    };

    // 从 tauri::image::Image 提取 RGBA 数据
    let rgba_data = tauri_image.rgba();
    let width = tauri_image.width();
    let height = tauri_image.height();

    // 将 RGBA 数据构造为 RgbaImage
    let rgba_image = image::RgbaImage::from_raw(width, height, rgba_data.to_vec())
        .ok_or_else(|| AppError::ClipboardError("RGBA 数据无法构造图像".to_string()))?;

    // 使用快速压缩级别编码为 PNG
    let png_bytes = encode_png_fast(&rgba_image)?;
    let base64_str = BASE64.encode(&png_bytes);

    Ok(Some(base64_str))
}

/// 使用快速压缩级别编码 PNG
fn encode_png_fast(image: &image::RgbaImage) -> Result<Vec<u8>, AppError> {
    let mut buf = Cursor::new(Vec::new());
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        &mut buf,
        image::codecs::png::CompressionType::Fast,
        image::codecs::png::FilterType::Sub,
    );
    encoder
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| AppError::ClipboardError(format!("PNG 快速编码失败: {}", e)))?;
    Ok(buf.into_inner())
}

/// 将文本写入系统剪贴板
pub fn write_clipboard_text(app: &tauri::AppHandle, text: &str) -> Result<(), AppError> {
    let clipboard = app.clipboard();
    clipboard
        .write_text(text)
        .map_err(|e| AppError::ClipboardError(format!("写入剪贴板文本失败: {}", e)))?;

    Ok(())
}

/// 从系统剪贴板读取文本
pub fn read_clipboard_text(app: &tauri::AppHandle) -> Result<String, AppError> {
    let clipboard = app.clipboard();
    clipboard
        .read_text()
        .map_err(|e| AppError::ClipboardError(format!("读取剪贴板文本失败: {}", e)))
}
