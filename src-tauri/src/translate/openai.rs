// OpenAI 兼容格式 API 调用模块

use crate::error::AppError;

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

    // 构建 OpenAI chat/completions 请求体（system + user 两条 message）
    serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": user_content
            }
        ]
    })
}

/// 从响应 JSON 中提取译文文本
pub(super) fn parse_response(json: &serde_json::Value) -> Result<String, AppError> {
    // 从 choices[0].message.content 提取译文文本
    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::TranslateError("文本模型响应中缺少content字段".to_string()))
}

/// 调用 OpenAI 兼容的文本模型 API（/chat/completions 端点）
/// - is_ocr_mode 为 true 时使用 OCR 多段落翻译提示词
/// - is_ocr_mode 为 false 时使用纯文本翻译提示词
pub async fn call_openai_text_api(
    api_base_url: &str,
    api_key: &str,
    model: &str,
    text: &str,
    target_language: &str,
    is_ocr_mode: bool,
) -> Result<String, AppError> {
    // 拼接 chat/completions 端点 URL，去除 base_url 末尾的斜杠以避免双斜杠
    let url = format!("{}/chat/completions", api_base_url.trim_end_matches('/'));

    // 复用提取出的纯函数构建请求体
    let request_body = build_request_body(text, target_language, is_ocr_mode, model);

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await?;

    // 检查 HTTP 状态码，非 2xx 时返回错误
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::TranslateError(format!(
            "文本模型API请求失败，状态码: {}，响应: {}",
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

    /// 验证 OCR 模式下请求体结构：messages 数组长度 2、role 正确、内容包含关键词
    #[test]
    fn test_openai_build_request_body_ocr_mode() {
        // is_ocr_mode=true 时验证 OCR 模式请求体结构
        let body = build_request_body("Hello", "zh-CN", true, "gpt-4o");

        // 验证 model 字段
        assert_eq!(body["model"].as_str(), Some("gpt-4o"));

        // 验证 messages 数组长度为 2
        let messages = body["messages"].as_array().expect("messages 应为数组");
        assert_eq!(messages.len(), 2);

        // 第一条 role=system，内容包含"翻译助手"
        assert_eq!(messages[0]["role"].as_str(), Some("system"));
        let system_content = messages[0]["content"].as_str().expect("system content 应为字符串");
        assert!(system_content.contains("翻译助手"));

        // 第二条 role=user，内容包含目标语言和原文
        assert_eq!(messages[1]["role"].as_str(), Some("user"));
        let user_content = messages[1]["content"].as_str().expect("user content 应为字符串");
        assert!(user_content.contains("zh-CN"));
        assert!(user_content.contains("Hello"));
    }

    /// 验证纯文本模式下 system 提示词为纯文本翻译版本
    #[test]
    fn test_openai_build_request_body_text_mode() {
        // is_ocr_mode=false 时使用纯文本翻译提示词
        let body = build_request_body("Hello", "zh-CN", false, "gpt-4o");

        let messages = body["messages"].as_array().expect("messages 应为数组");
        let system_content = messages[0]["content"].as_str().expect("system content 应为字符串");

        // 纯文本模式下 system 提示词应包含"翻译为指定语言"
        assert!(system_content.contains("翻译为指定语言"));
    }

    /// 验证成功响应可正确解析出译文
    #[test]
    fn test_openai_parse_response_success() {
        // 构造成功的响应 JSON，应解析得到 "hello"
        let json = json!({
            "choices": [
                {
                    "message": {
                        "content": "hello"
                    }
                }
            ]
        });
        let result = parse_response(&json).expect("解析应成功");
        assert_eq!(result, "hello");
    }

    /// 验证 choices 为空数组时解析返回 Err
    #[test]
    fn test_openai_parse_response_missing_content() {
        // choices 为空数组时，解析应返回 Err
        let json = json!({
            "choices": []
        });
        let result = parse_response(&json);
        assert!(result.is_err());
    }
}
