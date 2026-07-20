// Google Gemini API 调用模块（v1beta generateContent 端点）

use crate::error::AppError;

/// Gemini API 默认基础地址
const GEMINI_DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com";

/// 构建请求体 JSON（不包含网络相关逻辑）
/// - is_ocr_mode 为 true 时使用 OCR 多段落翻译提示词
/// - is_ocr_mode 为 false 时使用纯文本翻译提示词
pub(super) fn build_request_body(
    text: &str,
    target_language: &str,
    is_ocr_mode: bool,
    model: &str,
) -> serde_json::Value {
    // 根据翻译模式选择不同的系统提示词（与 OpenAI 逻辑保持一致）
    let system_prompt = if is_ocr_mode {
        "你是翻译助手。用户会发送多段文本，段落之间用空行分隔。请逐段翻译，每段翻译结果单独用空行分隔，段落数量必须与原文完全一致。保持原文中的换行结构不变。不要合并、拆分或增减段落。"
    } else {
        "你是翻译助手。请将用户发送的文本翻译为指定语言，保持原文的格式和换行。"
    };

    // 构造 Gemini generateContent 请求体
    // - system 独立为 systemInstruction.parts[0].text
    // - user 文本放入 contents[0].parts[0].text
    // - maxOutputTokens 固定 4096
    // 注意：model 参数不进入请求体（Gemini 在 URL 路径中携带 model），此处保留参数以与其他 Provider 签名一致
    let _ = model;
    serde_json::json!({
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": format!("将以下文本翻译为{}：\n{}", target_language, text)
                    }
                ]
            }
        ],
        "systemInstruction": {
            "parts": [
                {
                    "text": system_prompt
                }
            ]
        },
        "generationConfig": {
            "maxOutputTokens": 4096
        }
    })
}

/// 从响应 JSON 中提取译文文本
/// 按优先级尝试多种格式，兼容标准 Gemini 及部分兼容服务的非标准响应
pub(super) fn parse_response(json: &serde_json::Value) -> Result<String, AppError> {
    // 1. 尝试 Gemini 标准格式：candidates[0].content.parts[0].text
    if let Some(text) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
        return Ok(text.to_string());
    }

    // 2. 尝试 OpenAI 兼容格式（部分 Gemini 兼容服务可能返回此格式）：choices[0].message.content
    if let Some(text) = json["choices"][0]["message"]["content"].as_str() {
        log::info!("[TRANSLATE] Gemini响应采用 OpenAI 兼容格式解析成功");
        return Ok(text.to_string());
    }

    // 3. 尝试简化格式：candidates[0].content（直接为字符串）
    if let Some(text) = json["candidates"][0]["content"].as_str() {
        log::info!("[TRANSLATE] Gemini响应采用简化 content 字符串格式解析成功");
        return Ok(text.to_string());
    }

    // 4. 所有格式都失败，打印响应内容到日志便于排查，返回错误
    log::error!("[TRANSLATE] Gemini响应解析失败，响应内容: {}", json);
    Err(AppError::TranslateError("Gemini响应中缺少candidates字段".to_string()))
}

