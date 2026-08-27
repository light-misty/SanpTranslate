// 配置模块入口
mod manager;

#[allow(unused_imports)]
pub use manager::{AppConfig, ConfigManager, QuickFillEntry, ShortcutConfig, resolve_language};
