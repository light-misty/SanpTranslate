// 快捷填充模块：实现全局快捷键触发文本填充功能

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::config::QuickFillEntry;
use crate::error::AppError;

/// 当前已注册的快捷填充快捷键
pub struct QuickFillShortcuts {
    /// 快捷键到填充文本的映射
    pub entries: HashMap<Shortcut, String>,
}

impl Default for QuickFillShortcuts {
    fn default() -> Self {
        QuickFillShortcuts {
            entries: HashMap::new(),
        }
    }
}

/// 注册快捷填充快捷键
///
/// 注册前先注销自身的旧注册，避免 already-registered 冲突走脆弱重试路径；
/// 注册失败时收集错误信息，全部处理完成后统一返回错误，避免静默失败。
pub fn register_quick_fill_shortcuts(
    app: &tauri::AppHandle,
    entries: &[QuickFillEntry],
) -> Result<(), AppError> {
    let mut shortcuts_map = HashMap::new();
    // 收集注册失败的快捷键，最后统一返回错误，让前端感知失败项
    let mut errors: Vec<String> = Vec::new();

    for entry in entries {
        if entry.shortcut.is_empty() || entry.text.is_empty() {
            continue;
        }

        match crate::hotkey::parse_shortcut(&entry.shortcut) {
            Ok(shortcut) => {
                // 注册前先注销自身可能已存在的注册（如探测残留），避免 already-registered
                let _ = app.global_shortcut().unregister(shortcut);
                // Windows 上注销后立即重注册同一热键可能短暂失败，稍等系统释放
                std::thread::sleep(std::time::Duration::from_millis(100));

                match app.global_shortcut().register(shortcut) {
                    Ok(()) => {
                        log::info!(
                            "[QUICKFILL] 快捷填充快捷键注册成功: {} -> {}",
                            entry.shortcut,
                            entry.text.chars().take(20).collect::<String>()
                        );
                        shortcuts_map.insert(shortcut, entry.text.clone());
                    }
                    Err(e) => {
                        let msg = format!(
                            "[QUICKFILL] 快捷键 {} 注册失败（可能已被其他程序占用）: {}",
                            entry.shortcut, e
                        );
                        log::error!("{}", msg);
                        errors.push(msg);
                    }
                }
            }
            Err(e) => {
                let msg = format!("[QUICKFILL] 解析快捷键 {} 失败: {}", entry.shortcut, e);
                log::error!("{}", msg);
                errors.push(msg);
            }
        }
    }

    // 更新应用状态
    let state = app.state::<Arc<Mutex<QuickFillShortcuts>>>();
    let mut current = state.lock().map_err(|e| {
        AppError::ConfigError(format!("锁定 QuickFillShortcuts 失败: {}", e))
    })?;
    current.entries = shortcuts_map;

    if !errors.is_empty() {
        return Err(AppError::ConfigError(format!(
            "部分快捷填充快捷键注册失败: {}",
            errors.join("；")
        )));
    }

    Ok(())
}

/// 注销所有快捷填充快捷键
pub fn unregister_quick_fill_shortcuts(app: &tauri::AppHandle) {
    let state = app.state::<Arc<Mutex<QuickFillShortcuts>>>();
    if let Ok(current) = state.lock() {
        for shortcut in current.entries.keys() {
            let _ = app.global_shortcut().unregister(*shortcut);
        }
    }
}

