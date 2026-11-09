import { useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Typography, message } from 'antd'
import { LinkOutlined } from '@ant-design/icons'
import { api } from '../../utils/api'
import styles from './index.module.less'

interface ShareModalProps {
  open: boolean
  onClose: () => void
}

const ShareModal = ({ open, onClose }: ShareModalProps) => {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLoading(true)

    api
      .getShare()
      .then((data: any) => {
        if (!cancelled) setUrl(String(data?.url || ''))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      message.success('链接已复制，发给对方即可')
    } catch {
      message.error('复制失败，请手动选中复制')
    }
  }

  return (
    <Modal title="分享访问链接" open={open} onCancel={onClose} footer={null} width={500}>
      <div className={styles.body}>
        {url ? (
          <>
            <Typography.Paragraph type="secondary" className={styles.desc}>
              把下面这个地址发给别人，手机或电脑打开就能访问你的白马AI。
            </Typography.Paragraph>

            <div className={styles.copyRow}>
              <Input value={url} readOnly prefix={<LinkOutlined />} onFocus={(e) => e.target.select()} />
              <Button type="primary" loading={loading} onClick={copy}>
                复制
              </Button>
            </div>

            <Alert
              className={styles.alert}
              type="warning"
              showIcon
              message="链接只在 yarn share 和 Tunnel 都运行时有效"
              description="电脑需保持开机联网；Quick Tunnel 每次重启都会生成新地址，需要回来重新复制。"
            />
          </>
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              message="还没有公网地址"
              description="请先在终端运行 yarn share，启动完成后再点这里。"
            />
            <Typography.Paragraph type="secondary" className={styles.tip}>
              分享后别人访问的是你这台电脑上的同一个后端，账号和聊天记录仍是同一份。
            </Typography.Paragraph>
          </>
        )}
      </div>
    </Modal>
  )
}

export default ShareModal