/// 调用 Gemini v1beta generateContent API
/// - is_ocr_mode 为 true 时使用 OCR 多段落翻译提示词
/// - is_ocr_mode 为 false 时使用纯文本翻译提示词
pub async fn call_gemini_text_api(
    api_base_url: &str,
    api_key: &str,
    model: &str,
    text: &str,
    target_language: &str,
    is_ocr_mode: bool,
) -> Result<String, AppError> {
    // base_url 为空时使用 Gemini 官方默认地址
    let base_url = if api_base_url.is_empty() {
        GEMINI_DEFAULT_BASE_URL
    } else {
        api_base_url
    };
    // 拼接 v1beta/models/{model}:generateContent 端点 URL
    let url = format!(
        "{}/v1beta/models/{}:generateContent",
        base_url.trim_end_matches('/'),
        model
    );

    // 复用提取出的纯函数构建请求体
    let request_body = build_request_body(text, target_language, is_ocr_mode, model);

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("x-goog-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await?;

    // 检查 HTTP 状态码，非 2xx 时返回错误（响应体一并带回方便诊断）
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::TranslateError(format!(
            "Gemini API请求失败，状态码: {}，响应: {}",
            status, body
        )));
    }

    let response_json: serde_json::Value = response.json().await?;

    // 复用提取出的纯函数解析响应
    parse_response(&response_json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 验证 Gemini 请求体结构：contents 数组长度 1、role=user、parts[0].text 包含原文；
    /// systemInstruction.parts[0].text 存在；generationConfig.maxOutputTokens=4096
    #[test]
    fn test_gemini_build_request_body() {
        // 构造请求体，验证关键字段
        let body = build_request_body("Hello", "zh-CN", true, "gemini-1.5-pro");

        // 验证 contents 数组长度为 1，role=user
        let contents = body["contents"].as_array().expect("contents 应为数组");
        assert_eq!(contents.len(), 1);
        assert_eq!(contents[0]["role"].as_str(), Some("user"));

        // 验证 parts[0].text 包含原文
        let parts = contents[0]["parts"].as_array().expect("parts 应为数组");
        assert!(parts.len() >= 1);
        let user_text = parts[0]["text"].as_str().expect("text 应为字符串");
        assert!(user_text.contains("Hello"));
        assert!(user_text.contains("zh-CN"));

        // 验证 systemInstruction.parts[0].text 存在且包含"翻译助手"
        let system_text = body["systemInstruction"]["parts"][0]["text"]
            .as_str()
            .expect("systemInstruction.parts[0].text 应为字符串");
        assert!(system_text.contains("翻译助手"));

        // 验证 generationConfig.maxOutputTokens 固定为 4096
        assert_eq!(body["generationConfig"]["maxOutputTokens"].as_i64(), Some(4096));
    }

    /// 验证成功响应可正确解析出译文
    #[test]
    fn test_gemini_parse_response_success() {
        // 构造 Gemini 成功响应，应解析得到 "こんにちは"
        let json = json!({
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": "こんにちは"
                            }
                        ]
                    }
                }
            ]
        });
        let result = parse_response(&json).expect("解析应成功");
        assert_eq!(result, "こんにちは");
    }

    /// 验证 candidates 为空数组时解析返回 Err
    #[test]
    fn test_gemini_parse_response_missing_candidates() {
        // candidates 为空数组时，解析应返回 Err
        let json = json!({
            "candidates": []
        });
        let result = parse_response(&json);
        assert!(result.is_err());
    }

    /// 验证 OpenAI 兼容格式响应（部分 Gemini 兼容服务可能返回）可正确解析
    #[test]
    fn test_gemini_parse_response_openai_compatible() {
        // 构造 OpenAI 格式响应
        let json = json!({
            "choices": [
                {
                    "message": {
                        "content": "你好"
                    }
                }
            ]
        });
        let result = parse_response(&json).expect("OpenAI 兼容格式应解析成功");
        assert_eq!(result, "你好");
    }

    /// 验证简化格式（candidates[0].content 为字符串）可正确解析
    #[test]
    fn test_gemini_parse_response_simplified_content() {
        // 构造简化格式响应
        let json = json!({
            "candidates": [
                {
                    "content": "你好"
                }
            ]
        });
        let result = parse_response(&json).expect("简化 content 格式应解析成功");
        assert_eq!(result, "你好");
    }

    /// 验证完全不包含任何已知字段的响应会返回 Err
    #[test]
    fn test_gemini_parse_response_unknown_format() {
        // 构造未知格式响应
        let json = json!({
            "some_unknown_field": "value"
        });
        let result = parse_response(&json);
        assert!(result.is_err());
    }
}
