// 快捷填充模块：实现全局快捷键触发文本填充功能

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

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
pub fn register_quick_fill_shortcuts(
    app: &tauri::AppHandle,
    entries: &[QuickFillEntry],
) -> Result<(), AppError> {
    let mut shortcuts_map = HashMap::new();

    for entry in entries {
        if entry.shortcut.is_empty() || entry.text.is_empty() {
            continue;
        }

        match parse_quick_fill_shortcut(&entry.shortcut) {
            Ok(shortcut) => {
                // 尝试注册快捷键
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
                        let err_str = e.to_string();
                        if err_str.contains("already registered") {
                            log::warn!(
                                "[QUICKFILL] 快捷键 {} 已被占用，尝试注销后重试...",
                                entry.shortcut
                            );
                            // 先注销再重试
                            let _ = app.global_shortcut().unregister(shortcut);
                            std::thread::sleep(std::time::Duration::from_millis(200));
                            match app.global_shortcut().register(shortcut) {
                                Ok(()) => {
                                    log::info!("[QUICKFILL] 快捷键 {} 重新注册成功", entry.shortcut);
                                    shortcuts_map.insert(shortcut, entry.text.clone());
                                }
                                Err(e2) => {
                                    log::error!(
                                        "[QUICKFILL] 快捷键 {} 注册失败: {}",
                                        entry.shortcut,
                                        e2
                                    );
                                }
                            }
                        } else {
                            log::error!("[QUICKFILL] 快捷键 {} 注册失败: {}", entry.shortcut, e);
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("[QUICKFILL] 解析快捷键 {} 失败: {}", entry.shortcut, e);
            }
        }
    }

    // 更新应用状态
    let state = app.state::<Arc<Mutex<QuickFillShortcuts>>>();
    let mut current = state.lock().map_err(|e| {
        AppError::ConfigError(format!("锁定 QuickFillShortcuts 失败: {}", e))
    })?;
    current.entries = shortcuts_map;

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
    let text_to_fill = {
        let state = match app.try_state::<Arc<Mutex<QuickFillShortcuts>>>() {
            Some(s) => s,
            None => return,
        };

        let current = match state.lock() {
            Ok(c) => c,
            Err(_) => return,
        };

        current.entries.get(shortcut).cloned()
    };

    if let Some(text) = text_to_fill {
        log::info!(
            "[QUICKFILL] 快捷键触发，准备填充文本: {}",
            text.chars().take(30).collect::<String>()
        );
        fill_text_with_app(app, &text);
    }
}

/// 解析快捷填充快捷键字符串
fn parse_quick_fill_shortcut(shortcut_str: &str) -> Result<Shortcut, AppError> {
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

/// 解析按键名称到 Code
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

    Err(AppError::ConfigError(format!("不支持的按键: {}", key)))
}

/// 填充文本到当前焦点输入框（需要 AppHandle 访问剪贴板）
/// 使用剪贴板 + 模拟粘贴的方式实现文本填充
pub fn fill_text_with_app(app: &tauri::AppHandle, text: &str) {
    // 使用剪贴板方式填充：先保存当前剪贴板内容，设置文本到剪贴板，模拟粘贴，然后恢复剪贴板
    let previous_clipboard = crate::clipboard::read_clipboard_text(app).ok();

    // 写入要填充的文本到剪贴板
    if let Err(e) = crate::clipboard::write_clipboard_text(app, text) {
        log::error!("[QUICKFILL] 写入剪贴板失败: {}", e);
        return;
    }

    // 模拟 Ctrl+V 粘贴
    simulate_paste();

    // 延迟恢复剪贴板内容
    if let Some(prev) = previous_clipboard {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            let _ = crate::clipboard::write_clipboard_text(&app_clone, &prev);
        });
    }
}

/// 模拟 Ctrl+V 粘贴操作
fn simulate_paste() {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            keybd_event, KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
        };

        unsafe {
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
