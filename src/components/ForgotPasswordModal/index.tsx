import { useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Modal, message } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { api } from '../../utils/api'
import styles from './index.module.less'

interface ForgotPasswordModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: (email: string) => void
}

const ForgotPasswordModal = ({ open, onClose, onSuccess }: ForgotPasswordModalProps) => {
  const [form] = Form.useForm()
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [mailSent, setMailSent] = useState<boolean | null>(null)

  useEffect(() => {
    if (countdown <= 0) return undefined
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  useEffect(() => {
    if (!open) {
      form.resetFields()
      setCountdown(0)
      setMailSent(null)
    }
  }, [open, form])

  const sendCode = async () => {
    try {
      const values = await form.validateFields(['email'])
      setSending(true)
      const data: any = await api.forgotPassword(String(values.email).trim())
      setCountdown(60)
      setMailSent(Boolean(data?.mailSent))
      if (data?.mailSent) {
        message.success('验证码已发送到邮箱，请查收（含垃圾箱）')
      } else {
        message.warning('邮件服务未配置，验证码已打印到服务端终端')
      }
    } catch (err: any) {
      if (!err?.errorFields) message.error(err?.message || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const submit = async (values: any) => {
    setSubmitting(true)
    try {
      await api.resetPassword(
        String(values.email).trim(),
        String(values.code).trim(),
        values.newPassword,
      )
      message.success('密码已重置，请用新密码登录')
      onSuccess?.(String(values.email).trim())
      onClose()
    } catch (err: any) {
      if (err?.field) {
        form.setFields([{ name: err.field, errors: [err.message] }])
      } else {
        message.error(err?.message || '重置失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="找回密码" open={open} onCancel={onClose} footer={null} width={440} destroyOnClose>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={submit}
        autoComplete="off"
        className={styles.form}
      >
        <Form.Item
          name="email"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '请输入有效的邮箱地址' },
          ]}
        >
          <Input size="large" prefix={<MailOutlined />} placeholder="注册邮箱" />
        </Form.Item>

        <Form.Item
          name="code"
          rules={[
            { required: true, message: '请输入验证码' },
            { pattern: /^\d{6}$/, message: '请输入 6 位验证码' },
          ]}
        >
          <Input
            size="large"
            placeholder="6 位验证码"
            maxLength={6}
            addonAfter={
              <Button
                type="link"
                size="small"
                loading={sending}
                disabled={countdown > 0}
                onClick={sendCode}
              >
                {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
              </Button>
            }
          />
        </Form.Item>

        <Form.Item
          name="newPassword"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '新密码至少 6 位' },
          ]}
        >
          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="新密码（至少 6 位）"
            autoComplete="new-password"
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('两次输入的新密码不一致'))
              },
            }),
          ]}
        >
          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="确认新密码"
            autoComplete="new-password"
          />
        </Form.Item>

        <Button type="primary" size="large" block htmlType="submit" loading={submitting}>
          重置密码
        </Button>
      </Form>

      {mailSent === false && (
        <Alert
          className={styles.alert}
          type="info"
          showIcon
          message="邮件服务未配置"
          description="验证码已输出到运行 yarn start / yarn share 的终端里，去终端查看即可。"
        />
      )}
    </Modal>
  )
}

export default ForgotPasswordModal
