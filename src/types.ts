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
  model?: string
  createdAt: number
  status?: MessageStatus
  error?: string
  usage?: MessageUsage
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export interface ApiError extends Error {
  status?: number
  field?: string
}
