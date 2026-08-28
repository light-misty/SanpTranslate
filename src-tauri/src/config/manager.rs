// 配置管理器实现

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// 快捷键配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ShortcutConfig {
    /// 截图翻译快捷键
    pub capture: String,
    /// 固定到剪贴板快捷键
    pub pin_clipboard: String,
    /// 文本翻译快捷键
    pub text_translate: String,
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        ShortcutConfig {
            capture: "Ctrl+Alt+L".to_string(),
            pin_clipboard: "Ctrl+Alt+P".to_string(),
            text_translate: "Ctrl+Alt+M".to_string(),
        }
    }
}

/// 快捷填充条目：快捷键与填充文本的映射
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickFillEntry {
    /// 快捷键（如 "Ctrl+Alt+1"）
    pub shortcut: String,
    /// 填充文本内容
    pub text: String,
}

impl Default for QuickFillEntry {
    fn default() -> Self {
        QuickFillEntry {
            shortcut: String::new(),
            text: String::new(),
        }
    }
}

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// API 提供商类型（"openai" / "anthropic" / "gemini"）
    pub api_provider: String,
    /// API 基础地址
    pub api_base_url: String,
    /// AI 模型名称
    pub model: String,
    /// 目标语言
    pub target_language: String,
    /// 界面语言（"auto" 表示跟随系统，"zh-CN" 或 "en-US"）
    pub language: String,
    /// OCR 识别语言（"eng", "chi_sim", "jpn"）
    pub ocr_language: String,
    /// 是否开启自动更新
    pub auto_update: bool,
    /// 快捷键配置
    pub shortcuts: ShortcutConfig,
    /// 快捷填充条目列表
    pub quick_fills: Vec<QuickFillEntry>,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            api_provider: "openai".to_string(),
            api_base_url: String::new(),
            model: String::new(),
            target_language: "zh-CN".to_string(),
            language: "auto".to_string(),
            ocr_language: "auto".to_string(),
            auto_update: true,
            shortcuts: ShortcutConfig::default(),
            quick_fills: Vec::new(),
        }
    }
}

/// 解析界面语言：若为 "auto" 则根据系统语言自动推断，否则原样返回
pub fn resolve_language(language: &str) -> String {
    if language == "auto" {
        let sys_lang = sys_locale::get_locale().unwrap_or_else(|| "en-US".to_string());
        if sys_lang.starts_with("zh") {
            "zh-CN".to_string()
        } else {
            "en-US".to_string()
        }
    } else {
        language.to_string()
    }
}

/// 配置管理器，负责配置文件的读写
pub struct ConfigManager {
    /// 配置文件所在目录
    config_dir: PathBuf,
    /// 配置文件完整路径
    config_path: PathBuf,
}

impl ConfigManager {
    /// 创建配置管理器实例
    pub fn new(app: &tauri::AppHandle) -> Result<Self, AppError> {
        let config_dir = app
            .path()
            .app_config_dir()
            .map_err(|e| AppError::ConfigError(format!("无法获取配置目录: {}", e)))?;

        let config_path = config_dir.join("config.toml");

        Ok(ConfigManager {
            config_dir,
            config_path,
        })
    }

    /// 加载配置，若配置文件不存在则创建默认配置
    pub fn load(&self) -> Result<AppConfig, AppError> {
        if !self.config_path.exists() {
            let default_config = AppConfig::default();
            self.save(&default_config)?;
            return Ok(default_config);
        }

        let content = fs::read_to_string(&self.config_path)?;
        let config: AppConfig = toml::from_str(&content)?;
        Ok(config)
    }

    /// 保存配置，使用原子写入避免写入过程中损坏
    pub fn save(&self, config: &AppConfig) -> Result<(), AppError> {
        fs::create_dir_all(&self.config_dir)?;

        let content = toml::to_string_pretty(config)?;

        // 原子写入：先写临时文件，再重命名
        let temp_path = self.config_path.with_extension("toml.tmp");
        fs::write(&temp_path, &content)?;
        fs::rename(&temp_path, &self.config_path)?;

        Ok(())
    }

    /// 获取配置文件完整路径（用于前端显示）
    pub fn get_config_path(&self) -> &PathBuf {
        &self.config_path
    }

    /// 从系统密钥环读取 API 密钥
    /// 密钥不存在时返回 Ok(None)，密钥环不可用时返回友好错误
    pub fn get_api_key(&self) -> Result<Option<String>, AppError> {
        let entry = keyring::Entry::new("SnapTranslate", "api_key")
            .map_err(|e| AppError::ConfigError(format!("无法访问系统密钥环: {}", e)))?;

        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::ConfigError(format!(
                "读取 API 密钥失败: {}",
                e
            ))),
        }
    }

    /// 将 API 密钥写入系统密钥环
    /// 若密钥为空字符串则调用 delete_api_key 删除
    pub fn set_api_key(&self, key: &str) -> Result<(), AppError> {
        if key.is_empty() {
            return self.delete_api_key();
        }

        let entry = keyring::Entry::new("SnapTranslate", "api_key")
            .map_err(|e| AppError::ConfigError(format!("无法访问系统密钥环: {}", e)))?;

        entry
            .set_password(key)
            .map_err(|e| AppError::ConfigError(format!("保存 API 密钥失败: {}", e)))?;

        Ok(())
    }

    /// 从系统密钥环删除 API 密钥
    /// 密钥不存在时静默返回 Ok(())
    pub fn delete_api_key(&self) -> Result<(), AppError> {
        let entry = keyring::Entry::new("SnapTranslate", "api_key")
            .map_err(|e| AppError::ConfigError(format!("无法访问系统密钥环: {}", e)))?;

        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::ConfigError(format!(
                "删除 API 密钥失败: {}",
                e
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 验证 AppConfig 默认值的 api_provider 为 "openai"
    /// 保证旧版本配置在升级后默认走 OpenAI 兼容路径
    #[test]
    fn test_app_config_default_api_provider() {
        let config = AppConfig::default();
        assert_eq!(config.api_provider, "openai");
    }

    /// 验证缺失 api_provider 字段的旧配置 TOML 反序列化时回退到 "openai"
    /// 即 #[serde(default)] 在字段缺失场景下生效，确保向后兼容
    #[test]
    fn test_app_config_deserialize_missing_api_provider() {
        // 构造一段不含 api_provider 字段的 TOML（模拟旧版本配置文件）
        let toml_str = r#"
            api_base_url = "https://api.example.com"
            model = "gpt-4o"
        "#;
        let config: AppConfig = toml::from_str(toml_str).expect("反序列化应成功");
        assert_eq!(config.api_provider, "openai");
        // 顺便验证其他字段确实来自 TOML 而非默认值
        assert_eq!(config.api_base_url, "https://api.example.com");
        assert_eq!(config.model, "gpt-4o");
    }
}
