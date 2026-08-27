use crate::config::{AppConfig, ConfigManager};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use std::error::Error;
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    let manager = ConfigManager::new(&app).map_err(|e| e.to_string())?;
    manager.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, config: AppConfig) -> Result<crate::hotkey::ShortcutRegistrationResult, String> {
    let manager = ConfigManager::new(&app).map_err(|e| e.to_string())?;
    manager.save(&config).map_err(|e| e.to_string())?;

    // 重新注册全局快捷键（注销旧的，注册新的）
    #[cfg(desktop)]
    {
        let result = crate::hotkey::reregister_hotkeys(&app, &config.shortcuts).map_err(|e| {
            log::error!("重新注册快捷键失败: {}", e);
            e.to_string()
        })?;

        // 更新托盘菜单以反映快捷键和语言变更
        if let Err(e) = crate::tray::update_tray_menu(&app, &config.shortcuts, &config.language) {
            log::warn!("更新托盘菜单失败: {}", e);
        }

        // 广播语言变更事件到所有窗口
        crate::tray::emit_language_changed(&app, &config.language);

        return Ok(result);
    }

    // 非桌面平台返回空结果
    #[cfg(not(desktop))]
    Ok(crate::hotkey::ShortcutRegistrationResult {
        statuses: Vec::new(),
        has_failure: false,
    })
}

/// 检查快捷键注册状态（供设置页面查询）
#[tauri::command]
pub fn check_shortcuts_status(app: tauri::AppHandle) -> Result<Option<crate::hotkey::ShortcutRegistrationResult>, String> {
    // 尝试从应用状态获取注册结果
    let state = app.try_state::<std::sync::Mutex<crate::hotkey::ShortcutRegistrationResult>>();
    if let Some(guard) = state {
        if let Ok(result) = guard.lock() {
            return Ok(Some(result.clone()));
        }
    }
    Ok(None)
}

/// 测试快捷键是否可用（不实际注册，仅检测占用状态）
#[tauri::command]
pub fn test_shortcut_availability(
    shortcut_str: String,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    // 解析快捷键字符串
    let shortcut = match crate::hotkey::parse_shortcut_for_test(&shortcut_str) {
        Some(s) => s,
        None => return Err(format!("无法解析快捷键: {}", shortcut_str)),
    };

    // 先注销当前快捷键（如果已注册），避免本应用的注册影响测试结果
    let _ = app.global_shortcut().unregister(shortcut);
    // 短暂等待让系统释放快捷键
    std::thread::sleep(std::time::Duration::from_millis(100));

    // 尝试临时注册来检测是否可用
    match app.global_shortcut().register(shortcut) {
        Ok(()) => {
            // 注册成功，说明快捷键可用，立即注销
            let _ = app.global_shortcut().unregister(shortcut);
            Ok(true)
        }
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("already registered") {
                // 快捷键被其他程序占用
                Ok(false)
            } else {
                // 其他错误（如权限问题）
                Err(format!("检测失败: {}", e))
            }
        }
    }
}

#[tauri::command]
pub fn write_clipboard_image(image_data: String, app: tauri::AppHandle) -> Result<(), String> {
    log::info!("[CMD] write_clipboard_image 被调用，数据长度={}", image_data.len());
    crate::clipboard::write_clipboard_image(&app, &image_data).map_err(|e| {
        log::error!("[CMD] 写入剪贴板失败: {}", e);
        e.to_string()
    })
}

