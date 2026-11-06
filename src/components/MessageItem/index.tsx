import { lazy, Suspense, useMemo, useState } from 'react'
import { Button, Image, Input, Modal, Spin, Tag, Tooltip, message as antdMessage } from 'antd'
import {
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  FileTextOutlined,
  PictureOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { formatSize, isImageFile } from '../../utils/file'
import styles from './index.module.less'

const MarkdownRenderer = lazy(() => import('../MarkdownRenderer'))

const MessageFiles = ({ files = [] }) => {
  if (!files.length) return null
  return (
    <div className={styles.files}>
      {files.map((file, index) => {
        const isImage = isImageFile(file)
        const href = file.id ? `/api/files/${file.id}` : ''

        if (isImage && file.preview) {
          return (
            <div key={`${file.name}-${index}`} className={styles.imageItem}>
              <Image
                src={file.preview}
                width={72}
                height={72}
                className={styles.imageThumb}
                preview={{ src: file.preview }}
              />
              {href && (
                <Button
                  type="link"
                  size="small"
                  className={styles.downloadBtn}
                  icon={<DownloadOutlined />}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  原图
                </Button>
              )}
            </div>
          )
        }

        if (href) {
          return (
            <Button
              key={`${file.name}-${index}`}
              size="small"
              className={styles.fileButton}
              icon={isImage ? <PictureOutlined /> : <FileTextOutlined />}
              href={href}
              target="_blank"
              rel="noreferrer"
              title={`${file.name} · ${formatSize(file.size)}`}
            >
              <span className={styles.fileName}>{file.name}</span>
              <DownloadOutlined className={styles.downloadIcon} />
            </Button>
          )
        }

        return (
          <Tag
            key={`${file.name}-${index}`}
            className={styles.fileTag}
            icon={isImage ? <PictureOutlined /> : <FileTextOutlined />}
            title={`${file.name} · ${formatSize(file.size)}`}
          >
            <span className={styles.fileName}>{file.name}</span>
          </Tag>
        )
      })}
    </div>
  )
}

const MessageItem = ({
  message,
  streaming = false,
  canOperate = true,
  onRegenerate,
  onEdit,
  onDelete,
}) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content || '')
  const [copied, setCopied] = useState(false)
  const [showReasoning, setShowReasoning] = useState(false)

  const isUser = message.role === 'user'
  const isError = message.role === 'error'
  const hasReasoning = Boolean(message.reasoning)

  const copyText = useMemo(() => message.content || '', [message.content])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      antdMessage.success('已复制')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      antdMessage.error('复制失败')
    }
  }

  const startEdit = () => {
    setDraft(message.content || '')
    setEditing(true)
  }

  const saveEdit = () => {
    const text = draft.trim()
    if (!text) return

    Modal.confirm({
      title: '编辑并重新发送',
      content: '保存后会删除这条消息之后的所有内容，并重新请求模型，确定继续吗？',
      okText: '继续',
      cancelText: '取消',
      onOk: async () => {
        setEditing(false)
        await onEdit?.(message.id, text)
      },
    })
  }

  if (isError) {
    return (
      <div className={`${styles.message} ${styles.error}`}>
        <div className={styles.body}>
          <div className={styles.errorText}>{message.content}</div>
          <div className={styles.actions}>
            <Tooltip title="重试">
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                disabled={!canOperate}
                onClick={() => onRegenerate?.(message.id)}
              >
                重试
              </Button>
            </Tooltip>
            <Tooltip title="删除">
              <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => onDelete?.(message.id)} />
            </Tooltip>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      {!isUser && (
        <div className={styles.avatar}>
          <img src="/logo.svg" alt="白马AI" />
        </div>
      )}

      <div className={styles.body}>
        <MessageFiles files={message.files} />

        {!isUser && hasReasoning && (
          <div className={styles.reasoning}>
            <Button
              type="text"
              size="small"
              className={styles.reasoningToggle}
              icon={showReasoning ? <DownOutlined /> : <RightOutlined />}
              onClick={() => setShowReasoning((v) => !v)}
            >
              {streaming && !message.content ? '正在思考…' : '思考过程'}
            </Button>
            {showReasoning && <div className={styles.reasoningBody}>{message.reasoning}</div>}
          </div>
        )}

        {editing ? (
          <div className={styles.editor}>
            <div className={styles.editorTitle}>
              <EditOutlined />
              编辑消息
            </div>
            <Input.TextArea
              className={styles.editorInput}
              autoSize={{ minRows: 3, maxRows: 10 }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className={styles.editorHint}>保存后会删除这条消息之后的内容，并重新请求模型</div>
            <div className={styles.editorActions}>
              <Button size="small" onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button size="small" type="primary"  onClick={saveEdit}>
                保存并重新发送
              </Button>
            </div>
          </div>
        ) : isUser ? (
          message.content && <div className={styles.plainText}>{message.content}</div>
        ) : streaming && !message.content ? (
          <div className={styles.thinking}>
            <Spin size="small" />
            <span>思考中…</span>
          </div>
        ) : (
          <div className={styles.answer}>
            <Suspense fallback={<div className={styles.plainAnswer}>{message.content}</div>}>
              <MarkdownRenderer content={message.content} />
            </Suspense>
            {streaming && <span className={styles.cursor} />}
            {message.error && <div className={styles.streamError}>{message.error}</div>}
          </div>
        )}

        {!isUser && !streaming && message.usage && (
          <div className={styles.usage}>
            输入 {message.usage.prompt_tokens ?? '-'} · 输出{' '}
            {message.usage.completion_tokens ?? '-'} · 共 {message.usage.total_tokens ?? '-'} tokens
          </div>
        )}

        {!editing && !streaming && (
          <div className={styles.actions}>
            <Tooltip title={copied ? '已复制' : '复制'}>
              <Button
                type="text"
                size="small"
                icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                onClick={handleCopy}
              />
            </Tooltip>
            {!isUser && (
              <Tooltip title="重新生成">
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  disabled={!canOperate}
                  onClick={() => onRegenerate?.(message.id)}
                />
              </Tooltip>
            )}
            {isUser && (
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined />} disabled={!canOperate} onClick={startEdit} />
              </Tooltip>
            )}
            <Tooltip title="删除">
              <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => onDelete?.(message.id)} />
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageItem
