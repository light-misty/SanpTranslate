// Anthropic Messages API 调用模块（/v1/messages 端点）

use crate::error::AppError;

/// Anthropic API 默认基础地址
pub(crate) const ANTHROPIC_DEFAULT_BASE_URL: &str = "https://api.anthropic.com";

/// 构建请求体 JSON（不包含网络相关逻辑）
/// - is_ocr_mode 为 true 时使用 OCR 多段落翻译提示词
/// - is_ocr_mode 为 false 时使用纯文本翻译提示词
pub(super) fn build_request_body(
    text: &str,
    target_language: &str,
    is_ocr_mode: bool,
    model: &str,
) -> serde_json::Value {
    // 复用 translate 模块的公共函数构建系统提示词与用户提示词
    let system_prompt = crate::translate::build_system_prompt(is_ocr_mode);
    let user_content = crate::translate::build_user_prompt(text, target_language);

    // 构造 Anthropic Messages API 请求体
    // - system 字段独立于 messages
    // - max_tokens 固定 4096
    // - user content 格式与 OpenAI 一致
    // - thinking 字段显式关闭
    serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": user_content
            }
        ],
        // 显式关闭思考链
        "thinking": {
            "type": "disabled"
        }
    })
}

/// 从响应 JSON 中提取译文文本
/// 按优先级尝试多种格式，兼容标准 Anthropic（含 thinking 块）及部分兼容服务（如 DeepSeek）的非标准响应
pub(super) fn parse_response(json: &serde_json::Value) -> Result<String, AppError> {
    // 1. 标准 Anthropic 格式：content 是数组，可能包含 thinking/text/tool_use 等多种块
    //    必须遍历找到 type == "text" 的块（thinking 块的字段是 thinking 而非 text）
    if let Some(content_arr) = json["content"].as_array() {
        // 遍历查找第一个 type == "text" 的块
        for block in content_arr {
            if block["type"].as_str() == Some("text") {
                if let Some(text) = block["text"].as_str() {
                    return Ok(text.to_string());
                }
            }
        }
        // 若数组非空但无 text 块（例如只有 thinking 块），记录警告日志便于诊断
        if !content_arr.is_empty() {
            log::warn!("[TRANSLATE] Anthropic响应 content 数组中未找到 type=text 的块，块类型: {:?}",
                content_arr.iter().filter_map(|b| b["type"].as_str()).collect::<Vec<_>>());
        }
    }

    // 2. 尝试 OpenAI 兼容格式（部分 Anthropic 兼容服务如 DeepSeek 可能返回此格式）：choices[0].message.content
    if let Some(text) = json["choices"][0]["message"]["content"].as_str() {
        log::info!("[TRANSLATE] Anthropic响应采用 OpenAI 兼容格式解析成功");
        return Ok(text.to_string());
    }

    // 3. 尝试 content 作为字符串（某些简化实现可能直接返回字符串）
    if let Some(text) = json["content"].as_str() {
        log::info!("[TRANSLATE] Anthropic响应采用 content 字符串格式解析成功");
        return Ok(text.to_string());
    }

    // 4. 所有格式都失败，打印响应内容到日志便于排查，返回错误
    log::error!("[TRANSLATE] Anthropic响应解析失败，响应内容: {}", json);
    Err(AppError::TranslateError("Anthropic响应中缺少content字段".to_string()))
}

