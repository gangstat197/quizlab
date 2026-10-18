import { jsonSchema } from '../shared/quiz.js';

// Stable multimodal model, verified with this app's generateContent JSON request.
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim().replace(/^models\//, '') || DEFAULT_GEMINI_MODEL;
}

export function buildGeminiRequest(parts) {
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: jsonSchema,
      maxOutputTokens: 32768,
    },
  };
}

export function geminiErrorMessage(status, data, apiKey) {
  const messages = {
    400: 'Gemini từ chối nội dung hoặc cấu hình yêu cầu.',
    401: 'Gemini API key không hợp lệ.',
    403: 'Gemini từ chối truy cập. Kiểm tra API key, quyền và khu vực.',
    404: 'Không tìm thấy Gemini model. Kiểm tra GEMINI_MODEL trong .env.',
    429: 'Gemini đã hết hạn mức hoặc đang quá tải. Kiểm tra quota và thử lại sau.',
  };
  let detail = typeof data?.error?.message === 'string' ? data.error.message : '';
  if (apiKey) detail = detail.replaceAll(apiKey, '[API key đã ẩn]');
  detail = detail.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[API key đã ẩn]').replace(/[\r\n\t]+/g, ' ').slice(0, 600);
  const message = messages[status] || 'Gemini tạm thời không khả dụng. Hãy thử lại sau.';
  return detail ? `${message} Chi tiết Google: ${detail}` : message;
}
