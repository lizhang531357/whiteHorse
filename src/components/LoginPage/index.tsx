import { useEffect, useState } from 'react'
import { Button, Form, Input, Tabs, message } from 'antd'
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import ShareModal from '../ShareModal'
import ForgotPasswordModal from '../ForgotPasswordModal'
import { useAuthContext } from '../../context/AuthContext'
import styles from './index.module.less'

const LoginPage = () => {
  const { login, register } = useAuthContext()
  const [form] = Form.useForm()
  const [tab, setTab] = useState('login')
  const [submitting, setSubmitting] = useState(false)
  const [allowRegister, setAllowRegister] = useState(true)
  const [shareOpen, setShareOpen] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAllowRegister(data.allowRegister !== false)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!allowRegister) setTab('login')
  }, [allowRegister])

  const switchTab = (key) => {
    const email = form.getFieldValue('email')
    setTab(key)
    form.resetFields()
    if (email) form.setFieldsValue({ email })
  }

  const submit = async (values) => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (tab === 'login') {
        await login(values.email.trim(), values.password)
      } else {
        await register({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
        })
      }
      message.success(tab === 'login' ? '登录成功' : '注册成功')
    } catch (err) {
      if (err.field) {
        form.setFields([{ name: err.field, errors: [err.message] }])
      } else {
        message.error(err.message || '操作失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src="/logo.svg" alt="白马AI" />
          <span>白马AI</span>
        </div>
        <p className={styles.subtitle}>登录后对话记录会同步保存到服务端</p>

        {allowRegister && (
          <Tabs centered activeKey={tab} onChange={switchTab} className={styles.tabs}>
            <Tabs.TabPane tab="登录" key="login" />
            <Tabs.TabPane tab="注册" key="register" />
          </Tabs>
        )}

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={submit}
          className={styles.form}
          autoComplete="off"
        >
          {tab === 'register' && (
            <Form.Item
              name="name"
              rules={[
                { required: true, message: '请输入昵称' },
                { max: 20, message: '昵称最多 20 个字符' },
              ]}
            >
              <Input size="large" prefix={<UserOutlined />} placeholder="昵称" maxLength={20} />
            </Form.Item>
          )}

          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input
              size="large"
              prefix={<MailOutlined />}
              placeholder="邮箱"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder={tab === 'login' ? '密码' : '密码（至少 6 位）'}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </Form.Item>

          <div className={styles.forgotRow}>
            <Button type="link" size="small" onClick={() => setForgotOpen(true)}>
              忘记密码？
            </Button>
          </div>

          <Button type="primary" size="large" block htmlType="submit" loading={submitting}>
            {tab === 'login' ? '登录' : '注册并登录'}
          </Button>
        </Form>

        <p className={styles.hint}>
          {!allowRegister
            ? '注册已关闭，请使用已有账号登录'
            : tab === 'login'
              ? '还没有账号？切到「注册」创建'
              : '注册成功后会自动登录'}
        </p>

        <div className={styles.shareRow}>
          <Button type="link" onClick={() => setShareOpen(true)}>
            分享访问链接
          </Button>
        </div>
      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        onSuccess={(email) => {
          switchTab('login')
          form.setFieldsValue({ email })
          setForgotOpen(false)
        }}
      />
    </div>
  )
}

export default LoginPage
