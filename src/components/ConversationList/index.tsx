import { useMemo, useState } from 'react'
import { Button, Dropdown, Empty, Input, Modal, Tooltip, message } from 'antd'
import type { MenuProps } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  MessageOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useChatContext } from '../../context/ChatContext'
import { exportConversation } from '../../utils/export'
import type { Conversation } from '../../types'
import styles from './index.module.less'

const pad = (n: number) => {
  return String(n).padStart(2, '0')
}

const formatTime = (ts: number) => {
  const date = new Date(ts)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  if (now.getTime() - date.getTime() < 7 * 24 * 3600 * 1000) {
    return `周${'日一二三四五六'[date.getDay()]}`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const ConversationList = ({ collapsed, onNavigate }) => {
  const {
    conversations,
    currentId,
    selectConversation,
    createConversation,
    renameConversation,
    deleteConversation,
  } = useChatContext()

  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [keyword, setKeyword] = useState('')

  const sorted = useMemo(() => {
    const list = [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    const kw = keyword.trim().toLowerCase()
    if (!kw) return list

    return list.filter((conv) => {
      if (String(conv.title || '').toLowerCase().includes(kw)) return true
      return (conv.messages || []).some((m) => {
        const hay = [m.content, m.promptContent, (m.files || []).map((f) => f.name).join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(kw)
      })
    })
  }, [conversations, keyword])

  const startRename = (conv: Conversation) => {
    setRenameTarget(conv)
    setRenameValue(conv.title)
  }

  const submitRename = () => {
    if (!renameTarget) return
    renameConversation(renameTarget.id, renameValue)
    setRenameTarget(null)
  }

  const confirmDelete = (conv: Conversation) => {
    Modal.confirm({
      title: '删除对话',
      content: `确定删除「${conv.title}」吗？删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteConversation(conv.id),
    })
  }

  const menuFor = (conv: Conversation): MenuProps => {
    return {
      items: [
        { key: 'rename', icon: <EditOutlined />, label: '重命名' },
        { key: 'export', icon: <ExportOutlined />, label: '导出 Markdown' },
        { type: 'divider' as const },
        { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
      ],
      onClick: ({ key, domEvent }) => {
        domEvent.stopPropagation()
        if (key === 'rename') startRename(conv)
        if (key === 'export') {
          exportConversation(conv, 'md')
          message.success('已导出')
        }
        if (key === 'delete') confirmDelete(conv)
      },
    }
  }

  if (collapsed) {
    return (
      <div className={styles.collapsedBar}>
        <Tooltip title="新建对话" placement="right">
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={() => {
              createConversation()
              onNavigate?.()
            }}
          />
        </Tooltip>
      </div>
    )
  }

  return (
    <div className={styles.conversationList}>
      <Button
        className={styles.newChat}
        type="dashed"
        onClick={() => {
          createConversation()
          onNavigate?.()
        }}
      >
        新建对话
      </Button>

      <Input.Search
        className={styles.search}
        size="small"
        allowClear
        placeholder="搜索对话"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />

      <div className={styles.list}>
        {sorted.length === 0 ? (
          <Empty
            className={styles.empty}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={keyword.trim() ? '没有匹配的对话' : '还没有对话'}
          />
        ) : (
          sorted.map((conv) => (
            <div
              key={conv.id}
              className={`${styles.item} ${conv.id === currentId ? styles.active : ''}`}
              onClick={() => {
                selectConversation(conv.id)
                onNavigate?.()
              }}
              role="button"
              tabIndex={0}
            >
              <MessageOutlined className={styles.itemIcon} />
              <span className={styles.title} title={conv.title}>
                {conv.title}
              </span>
              <span className={styles.time}>{formatTime(conv.updatedAt || conv.createdAt)}</span>
              <Dropdown menu={menuFor(conv)} trigger={['click']} placement="bottomRight">
                <span className={styles.more} onClick={(e) => e.stopPropagation()}>
                  <MoreOutlined />
                </span>
              </Dropdown>
            </div>
          ))
        )}
      </div>

      <Modal
        title="重命名对话"
        open={Boolean(renameTarget)}
        okText="保存"
        cancelText="取消"
        onOk={submitRename}
        onCancel={() => setRenameTarget(null)}
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={submitRename}
          maxLength={40}
          autoFocus
        />
      </Modal>
    </div>
  )
}

export default ConversationList
