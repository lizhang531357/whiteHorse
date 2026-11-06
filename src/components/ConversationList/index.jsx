import { useMemo, useState } from 'react'
import { Button, Dropdown, Empty, Input, Modal, Tooltip, message } from 'antd'
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
import styles from './index.module.less'

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatTime(ts) {
  const date = new Date(ts)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  if (now - date < 7 * 24 * 3600 * 1000) {
    return `周${'日一二三四五六'[date.getDay()]}`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export default function ConversationList({ collapsed, onNavigate }) {
  const {
    conversations,
    currentId,
    selectConversation,
    createConversation,
    renameConversation,
    deleteConversation,
  } = useChatContext()

  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [conversations],
  )

  function startRename(conv) {
    setRenameTarget(conv)
    setRenameValue(conv.title)
  }

  function submitRename() {
    if (!renameTarget) return
    renameConversation(renameTarget.id, renameValue)
    setRenameTarget(null)
  }

  function confirmDelete(conv) {
    Modal.confirm({
      title: '删除对话',
      content: `确定删除「${conv.title}」吗？删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteConversation(conv.id),
    })
  }

  function menuFor(conv) {
    return {
      items: [
        { key: 'rename', icon: <EditOutlined />, label: '重命名' },
        { key: 'export', icon: <ExportOutlined />, label: '导出 Markdown' },
        { type: 'divider' },
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
        icon={<PlusOutlined />}
        onClick={() => {
          createConversation()
          onNavigate?.()
        }}
      >
        新建对话
      </Button>

      <div className={styles.list}>
        {sorted.length === 0 ? (
          <Empty className={styles.empty} image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有对话" />
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