#[tauri::command]
pub fn read_clipboard_image(app: tauri::AppHandle) -> Result<Option<String>, String> {
    crate::clipboard::read_clipboard_image(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_clipboard_text(text: String, app: tauri::AppHandle) -> Result<(), String> {
    crate::clipboard::write_clipboard_text(&app, &text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_pin_window(window_id: String, app: tauri::AppHandle) -> Result<(), String> {
    crate::window::close_pin_window(&app, &window_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_pin_image(window_id: String, app: tauri::AppHandle) -> Result<Option<String>, String> {
    crate::window::get_pin_image(&app, &window_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn capture_region_from_cache(
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    app: tauri::AppHandle,
) -> Result<crate::window::CropResult, String> {
    log::info!("[CMD] capture_region_from_cache 被调用，x={}, y={}, w={}, h={}", x, y, width, height);

    let cached_screen = {
        let store = app.state::<std::sync::Mutex<crate::window::CachedScreenStore>>();
        let mut store = store.lock().map_err(|e| {
            log::error!("[CMD] 锁定 CachedScreenStore 失败: {}", e);
            e.to_string()
        })?;
        store.screen.take()
    };

    let mut screen = cached_screen.ok_or_else(|| {
        log::error!("[CMD] 缓存中无全屏截图数据");
        // 读取配置以确定界面语言
        let lang = crate::config::ConfigManager::new(&app)
            .ok()
            .and_then(|m| m.load().ok())
            .map(|c| c.language)
            .unwrap_or_else(|| "auto".to_string());
        let is_zh = crate::config::resolve_language(&lang) == "zh-CN";
        if is_zh {
            "缓存中无全屏截图数据，请重新截图".to_string()
        } else {
            "No cached screenshot data. Please capture again.".to_string()
        }
    })?;

    // 动态计算由于 XWayland 缩放引起的分辨率比例差异
    let ratio_x = screen.image.width() as f64 / screen.tauri_monitor_width as f64;
    let ratio_y = screen.image.height() as f64 / screen.tauri_monitor_height as f64;

    let real_x = (x as f64 * ratio_x).round() as u32;
    let real_y = (y as f64 * ratio_y).round() as u32;
    let real_width = (width as f64 * ratio_x).round() as u32;
    let real_height = (height as f64 * ratio_y).round() as u32;

    log::info!(
        "[CMD] 分辨率转换: 真实截图={:?}, Tauri报告={:?}, 缩放比=({:.4}, {:.4}), 原始裁剪区域={:?}, 实际裁剪区域={:?}",
        (screen.image.width(), screen.image.height()),
        (screen.tauri_monitor_width, screen.tauri_monitor_height),
        ratio_x, ratio_y,
        (x, y, width, height),
        (real_x, real_y, real_width, real_height)
    );

    let cropped = image::imageops::crop(&mut screen.image, real_x, real_y, real_width, real_height);
    let cropped_image = cropped.to_image();

    let rgba_for_clipboard = cropped_image.as_raw().clone();
    let crop_w = cropped_image.width();
    let crop_h = cropped_image.height();

    // 使用 JPEG 编码（质量 90），编码速度远快于 PNG，对截图视觉无损
    let base64_data = encode_crop_as_jpeg(&cropped_image, 90).map_err(|e| {
        log::error!("[CMD] JPEG 编码失败: {}", e);
        e.to_string()
    })?;

    // 异步写入剪贴板（不阻塞返回）
    let app_clone = app.clone();
    std::thread::spawn(move || {
        match crate::clipboard::write_clipboard_image_raw(&app_clone, rgba_for_clipboard, crop_w, crop_h) {
            Ok(_) => log::info!("[CMD] 异步剪贴板写入成功"),
            Err(e) => log::error!("[CMD] 异步剪贴板写入失败: {}", e),
        }
    });

    let scale_factor = screen.scale_factor;
    let logical_x = (screen.monitor_x + x as i32) as f64 / scale_factor;
    let logical_y = (screen.monitor_y + y as i32) as f64 / scale_factor;
    let logical_w = width as f64 / scale_factor;
    let logical_h = height as f64 / scale_factor;

    // 阴影内边距和控制栏高度，需与前端 PinView.vue 保持一致
    const PIN_PADDING: f64 = 14.0;
    const CONTROL_BAR_H: f64 = 36.0;

    let result = crate::window::CropResult {
        base64_data,
        // 窗口位置左移/上移一个 PIN_PADDING，配合前端 padding 使图片保持在原始裁剪位置
        x: logical_x - PIN_PADDING,
        y: logical_y - PIN_PADDING,
        width: logical_w + PIN_PADDING * 2.0,
        height: logical_h + CONTROL_BAR_H + PIN_PADDING * 2.0,
        crop_width: width,
        crop_height: height,
    };

    log::info!("[CMD] capture_region_from_cache 完成，返回 CropResult");
    Ok(result)
}

/// 使用 JPEG 编码裁剪区域，返回完整 data URI（比 PNG 快 3-5 倍）
fn encode_crop_as_jpeg(image: &image::RgbaImage, quality: u8) -> Result<String, String> {
    let mut buf = std::io::Cursor::new(Vec::new());
    // JPEG 不支持 alpha 通道，转换为 RGB
    let rgb_image = image::DynamicImage::ImageRgba8(image.clone()).to_rgb8();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    encoder
        .encode(
            rgb_image.as_raw(),
            rgb_image.width(),
            rgb_image.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("JPEG 编码失败: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.get_ref());
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
pub fn get_overlay_image(app: tauri::AppHandle) -> Result<Option<crate::window::OverlayImageData>, String> {
    let store = app.state::<std::sync::Mutex<crate::window::CachedScreenStore>>();
    let mut store = store.lock().map_err(|e| {
        log::error!("[CMD] 锁定 CachedScreenStore 失败: {}", e);
        e.to_string()
    })?;
    Ok(store.overlay_image.take())
}

#[tauri::command]
pub fn store_pin_image(label: String, image_data: String, app: tauri::AppHandle) -> Result<(), String> {
    let store = app.state::<std::sync::Mutex<crate::window::PinImageStore>>();
    let mut store = store.lock().map_err(|e| {
        log::error!("[CMD] 锁定 PinImageStore 失败: {}", e);
        e.to_string()
    })?;
    store.images.insert(label.clone(), image_data);
    log::info!("[CMD] store_pin_image: 图像数据已存储，label={}, store中共{}条记录", label, store.images.len());
    Ok(())
}

#[tauri::command]
pub async fn translate_image(
    image_data: String,
    target_language: String,
    force_retranslate: Option<bool>,
    app: tauri::AppHandle,
) -> Result<crate::translate::TranslateResult, String> {
    // 是否强制重新翻译（跳过历史缓存）
    let skip_cache = force_retranslate.unwrap_or(false);

    // 加载配置
    let config_manager = crate::config::ConfigManager::new(&app).map_err(|e| e.to_string())?;
    let config = config_manager.load().map_err(|e| e.to_string())?;

    // 根据界面语言选择错误提示文本
    let is_zh = crate::config::resolve_language(&config.language) == "zh-CN";

    // 获取 API 密钥
    log::info!("[CMD] translate_image: 正在从密钥环读取 API 密钥...");
    let api_key = config_manager.get_api_key().map_err(|e| {
        log::error!("[CMD] translate_image: 读取 API 密钥失败: {}", e);
        e.to_string()
    })?;
    let api_key = api_key.ok_or_else(|| {
        log::error!("[CMD] translate_image: API 密钥未配置");
        if is_zh {
            "API 密钥未配置，请在设置中配置 API 密钥".to_string()
        } else {
            "API key not configured. Please set it in Settings.".to_string()
        }
    })?;
    log::info!("[CMD] translate_image: API 密钥读取成功");

    // ===== 第一步：OCR 识别文字（同时用于历史缓存匹配和后续翻译） =====
    let ocr_lang = if config.ocr_language == "auto" {
        "chi_sim+eng+jpn"
    } else {
        &config.ocr_language
    };
    log::info!("[CMD] translate_image: 正在进行 OCR 识别，选择={}, 实际加载={}...", config.ocr_language, ocr_lang);
    let ocr_blocks = crate::ocr::extract_text_with_positions(
        &app, &image_data, ocr_lang
    ).await.map_err(|e| format!("OCR识别失败: {}", e))?;

    if ocr_blocks.is_empty() {
        log::info!("[CMD] OCR未识别到文字，返回空结果");
        return Ok(crate::translate::TranslateResult { blocks: Vec::new(), from_cache: false });
    }

    // 拼接 OCR 文本用于历史匹配（使用 \n 以匹配数据库存储格式）
    let ocr_text = ocr_blocks
        .iter()
        .map(|b| b.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");

    log::info!("[CMD] OCR识别完成，共 {} 个文字块", ocr_blocks.len());

    // ===== 第二步：查找历史缓存（非强制重新翻译时才查找） =====
    if !skip_cache {
        let history_service = app.state::<std::sync::Mutex<crate::history::HistoryService>>();
        let service = history_service.lock().map_err(|e| e.to_string())?;
        if let Some((id, blocks_json)) = service.find_by_ocr_text(&ocr_text, &target_language)
            .map_err(|e| e.to_string())?
        {
            if let Ok(blocks) = serde_json::from_str::<Vec<crate::translate::TranslatedBlock>>(&blocks_json) {
                log::info!("[CMD] OCR文本匹配历史缓存(id={})，跳过API翻译", id);
                return Ok(crate::translate::TranslateResult { blocks, from_cache: true });
            } else {
                log::warn!("[CMD] 历史缓存 blocks_json 解析失败，重新翻译");
            }
        }
    } else {
        log::info!("[CMD] 强制重新翻译，跳过历史缓存查找");
    }

    // ===== 第三步：未命中缓存，调用 API 翻译（使用已有 OCR 结果，避免重复 OCR） =====
    log::info!("[CMD] translate_image: 未命中缓存，调用翻译 API...");
    let result = crate::translate::translate_with_ocr_blocks(
        ocr_blocks,
        &config.api_base_url,
        &api_key,
        &config.model,
        &target_language,
        &config.api_provider, // 透传 API 提供商（openai/anthropic/gemini）
    )
    .await
    .map_err(|e| e.to_string())?;

    // ===== 第四步：保存历史记录（含缓存数据） =====
    if !result.blocks.is_empty() {
        let app_clone = app.clone();
        let image_data_clone = image_data;
        let ocr_text_clone = ocr_text;
        let translated_text = result.blocks.iter().map(|b| b.translated.as_str()).collect::<Vec<_>>().join("\n");
        let blocks_json = serde_json::to_string(&result.blocks).map_err(|e| e.to_string())?;
        let target_language_clone = target_language;

        std::thread::spawn(move || {
            match save_translation_history(
                &app_clone, Some(&image_data_clone), &ocr_text_clone, &translated_text,
                &target_language_clone, &blocks_json,
            ) {
                Ok(id) => log::info!("[CMD] 翻译历史已保存, id={}", id),
                Err(e) => log::error!("[CMD] 保存翻译历史失败: {}", e),
            }
        });
    }

    Ok(result)
}

/// 保存翻译历史记录到数据库（含目标语言和缓存 JSON）
fn save_translation_history(
    app: &tauri::AppHandle,
    image_base64: Option<&str>,
    ocr_text: &str,
    translated_text: &str,
    target_language: &str,
    blocks_json: &str,
) -> Result<i64, String> {
    // 将 Base64 图像数据解码为原始字节（文本翻译时无图片）
    let image_bytes = if let Some(data) = image_base64 {
        Some(STANDARD.decode(data).map_err(|e| format!("Base64解码失败: {}", e))?)
    } else {
        None
    };

    let history_service = app.state::<std::sync::Mutex<crate::history::HistoryService>>();
    let service = history_service.lock().map_err(|e| format!("锁定HistoryService失败: {}", e))?;

    let entry = crate::history::NewHistoryEntry {
        image_data: image_bytes,
        ocr_text: if ocr_text.is_empty() { None } else { Some(ocr_text.to_string()) },
        translated_text: translated_text.to_string(),
        target_language: target_language.to_string(),
        blocks_json: blocks_json.to_string(),
    };

    service.add_entry(entry).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let config_manager = crate::config::ConfigManager::new(&app).map_err(|e| e.to_string())?;
    let result = config_manager.get_api_key().map_err(|e| {
        log::error!("[CMD] get_api_key: 读取失败: {}", e);
        e.to_string()
    })?;
    log::info!("[CMD] get_api_key: 读取结果={}", if result.is_some() { "有密钥" } else { "无密钥" });
    Ok(result)
}

#[tauri::command]
pub fn set_api_key(key: String, app: tauri::AppHandle) -> Result<(), String> {
    log::info!("[CMD] set_api_key: 正在保存 API 密钥到密钥环...");
    let config_manager = crate::config::ConfigManager::new(&app).map_err(|e| e.to_string())?;
    config_manager.set_api_key(&key).map_err(|e| {
        log::error!("[CMD] set_api_key: 保存失败: {}", e);
        e.to_string()
    })?;
    log::info!("[CMD] set_api_key: API 密钥保存成功");
    Ok(())
}

#[tauri::command]
pub fn delete_api_key(app: tauri::AppHandle) -> Result<(), String> {
    log::info!("[CMD] delete_api_key: 正在从密钥环删除 API 密钥...");
    let config_manager = crate::config::ConfigManager::new(&app).map_err(|e| e.to_string())?;
    config_manager.delete_api_key().map_err(|e| {
        log::error!("[CMD] delete_api_key: 删除失败: {}", e);
        e.to_string()
    })?;
    log::info!("[CMD] delete_api_key: API 密钥删除成功");
    Ok(())
}

#[tauri::command]
pub fn get_config_path(app: tauri::AppHandle) -> Result<String, String> {
    let config_manager = crate::config::ConfigManager::new(&app).map_err(|e| e.to_string())?;
    Ok(config_manager.get_config_path().to_string_lossy().to_string())
}

/// 获取日志文件目录路径
///
/// dev 模式下日志写入项目根目录/log/（与 logging 模块配置一致），
/// prod 模式下使用 OS 标准日志目录。
#[tauri::command]
pub fn get_log_dir() -> Result<String, String> {
    crate::logging::get_log_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "无法确定日志目录路径".to_string())
}

#[tauri::command]
pub async fn test_api_connection(
    api_base_url: String,
    api_key: String,
    model: String,
    language: Option<String>,
    api_provider: Option<String>,
) -> Result<String, String> {
    // 解析 API 提供商，默认为 openai（复用 translate 模块的标准化解析逻辑）
    let provider = crate::translate::resolve_provider(api_provider.as_deref().unwrap_or("openai"));

    // 根据界面语言选择提示文本
    let effective_lang = crate::config::resolve_language(language.as_deref().unwrap_or("auto"));
    let is_zh = effective_lang == "zh-CN";

    // 按 provider 构造 (URL, 请求体, 额外请求头)
    // extra_headers: 用于承载 provider 特有的认证/版本头
    let (url, request_body, extra_headers): (String, serde_json::Value, Vec<(&str, String)>) =
        match provider {
            // Anthropic：使用 x-api-key + anthropic-version 头，路径为 /v1/messages
            "anthropic" => {
                // base_url 为空时使用官方地址（复用 translate::anthropic 模块的默认常量）
                let base = if api_base_url.trim().is_empty() {
                    crate::translate::anthropic::ANTHROPIC_DEFAULT_BASE_URL.to_string()
                } else {
                    api_base_url.clone()
                };
                let url = format!("{}/v1/messages", base.trim_end_matches('/'));
                let body = serde_json::json!({
                    "model": model,
                    "max_tokens": 5,
                    "messages": [{"role": "user", "content": "Hello"}],
                    // 显式关闭思考链
                    "thinking": {
                        "type": "disabled"
                    }
                });
                let headers: Vec<(&str, String)> = vec![
                    ("x-api-key", api_key.clone()),
                    ("anthropic-version", "2023-06-01".to_string()),
                ];
                (url, body, headers)
            }
            // Gemini：使用 x-goog-api-key，路径为 /v1beta/models/{model}:generateContent
            "gemini" => {
                // base_url 为空时使用官方地址（复用 translate::gemini 模块的默认常量）
                let base = if api_base_url.trim().is_empty() {
                    crate::translate::gemini::GEMINI_DEFAULT_BASE_URL.to_string()
                } else {
                    api_base_url.clone()
                };
                let url = format!(
                    "{}/v1beta/models/{}:generateContent",
                    base.trim_end_matches('/'),
                    model
                );
                // thinkingConfig.thinkingBudget=0：显式关闭思考链，避免 Gemini 2.5+ 默认启用 thinking 导致额外延迟和 token 消耗
                let body = serde_json::json!({
                    "contents": [{"role": "user", "parts": [{"text": "Hello"}]}],
                    "generationConfig": {
                        "maxOutputTokens": 5,
                        "thinkingConfig": {
                            "thinkingBudget": 0
                        }
                    }
                });
                let headers: Vec<(&str, String)> = vec![
                    ("x-goog-api-key", api_key.clone()),
                ];
                (url, body, headers)
            }
            // 默认走 OpenAI 兼容分支（含未知 provider）
            _ => {
                let url = format!("{}/chat/completions", api_base_url.trim_end_matches('/'));
                let body = serde_json::json!({
                    "model": model,
                    "messages": [{"role": "user", "content": "Hello"}],
                    "max_tokens": 5
                });
                let headers: Vec<(&str, String)> = vec![
                    ("Authorization", format!("Bearer {}", api_key)),
                ];
                (url, body, headers)
            }
        };

    // HTTP 客户端：15s 总超时、10s 连接超时
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| {
            if is_zh {
                format!("创建HTTP客户端失败: {}", e)
            } else {
                format!("Failed to create HTTP client: {}", e)
            }
        })?;

    // 统一构造 POST 请求：Content-Type 与 provider 特有的请求头
    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request_body);
    for (key, value) in &extra_headers {
        request = request.header(*key, value);
    }

    let response = request
        .send()
        .await
        .map_err(|e| {
            let mut msg = if is_zh {
                format!("连接失败: {}", e)
            } else {
                format!("Connection failed: {}", e)
            };
            let mut source = e.source();
            while let Some(err) = source {
                if is_zh {
                    msg.push_str(&format!("\n  原因: {}", err));
                } else {
                    msg.push_str(&format!("\n  Cause: {}", err));
                }
                source = err.source();
            }
            msg
        })?;

    if response.status().is_success() {
        if is_zh {
            Ok("连接成功".to_string())
        } else {
            Ok("Connection successful".to_string())
        }
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        // 解析错误响应：优先提取 json["error"]["message"]（OpenAI/Anthropic 通用），Gemini 的错误结构不同时回退为原文
        let error_msg = if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            json["error"]["message"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| body.clone())
        } else {
            body.clone()
        };
        match status.as_u16() {
            401 => Err(if is_zh { "API 密钥无效或已过期".to_string() } else { "Invalid or expired API key".to_string() }),
            403 => Err(if is_zh { "无权访问该 API，请检查密钥权限".to_string() } else { "No permission to access the API. Check your key permissions.".to_string() }),
            404 => Err(if is_zh { "API 地址不存在，请检查地址是否正确".to_string() } else { "API URL not found. Please check the URL.".to_string() }),
            429 => Err(if is_zh { "请求过于频繁，请稍后再试".to_string() } else { "Too many requests. Please try again later.".to_string() }),
            500..=599 => Err(if is_zh { "服务器错误，请稍后再试".to_string() } else { "Server error. Please try again later.".to_string() }),
            _ => Err(if is_zh { format!("连接失败: {}", error_msg) } else { format!("Connection failed: {}", error_msg) }),
        }
    }
}

// ===== 历史记录相关命令 =====

#[tauri::command]
pub fn get_history_list(
    limit: u32,
    app: tauri::AppHandle,
) -> Result<Vec<crate::history::HistoryListItem>, String> {
    let history_service = app.state::<std::sync::Mutex<crate::history::HistoryService>>();
    let service = history_service.lock().map_err(|e| {
        log::error!("[CMD] 锁定 HistoryService 失败: {}", e);
        e.to_string()
    })?;
    service.get_list(limit).map_err(|e| {
        log::error!("[CMD] 获取历史列表失败: {}", e);
        e.to_string()
    })
}

#[tauri::command]
pub fn get_history_detail(
    id: i64,
    app: tauri::AppHandle,
) -> Result<crate::history::HistoryEntry, String> {
    let history_service = app.state::<std::sync::Mutex<crate::history::HistoryService>>();
    let service = history_service.lock().map_err(|e| {
        log::error!("[CMD] 锁定 HistoryService 失败: {}", e);
        e.to_string()
    })?;
    service.get_detail(id).map_err(|e| {
        log::error!("[CMD] 获取历史详情失败: id={}, error={}", id, e);
        e.to_string()
    })
}

#[tauri::command]
pub fn delete_history(id: i64, app: tauri::AppHandle) -> Result<bool, String> {
    let history_service = app.state::<std::sync::Mutex<crate::history::HistoryService>>();
    let service = history_service.lock().map_err(|e| {
        log::error!("[CMD] 锁定 HistoryService 失败: {}", e);
        e.to_string()
    })?;
    service.delete_entry(id).map(|_| true).map_err(|e| {
        log::error!("[CMD] 删除历史记录失败: id={}, error={}", id, e);
        e.to_string()
    })
}

#[tauri::command]
pub fn clear_history(app: tauri::AppHandle) -> Result<bool, String> {
    let history_service = app.state::<std::sync::Mutex<crate::history::HistoryService>>();
    let service = history_service.lock().map_err(|e| {
        log::error!("[CMD] 锁定 HistoryService 失败: {}", e);
        e.to_string()
    })?;
    service.clear_all().map(|_| true).map_err(|e| {
        log::error!("[CMD] 清空历史记录失败: {}", e);
        e.to_string()
    })
}

/// 仅执行 OCR 识别，不翻译；用于"复制原文"功能（无需调用 API 即可获取文字）
#[tauri::command]
pub async fn ocr_image(
    image_data: String,
    app: tauri::AppHandle,
) -> Result<Vec<crate::ocr::OcrBlock>, String> {
    let config_manager = crate::config::ConfigManager::new(&app).map_err(|e| e.to_string())?;
    let config = config_manager.load().map_err(|e| e.to_string())?;

    let ocr_lang = if config.ocr_language == "auto" {
        "chi_sim+eng+jpn"
    } else {
        &config.ocr_language
    };
    log::info!("[CMD] ocr_image: 正在进行 OCR 识别，选择={}, 实际加载={}...", config.ocr_language, ocr_lang);
    let ocr_blocks = crate::ocr::extract_text_with_positions(
        &app, &image_data, ocr_lang
    ).await.map_err(|e| format!("OCR识别失败: {}", e))?;

    if ocr_blocks.is_empty() {
        log::info!("[CMD] ocr_image: OCR未识别到文字");
    } else {
        log::info!("[CMD] ocr_image: OCR识别完成，共 {} 个文字块", ocr_blocks.len());
    }

    Ok(ocr_blocks)
}

/// 重启应用
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// 纯文本翻译命令：接收文本直接翻译，支持历史缓存
#[tauri::command]
pub async fn translate_text(
    text: String,
    target_language: String,
    force_retranslate: Option<bool>,
    app: tauri::AppHandle,
) -> Result<crate::translate::TextTranslateResult, String> {
    let skip_cache = force_retranslate.unwrap_or(false);

    // 加载配置
    let config_manager = crate::config::ConfigManager::new(&app).map_err(|e| e.to_string())?;
    let config = config_manager.load().map_err(|e| e.to_string())?;

    let is_zh = crate::config::resolve_language(&config.language) == "zh-CN";

    // 获取 API 密钥
    log::info!("[CMD] translate_text: 正在从密钥环读取 API 密钥...");
    let api_key = config_manager.get_api_key().map_err(|e| {
        log::error!("[CMD] translate_text: 读取 API 密钥失败: {}", e);
        e.to_string()
    })?;
    let api_key = api_key.ok_or_else(|| {
        log::error!("[CMD] translate_text: API 密钥未配置");
        if is_zh {
            "API 密钥未配置，请在设置中配置 API 密钥".to_string()
        } else {
            "API key not configured. Please set it in Settings.".to_string()
        }
    })?;
    log::info!("[CMD] translate_text: API 密钥读取成功");

    if text.trim().is_empty() {
        return Ok(crate::translate::TextTranslateResult {
            translated_text: String::new(),
            from_cache: false,
        });
    }

    // 查找历史缓存（非强制重新翻译时才查找）
    if !skip_cache {
        let history_service = app.state::<std::sync::Mutex<crate::history::HistoryService>>();
        let service = history_service.lock().map_err(|e| e.to_string())?;
        if let Some((id, blocks_json)) = service.find_by_ocr_text(&text, &target_language)
            .map_err(|e| e.to_string())?
        {
            // 尝试从 blocks_json 恢复翻译结果
            if let Ok(blocks) = serde_json::from_str::<Vec<crate::translate::TranslatedBlock>>(&blocks_json) {
                let translated = blocks.iter().map(|b| b.translated.as_str()).collect::<Vec<_>>().join("\n");
                log::info!("[CMD] 文本匹配历史缓存(id={})，跳过API翻译", id);
                return Ok(crate::translate::TextTranslateResult {
                    translated_text: translated,
                    from_cache: true,
                });
            } else {
                log::warn!("[CMD] 历史缓存 blocks_json 解析失败，重新翻译");
            }
        }
    } else {
        log::info!("[CMD] 强制重新翻译，跳过历史缓存查找");
    }

    // 未命中缓存，调用 API 翻译
    log::info!("[CMD] translate_text: 未命中缓存，调用翻译 API...");
    let translated_text = crate::translate::call_text_api(
        &config.api_base_url,
        &api_key,
        &config.model,
        &text,
        &target_language,
        false,
        &config.api_provider, // 透传 API 提供商（openai/anthropic/gemini）
    )
    .await
    .map_err(|e| e.to_string())?;

    // 保存历史记录（无图片）
    let app_clone = app.clone();
    let text_clone = text.clone();
    let translated_clone = translated_text.clone();
    let target_language_clone = target_language.clone();

    // 构造 blocks_json 用于缓存
    let block = crate::translate::TranslatedBlock {
        original: text_clone.clone(),
        translated: translated_clone.clone(),
        x: 0.0,
        y: 0.0,
        width: 0.0,
        height: 0.0,
    };
    let blocks_json = serde_json::to_string(&vec![block]).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        match save_translation_history(
            &app_clone, None, &text_clone, &translated_clone,
            &target_language_clone, &blocks_json,
        ) {
            Ok(id) => log::info!("[CMD] 文本翻译历史已保存, id={}", id),
            Err(e) => log::error!("[CMD] 保存文本翻译历史失败: {}", e),
        }
    });

    Ok(crate::translate::TextTranslateResult {
        translated_text,
        from_cache: false,
    })
}

/// 在系统资源管理器中定位到指定路径
///
/// - 如果是文件：打开父目录并选中该文件
/// - 如果是目录：直接打开该目录
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    use std::process::Command;

    let path_obj = std::path::Path::new(&path);

    #[cfg(target_os = "windows")]
    {
        if path_obj.is_dir() {
            // 打开目录
            Command::new("explorer.exe")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("打开目录失败: {}", e))?;
        } else {
            // 定位到文件：使用 /select 参数
            Command::new("explorer.exe")
                .arg(format!("/select,{}", path))
                .spawn()
                .map_err(|e| format!("定位文件失败: {}", e))?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if path_obj.is_dir() {
            Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("打开目录失败: {}", e))?;
        } else {
            // 定位到文件
            Command::new("open")
                .arg("-R")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("定位文件失败: {}", e))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(if path_obj.is_dir() { path.as_ref() } else { path_obj.parent().unwrap_or(path_obj) })
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    Ok(())
}
