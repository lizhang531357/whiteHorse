export const DEFAULT_SYSTEM_PROMPT =
  '你是白马AI，一个乐于助人的 AI 助手。用户消息后面可能附带从附件或链接中读取的内容，' +
  '也可能附带图片，请结合这些内容回答；如果提示某些附件读取失败，请如实告知用户。'

export const MODELS = [
  { value: '', label: '服务端默认', desc: '使用后端 .env 中配置的模型' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat', desc: '通用对话，速度快' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner', desc: '深度推理，展示思考过程' },
]

export const DEFAULT_SETTINGS = {
  model: '',
  baseUrl: '',
  temperature: 0.7,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
}

export const DEFAULT_USER = {
  id: 'guest',
  name: 'AI 体验官',
  email: 'demo@example.com',
  color: '#185fa5',
}
