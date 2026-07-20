// 翻译模块
// 支持 OpenAI 兼容 / Anthropic / Gemini 三种 API Provider 分发

// 三个子模块分别实现对应 Provider 的文本 API 调用
mod openai;
mod anthropic;
mod gemini;

use crate::error::AppError;
use crate::ocr::OcrBlock;
use serde::{Deserialize, Serialize};

/// 根据 api_provider 字符串解析出标准化的 provider 标识
/// 返回 "openai" / "anthropic" / "gemini"，未知值统一映射为 "openai"（向后兼容旧配置）
pub(super) fn resolve_provider(api_provider: &str) -> &'static str {
    match api_provider {
        "anthropic" => "anthropic",
        "gemini" => "gemini",
        _ => "openai",
    }
}

/// 翻译结果块
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslatedBlock {
    /// 原始文本
    pub original: String,
    /// 翻译后文本
    pub translated: String,
    /// 左上角 X 坐标（百分比 0.0-1.0）
    pub x: f64,
    /// 左上角 Y 坐标（百分比 0.0-1.0）
    pub y: f64,
    /// 宽度（百分比 0.0-1.0）
    pub width: f64,
    /// 高度（百分比 0.0-1.0）
    pub height: f64,
}

/// 翻译结果
#[derive(Debug, Clone, Serialize)]
pub struct TranslateResult {
    /// 翻译块列表
    pub blocks: Vec<TranslatedBlock>,
    /// 是否来自历史缓存（未调用API）
    #[serde(default)]
    pub from_cache: bool,
}

/// 纯文本翻译结果
#[derive(Debug, Clone, Serialize)]
pub struct TextTranslateResult {
    /// 翻译后的文本
    pub translated_text: String,
    /// 是否来自历史缓存（未调用API）
    #[serde(default)]
    pub from_cache: bool,
}

/// 使用预先提取的OCR块进行翻译（跳过OCR步骤，避免重复识别）
pub async fn translate_with_ocr_blocks(
    ocr_blocks: Vec<OcrBlock>,
    api_base_url: &str,
    api_key: &str,
    model: &str,
    target_language: &str,
    api_provider: &str,
) -> Result<TranslateResult, AppError> {
    if ocr_blocks.is_empty() {
        log::info!("[TRANSLATE] OCR块为空，返回空结果");
        return Ok(TranslateResult { blocks: Vec::new(), from_cache: false });
    }

    // 拼接所有OCR文字，用空行分隔（每个段落对应一个OCR块）
    let all_text = ocr_blocks
        .iter()
        .map(|b| b.text.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");

    log::debug!("[TRANSLATE] 使用预提取OCR文本（{}段落）: {}", ocr_blocks.len(), all_text);

    // 调用文本模型翻译，要求按段落返回（透传 api_provider 给 call_text_api）
    let translated_text = call_text_api(api_base_url, api_key, model, &all_text, target_language, true, api_provider).await?;

    // 将翻译结果按空行(\n\n)拆分为段落，与OCR块一一对应
    let translated_paragraphs: Vec<&str> = translated_text
        .split("\n\n")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    log::debug!("[TRANSLATE] 翻译结果（{}段落）: {}", translated_paragraphs.len(), translated_text);

    // 警告：翻译段落数与OCR块数不匹配的情况
    if translated_paragraphs.len() != ocr_blocks.len() {
        log::warn!(
            "[TRANSLATE] 翻译段落数({})与OCR块数({})不匹配",
            translated_paragraphs.len(),
            ocr_blocks.len()
        );
    }

    let translated_blocks: Vec<TranslatedBlock> = ocr_blocks
        .into_iter()
        .enumerate()
        .map(|(i, block)| {
            let translated = if i < translated_paragraphs.len() {
                translated_paragraphs[i].to_string()
            } else {
                String::new()
            };
            TranslatedBlock {
                original: block.text,
                translated,
                x: block.x,
                y: block.y,
                width: block.width,
                height: block.height,
            }
        })
        .collect();

    log::info!("[TRANSLATE] 预提取OCR翻译完成，共 {} 个块", translated_blocks.len());
    Ok(TranslateResult { blocks: translated_blocks, from_cache: false })
}

/// 调用文本模型API（按 api_provider 分发到具体 Provider 实现）
/// - api_provider: "openai"（默认）/ "anthropic" / "gemini"，未知值默认走 OpenAI 兼容（向后兼容）
/// - is_ocr_mode 为 true 时使用 OCR 多段落翻译提示词，为 false 时使用纯文本翻译提示词
pub async fn call_text_api(
    api_base_url: &str,
    api_key: &str,
    model: &str,
    text: &str,
    target_language: &str,
    is_ocr_mode: bool,
    api_provider: &str,
) -> Result<String, AppError> {
    // 根据 api_provider 解析出标准化 provider 标识后分发到对应的 API 实现
    let provider = resolve_provider(api_provider);
    match provider {
        "anthropic" => crate::translate::anthropic::call_anthropic_text_api(
            api_base_url, api_key, model, text, target_language, is_ocr_mode,
        )
        .await,
        "gemini" => crate::translate::gemini::call_gemini_text_api(
            api_base_url, api_key, model, text, target_language, is_ocr_mode,
        )
        .await,
        _ => crate::translate::openai::call_openai_text_api(
            api_base_url, api_key, model, text, target_language, is_ocr_mode,
        )
        .await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 验证 resolve_provider 对 "openai" 的解析
    #[test]
    fn test_resolve_provider_openai() {
        assert_eq!(resolve_provider("openai"), "openai");
    }

    /// 验证 resolve_provider 对 "anthropic" 的解析
    #[test]
    fn test_resolve_provider_anthropic() {
        assert_eq!(resolve_provider("anthropic"), "anthropic");
    }

    /// 验证 resolve_provider 对 "gemini" 的解析
    #[test]
    fn test_resolve_provider_gemini() {
        assert_eq!(resolve_provider("gemini"), "gemini");
    }

    /// 验证 resolve_provider 对未知值和空字符串回退到 "openai"（向后兼容）
    #[test]
    fn test_resolve_provider_unknown_falls_back_to_openai() {
        assert_eq!(resolve_provider("unknown"), "openai");
        assert_eq!(resolve_provider(""), "openai");
    }
}
