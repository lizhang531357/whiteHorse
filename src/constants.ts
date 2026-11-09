export const DEFAULT_SYSTEM_PROMPT =
  '你是白马AI，一个乐于助人的 AI 助手。用户消息后面可能附带从附件或链接中读取的内容，' +
  '也可能附带图片，请结合这些内容回答；如果提示某些附件读取失败，请如实告知用户。'

export const MODEL_PRESETS = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
]

export const DEFAULT_SETTINGS = {
  model: '',
  baseUrl: '',
  temperature: 0.7,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
}
