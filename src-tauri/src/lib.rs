mod capture;
mod clipboard;
mod commands;
mod config;
mod error;
mod history;
mod hotkey;
mod logging;
mod ocr;
mod quickfill;
mod translate;
mod tray;
mod update;
mod window;

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 在 tauri 初始化前执行日志目录初始化（过期清理）
    // 并获取当前会话的日志文件名（含时间戳，每次启动独立）
    let log_file_name = logging::init_before_tauri();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets({
                    // dev 模式：日志写入项目根目录/log/，便于开发时直接查看
                    // prod 模式：日志写入 OS 标准日志目录
                    #[cfg(debug_assertions)]
                    {
                        let dev_log_dir = logging::get_log_dir()
                            .expect("无法确定开发日志目录路径");
                        vec![
                            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                                path: dev_log_dir,
                                file_name: Some(log_file_name.clone()),
                            }),
                        ]
                    }

                    #[cfg(not(debug_assertions))]
                    {
                        vec![
                            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                                file_name: Some(log_file_name.into()),
                            }),
                        ]
                    }
                })
                .level({
                    // dev 模式 Debug 级别，prod 模式 Info 级别
                    #[cfg(debug_assertions)]
                    {
                        log::LevelFilter::Debug
                    }
                    #[cfg(not(debug_assertions))]
                    {
                        log::LevelFilter::Info
                    }
                })
                // 保留所有历史日志，配合应用层过期清理避免无限增长
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                // 单文件最大 10MB，超过后 tauri-plugin-log 自动创建新文件
                .max_file_size(10 * 1024 * 1024)
                // 使用本地时区，便于人工阅读
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        // 快捷键录制期间：将按键转发给前端录制组件，不执行业务功能
                        if hotkey::emit_recorded_shortcut(app, shortcut) {
                            return;
                        }
                        hotkey::handle_shortcut_event(app, shortcut);
                        quickfill::handle_quick_fill_shortcut(app, shortcut);
                    }
                })
                .build(),
        )
        .manage(Mutex::new(window::PinImageStore::default()))
        .manage(Mutex::new(window::CachedScreenStore::default()))
        .manage(Mutex::new(tray::TrayState::default()))
        .manage(std::sync::Arc::new(Mutex::new(quickfill::QuickFillShortcuts::default())))
        // 快捷键录制状态：录制期间全局快捷键按下改为转发事件，供前端 ShortcutInput 使用
        .manage(std::sync::Arc::new(Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::write_clipboard_image,
            commands::read_clipboard_image,
            commands::write_clipboard_text,
            commands::close_pin_window,
            commands::get_pin_image,
            commands::capture_region_from_cache,
            commands::get_overlay_image,
            commands::store_pin_image,
            commands::translate_image,
            commands::ocr_image,
            commands::translate_text,
            commands::get_api_key,
            commands::set_api_key,
            commands::delete_api_key,
            commands::get_config_path,
            commands::get_log_dir,
            commands::test_api_connection,
            commands::get_history_list,
            commands::get_history_detail,
            commands::delete_history,
            commands::clear_history,
            commands::restart_app,
            commands::reveal_in_explorer,
            commands::check_shortcut_conflict,
            commands::set_shortcut_recording,
            commands::save_quick_fills
        ])
        .setup(|app| {
            // 注册 updater 插件（必须在 setup 中注册，否则前端和后端都无法使用更新功能）
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            // 开发环境下自动禁用开机自启动，防止开发环境注册自启动项
            // 如果之前意外启用了自启动，启动时会自动清除
            #[cfg(debug_assertions)]
            {
                let autostart_manager = app.autolaunch();
                match autostart_manager.is_enabled() {
                    Ok(true) => {
                        log::warn!("[DEV] 检测到开发模式下自启动已启用，正在自动禁用...");
                        if let Err(e) = autostart_manager.disable() {
                            log::error!("[DEV] 禁用开发模式自启动失败: {}", e);
                        } else {
                            log::info!("[DEV] 已成功禁用开发模式自启动");
                        }
                    }
                    Ok(false) => {
                        log::debug!("[DEV] 开发模式下自启动未启用，无需处理");
                    }
                    Err(e) => {
                        log::warn!("[DEV] 检查开发模式自启动状态失败: {}", e);
                    }
                }
            }

            let config_manager = config::ConfigManager::new(app.handle())?;
            let app_config = config_manager.load()?;

            // 初始化并缓存截图服务
            let capture_service = capture::CaptureService::new()
                .map_err(|e| {
                    log::error!("初始化截图服务失败: {}", e);
                    #[cfg(target_os = "macos")]
                    log::warn!(
                        "[PERMISSION] 屏幕截图需要屏幕录制权限 (macOS 10.15+)。\
                         请前往 系统设置 > 隐私与安全性 > 屏幕录制 添加终端或本应用"
                    );
                    e
                })?;
            app.manage(Mutex::new(capture_service));

            // Linux: 检测是否运行在 Wayland 会话下
            #[cfg(target_os = "linux")]
            {
                let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
                let wayland_display = std::env::var("WAYLAND_DISPLAY").unwrap_or_default();
                if session_type == "wayland" || !wayland_display.is_empty() {
                    log::warn!(
                        "[WAYLAND] 检测到 Wayland 会话，部分功能可能受限。\
                         屏幕截图需要安装 xdg-desktop-portal 和 PipeWire"
                    );
                }
            }

            // 初始化历史记录服务（SQLite 数据库）
            let data_dir = app.path().app_data_dir()
                .map_err(|e| {
                    log::error!("获取应用数据目录失败: {}", e);
                    error::AppError::ConfigError(format!("获取应用数据目录失败: {}", e))
                })?;
            let db_path = data_dir.join("data").join("history.db");
            let history_service = history::HistoryService::new(&db_path)
                .map_err(|e| {
                    log::error!("初始化历史记录服务失败: {}", e);
                    e
                })?;
            app.manage(Mutex::new(history_service));

            tray::create_tray(app.handle(), &app_config.shortcuts, &app_config.language)?;

            // 启动剪贴板图片监控（缓存最近的图片，供 Ctrl+Alt+P 跳过文本粘贴图片）
            let clipboard_cache = clipboard::ClipboardImageCache::new();
            let watcher_cache = clipboard_cache.clone();
            app.manage(clipboard_cache);
            clipboard::start_clipboard_watcher(app.handle().clone(), watcher_cache);

            #[cfg(desktop)]
            hotkey::register_hotkeys(app.handle(), &app_config.shortcuts)?;

            // 注册快捷填充快捷键
            // 注册失败（如与其他程序冲突）仅记录日志，不影响应用启动；用户可在快捷填充页面重新配置
            #[cfg(desktop)]
            if let Err(e) = quickfill::register_quick_fill_shortcuts(app.handle(), &app_config.quick_fills) {
                log::error!("注册快捷填充快捷键失败: {}", e);
            }

            // 自动更新检查（仅 release 模式且开启了自动更新时执行）
            #[cfg(all(desktop, not(debug_assertions)))]
            {
                if app_config.auto_update {
                    let handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = update::check_and_install_update(&handle).await {
                            log::error!("自动更新检查失败: {}", e);
                        }
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