/// 调用 Anthropic Messages API（/v1/messages 端点）
/// - is_ocr_mode 为 true 时使用 OCR 多段落翻译提示词
/// - is_ocr_mode 为 false 时使用纯文本翻译提示词
pub async fn call_anthropic_text_api(
    api_base_url: &str,
    api_key: &str,
    model: &str,
    text: &str,
    target_language: &str,
    is_ocr_mode: bool,
) -> Result<String, AppError> {
    // base_url 为空时使用 Anthropic 官方默认地址
    let base_url = if api_base_url.is_empty() {
        ANTHROPIC_DEFAULT_BASE_URL
    } else {
        api_base_url
    };
    // 拼接 v1/messages 端点 URL，去除 base_url 末尾的斜杠
    let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));

    // 复用提取出的纯函数构建请求体
    let request_body = build_request_body(text, target_language, is_ocr_mode, model);

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
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
            "Anthropic API请求失败，状态码: {}，响应: {}",
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

    /// 验证 Anthropic 请求体结构：model、max_tokens=4096、system 字段、messages 数组长度 1
    #[test]
    fn test_anthropic_build_request_body() {
        // 构造请求体，验证关键字段
        let body = build_request_body("Hello", "zh-CN", true, "claude-3-5-sonnet-20241022");

        // 验证 model 字段
        assert_eq!(body["model"].as_str(), Some("claude-3-5-sonnet-20241022"));

        // 验证 max_tokens 固定为 4096
        assert_eq!(body["max_tokens"].as_i64(), Some(4096));

        // 验证 system 字段存在且为字符串
        let system = body["system"].as_str().expect("system 应为字符串");
        assert!(system.contains("翻译助手"));

        // 验证 messages 数组长度为 1，role=user
        let messages = body["messages"].as_array().expect("messages 应为数组");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"].as_str(), Some("user"));

        // 验证 user content 包含目标语言和原文
        let user_content = messages[0]["content"].as_str().expect("content 应为字符串");
        assert!(user_content.contains("zh-CN"));
        assert!(user_content.contains("Hello"));

        // 验证 thinking 字段已显式关闭
        assert_eq!(body["thinking"]["type"], "disabled");
    }

    /// 验证成功响应可正确解析出译文
    #[test]
    fn test_anthropic_parse_response_success() {
        // 构造 Anthropic 成功响应，应解析得到 "你好"
        let json = json!({
            "content": [
                {
                    "type": "text",
                    "text": "你好"
                }
            ]
        });
        let result = parse_response(&json).expect("解析应成功");
        assert_eq!(result, "你好");
    }

    /// 验证 content 为空数组时解析返回 Err
    #[test]
    fn test_anthropic_parse_response_missing_content() {
        // content 为空数组时，解析应返回 Err
        let json = json!({
            "content": []
        });
        let result = parse_response(&json);
        assert!(result.is_err());
    }

    /// 验证 OpenAI 兼容格式响应（如 DeepSeek 的 Anthropic 兼容端点可能返回）可正确解析
    #[test]
    fn test_anthropic_parse_response_openai_compatible() {
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

    /// 验证 content 作为字符串的简化格式可正确解析
    #[test]
    fn test_anthropic_parse_response_content_string() {
        // 构造 content 为字符串的简化响应
        let json = json!({
            "content": "你好"
        });
        let result = parse_response(&json).expect("content 字符串格式应解析成功");
        assert_eq!(result, "你好");
    }

    /// 验证完全不包含任何已知字段的响应会返回 Err 并打印日志
    #[test]
    fn test_anthropic_parse_response_unknown_format() {
        // 构造未知格式响应
        let json = json!({
            "some_unknown_field": "value"
        });
        let result = parse_response(&json);
        assert!(result.is_err());
    }

    /// 验证 content 数组包含 thinking 块和 text 块时，能正确跳过 thinking 块提取 text 块的文本
    /// 此场景对应 DeepSeek-V4 启用 thinking（思考链）功能的实际响应
    #[test]
    fn test_anthropic_parse_response_with_thinking_block() {
        // 构造包含 thinking 块和 text 块的响应（DeepSeek-V4 实际响应格式）
        let json = json!({
            "content": [
                {
                    "signature": "86e5ab16-1dad-4a12-bd4a-4ef0700323b9",
                    "thinking": "我们要求将英文Introduction翻译为中文...",
                    "type": "thinking"
                },
                {
                    "text": "引言",
                    "type": "text"
                }
            ],
            "id": "86e5ab16-1dad-4a12-bd4a-4ef0700323b9",
            "model": "deepseek-v4-flash",
            "role": "assistant",
            "stop_reason": "end_turn",
            "type": "message"
        });
        let result = parse_response(&json).expect("含 thinking 块的响应应解析成功，提取 text 块内容");
        assert_eq!(result, "引言");
    }

    /// 验证 content 数组只有 thinking 块（无 text 块）时返回 Err
    #[test]
    fn test_anthropic_parse_response_only_thinking_block() {
        // 构造只有 thinking 块的响应
        let json = json!({
            "content": [
                {
                    "thinking": "思考中...",
                    "type": "thinking"
                }
            ]
        });
        let result = parse_response(&json);
        assert!(result.is_err());
    }

    /// 验证 content 数组中 text 块在前、thinking 块在后的顺序也能正确提取
    #[test]
    fn test_anthropic_parse_response_text_before_thinking() {
        // 构造 text 块在前的响应
        let json = json!({
            "content": [
                {
                    "text": "你好",
                    "type": "text"
                },
                {
                    "thinking": "思考中...",
                    "type": "thinking"
                }
            ]
        });
        let result = parse_response(&json).expect("应解析成功");
        assert_eq!(result, "你好");
    }
}
