import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, Tooltip } from 'antd'
import { DownOutlined, ShareAltOutlined } from '@ant-design/icons'
import Composer from '../../components/Composer'
import MessageItem from '../../components/MessageItem'
import QuestionNav from '../../components/QuestionNav'
import ShareModal from '../../components/ShareModal'
import { useChatContext } from '../../context/ChatContext'
import { eventEmit } from '../../utils/event-bus'
import styles from './index.module.less'

const BOTTOM_THRESHOLD = 80

const Chat = () => {
  const {
    current,
    currentId,
    loading,
    regenerate,
    editMessage,
    deleteMessage,
    settings,
  } = useChatContext()

  const messages = current?.messages || []
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const lastUserIdRef = useRef<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [shareOpen, setShareOpen] = useState(false)

  const questions = useMemo(
    () =>
      messages
        .filter((item) => item.role === 'user')
        .map((item) => ({
          id: item.id,
          content: item.content?.trim() || '（附件消息）',
        })),
    [messages],
  )

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
    setAtBottom(true)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // 用户消息和 AI 占位消息可能在同一批渲染里到达，
    // 因此用「最后一条用户消息 id」判断是否是新发送，而不是只看最后一条消息角色。
    const lastUser = [...messages].reverse().find((item) => item.role === 'user')
    if (lastUser && lastUser.id !== lastUserIdRef.current) {
      lastUserIdRef.current = lastUser.id
      stickRef.current = true
    }
    if (stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    stickRef.current = true
    const raf = requestAnimationFrame(() => scrollToBottom('auto'))
    return () => cancelAnimationFrame(raf)
  }, [currentId, scrollToBottom])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const near = distance < BOTTOM_THRESHOLD
    stickRef.current = near
    setAtBottom(near)
  }

  const handleDelete = useCallback(
    (messageId) => {
      Modal.confirm({
        title: '删除消息',
        content: '删除后无法恢复，确定继续吗？',
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => deleteMessage(currentId, messageId),
      })
    },
    [currentId, deleteMessage],
  )

  const hour = new Date().getHours()
  const greeting = hour >= 6 && hour < 12 ? '上午好' : hour >= 12 && hour < 18 ? '下午好' : '晚上好'

  const shareButton = (
    <Tooltip title="分享访问链接">
      <Button
        className={styles.shareBtn}
        shape="circle"
        icon={<ShareAltOutlined />}
        onClick={() => setShareOpen(true)}
        aria-label="分享访问链接"
      />
    </Tooltip>
  )

  const openSettings = () => {
    eventEmit('open-settings', { tab: 'model' })
  }

  const modelHint = !settings.model && (
    <div className={styles.modelHint}>
      <span>还没有配置模型，请先在「系统设置 → 模型管理」中添加并选择模型</span>
      <Button type="primary" size="small" onClick={openSettings}>
        添加模型
      </Button>
    </div>
  )

  if (!current || messages.length === 0) {
    return (
      <div className={styles.chatPage}>
        {shareButton}

        <div className={styles.welcome}>
          <img className={styles.welcomeLogo} src="/logo.svg" alt="白马AI" />
          <h1>{greeting}，有什么可以帮到你吗？</h1>
          <p className={styles.subtitle}>可以上传文档、图片，或直接粘贴网页链接，Enter 发送</p>
          {modelHint}

          <Composer key={currentId || 'new'} />
        </div>

        <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
      </div>
    )
  }

  return (
    <div className={styles.chatPage}>
      {shareButton}
      {modelHint && <div className={styles.modelHintBar}>{modelHint}</div>}

      <div className={styles.messages} ref={scrollRef} onScroll={handleScroll}>
        <div className={styles.messageList}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={styles.messageAnchor}
              data-question-id={message.role === 'user' ? message.id : undefined}
            >
              <MessageItem
                message={message}
                streaming={message.role === 'assistant' && message.status === 'streaming'}
                canOperate={!loading}
                onRegenerate={regenerate}
                onEdit={editMessage}
                onDelete={handleDelete}
              />
            </div>
          ))}
        </div>
      </div>

      <QuestionNav questions={questions} containerRef={scrollRef} />

      {!atBottom && (
        <Button
          className={styles.toBottom}
          shape="circle"
          icon={<DownOutlined />}
          onClick={() => scrollToBottom('smooth')}
          aria-label="回到底部"
        />
      )}

      <div className={styles.footer}>
        <Composer key={currentId || 'new'} />
      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}

export default Chat
