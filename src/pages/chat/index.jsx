import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import Composer from '../../components/Composer'
import MessageItem from '../../components/MessageItem'
import { useChatContext } from '../../context/ChatContext'
import styles from './index.module.less'

const BOTTOM_THRESHOLD = 80

export default function Chat() {
  const {
    current,
    currentId,
    loading,
    regenerate,
    editMessage,
    deleteMessage,
  } = useChatContext()

  const messages = current?.messages || []
  const scrollRef = useRef(null)
  const stickRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const lastId = messages[messages.length - 1]?.id

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
    setAtBottom(true)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const last = messages[messages.length - 1]
    if (last?.role === 'user') stickRef.current = true
    if (stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    stickRef.current = true
    const raf = requestAnimationFrame(() => scrollToBottom('auto'))
    return () => cancelAnimationFrame(raf)
  }, [currentId, scrollToBottom])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const near = distance < BOTTOM_THRESHOLD
    stickRef.current = near
    setAtBottom(near)
  }

  function handleDelete(messageId) {
    Modal.confirm({
      title: '删除消息',
      content: '删除后无法恢复，确定继续吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMessage(currentId, messageId),
    })
  }

  const hour = new Date().getHours()
  const greeting = hour >= 6 && hour < 12 ? '上午好' : hour >= 12 && hour < 18 ? '下午好' : '晚上好'

  if (!current || messages.length === 0) {
    return (
      <div className={styles.chatPage}>
        <div className={styles.welcome}>
          <img className={styles.welcomeLogo} src="/logo.svg" alt="白马AI" />
          <h1>{greeting}，有什么可以帮到你吗？</h1>
          <p className={styles.subtitle}>可以上传文档、图片，或直接粘贴网页链接，Enter 发送</p>

          <Composer key={currentId || 'new'} />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.chatPage}>
      <div className={styles.messages} ref={scrollRef} onScroll={handleScroll}>
        <div className={styles.messageList}>
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              streaming={loading && message.id === lastId && message.role === 'assistant'}
              canOperate={!loading}
              onRegenerate={regenerate}
              onEdit={editMessage}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      {!atBottom && (
        <button
          type="button"
          className={styles.toBottom}
          onClick={() => scrollToBottom('smooth')}
          aria-label="回到底部"
        >
          <DownOutlined />
        </button>
      )}

      <div className={styles.footer}>
        <Composer key={currentId || 'new'} />
      </div>
    </div>
  )
}