/// 处理快捷填充快捷键事件
pub fn handle_quick_fill_shortcut(app: &tauri::AppHandle, shortcut: &Shortcut) {
    let pressed = crate::hotkey::shortcut_to_string(shortcut);
    let text_to_fill = {
        let state = match app.try_state::<Arc<Mutex<QuickFillShortcuts>>>() {
            Some(s) => s,
            None => {
                log::debug!("[QUICKFILL] 按键 {} 触发但快捷填充状态不存在，忽略", pressed);
                return;
            }
        };

        let current = match state.lock() {
            Ok(c) => c,
            Err(_) => {
                log::debug!("[QUICKFILL] 锁定快捷填充状态失败，忽略按键 {}", pressed);
                return;
            }
        };

        current.entries.get(shortcut).cloned()
    };

    match &text_to_fill {
        Some(text) => {
            log::info!(
                "[QUICKFILL] 快捷键 {} 命中映射，准备填充: {}",
                pressed,
                text.chars().take(20).collect::<String>()
            );
            fill_text_with_app(app, text);
        }
        None => {
            log::debug!("[QUICKFILL] 快捷键 {} 未命中任何快捷填充映射", pressed);
        }
    }
}

/// 填充文本到当前焦点输入框（需要 AppHandle 访问剪贴板）
/// 使用剪贴板 + 模拟粘贴的方式实现文本填充
pub fn fill_text_with_app(app: &tauri::AppHandle, text: &str) {
    log::info!(
        "[QUICKFILL] 开始填充文本: {}",
        text.chars().take(30).collect::<String>()
    );

    // 使用剪贴板方式填充：先保存当前剪贴板内容，设置文本到剪贴板，模拟粘贴，然后恢复剪贴板
    let previous_clipboard = crate::clipboard::read_clipboard_text(app).ok();
    log::debug!(
        "[QUICKFILL] 读取原剪贴板结果: {}",
        if previous_clipboard.is_some() { "成功" } else { "无内容或失败" }
    );

    // 写入要填充的文本到剪贴板
    if let Err(e) = crate::clipboard::write_clipboard_text(app, text) {
        log::error!("[QUICKFILL] 写入剪贴板失败: {}", e);
        return;
    }
    log::debug!("[QUICKFILL] 已写入剪贴板，开始模拟 Ctrl+V");

    // 模拟 Ctrl+V 粘贴
    simulate_paste();

    // 延迟恢复剪贴板内容（等待目标窗口完成粘贴，350ms 后恢复）
    if let Some(prev) = previous_clipboard {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(350));
            let result = crate::clipboard::write_clipboard_text(&app_clone, &prev);
            log::debug!("[QUICKFILL] 恢复原剪贴板结果: {}", if result.is_ok() { "成功" } else { "失败" });
        });
    }
}

/// 模拟 Ctrl+V 粘贴操作
fn simulate_paste() {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            keybd_event, KEYEVENTF_KEYUP, VK_CONTROL, VK_MENU, VK_V,
        };

        unsafe {
            // 全局快捷键触发瞬间 Ctrl/Alt 仍处于物理按下状态，
            // 若直接注入 Ctrl+V 会被目标窗口识别为 Ctrl+Alt+V 组合而不响应。
            // 因此先模拟释放修饰键，等待系统刷新后再注入干净的 Ctrl+V。
            keybd_event(VK_CONTROL as u8, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_MENU as u8, 0, KEYEVENTF_KEYUP, 0);
            std::thread::sleep(std::time::Duration::from_millis(30));
            // 按下 Ctrl
            keybd_event(VK_CONTROL as u8, 0, 0, 0);
            // 按下 V
            keybd_event(VK_V as u8, 0, 0, 0);
            // 释放 V
            keybd_event(VK_V as u8, 0, KEYEVENTF_KEYUP, 0);
            // 释放 Ctrl
            keybd_event(VK_CONTROL as u8, 0, KEYEVENTF_KEYUP, 0);
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS 使用 AppleScript 模拟粘贴
        use std::process::Command;
        let script = r#"tell application "System Events" to keystroke "v" using command down"#;
        let _ = Command::new("osascript").arg("-e").arg(script).output();
    }

    #[cfg(target_os = "linux")]
    {
        // Linux 使用 xdotool 模拟粘贴
        use std::process::Command;
        let _ = Command::new("xdotool").args(["key", "ctrl+v"]).output();
    }
}
