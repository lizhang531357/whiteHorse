export type MessageRole = 'user' | 'assistant' | 'error'

export type MessageStatus = 'streaming' | 'done' | 'error'

export interface MessageFile {
  id?: string
  name: string
  size: number
  type: string
  preview?: string
}

export interface MessageUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  [key: string]: unknown
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  reasoning?: string
  files?: MessageFile[]
  promptContent?: string
  createdAt: number
  status?: MessageStatus
  error?: string
  usage?: MessageUsage
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface User {
  id: string
  name: string
  email: string
  color: string
  createdAt?: number
}

export interface Settings {
  model: string
  baseUrl: string
  temperature: number
  systemPrompt: string
}

export interface PendingFile {
  uid: string
  name: string
  size: number
  type: string
  file: File
  preview: string
}

export interface Draft {
  text: string
  files: PendingFile[]
}

export interface ApiError extends Error {
  status?: number
  field?: string
}

export interface ServerSettings extends Settings {
  hasApiKey: boolean
  apiKeyMasked: string
}
