import { useEffect, useState } from 'react'
import {
  Avatar,
  Button,
  Input,
  Modal,
  Radio,
  Slider,
  Tabs,
  Tooltip,
  message,
} from 'antd'
import {
  CheckOutlined,
  InfoCircleOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { useAuthContext } from '../../context/AuthContext'
import { useChatContext } from '../../context/ChatContext'
import styles from './index.module.less'

const initial = (name) => {
  return String(name || 'U').trim().slice(0, 1).toUpperCase()
}

const UserModal = ({ open, onClose }) => {
  const { user, updateProfile, logout } = useAuthContext()
  const {
    settings,
    updateSettings,
    hasApiKey,
    apiKeyMasked,
    saveApiKey,
    clearApiKey,
    theme,
    setTheme,
  } = useChatContext()

  const [tab, setTab] = useState('profile')
  const [serverModel, setServerModel] = useState('')

  const [editing, setEditing] = useState(false)
  const [profile, setProfile] = useState({ name: user.name, email: user.email })
  const [savingProfile, setSavingProfile] = useState(false)

  const [config, setConfig] = useState({
    model: settings.model,
    temperature: settings.temperature,
    systemPrompt: settings.systemPrompt,
    apiKey: '',
    theme,
  })
  const [savingConfig, setSavingConfig] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab('profile')
    setEditing(false)
    setProfile({ name: user.name, email: user.email })
    setConfig({
      model: settings.model,
      temperature: settings.temperature,
      systemPrompt: settings.systemPrompt,
      apiKey: '',
      theme,
    })
    // 只在打开弹窗时初始化，避免保存配置或切主题时把当前标签页重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setServerModel(data.defaultModel || '')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  const saveProfile = async () => {
    if (!profile.name.trim()) {
      message.warning('昵称不能为空')
      return
    }
    setSavingProfile(true)
    try {
      await updateProfile({ name: profile.name.trim(), email: profile.email.trim() })
      message.success('资料已更新')
      setEditing(false)
    } catch (err) {
      message.error(err.message || '更新失败')
    } finally {
      setSavingProfile(false)
    }
  }

  const saveConfig = async () => {
    setSavingConfig(true)
    try {
      setTheme(config.theme)
      updateSettings({
        model: config.model.trim(),
        temperature: config.temperature,
        systemPrompt: config.systemPrompt,
      })
      if (config.apiKey.trim()) {
        await saveApiKey(config.apiKey.trim())
        setConfig((prev) => ({ ...prev, apiKey: '' }))
      }
      message.success('系统配置已保存')
    } catch (err) {
      message.error(err.message || '保存失败')
    } finally {
      setSavingConfig(false)
    }
  }

  const handleClearApiKey = async () => {
    try {
      await clearApiKey()
      message.success('已清除 API Key，将使用服务端默认配置')
    } catch (err) {
      message.error(err.message || '操作失败')
    }
  }

  const handleLogout = async () => {
    await logout()
    onClose()
  }

  const isReasoner = /reasoner/i.test(config.model)

  const profileTab = (
    <div className={styles.profileTab}>
      <div className={styles.profile}>
        <Avatar size={56} style={{ background: user.color }}>
          {initial(user.name)}
        </Avatar>
        <div className={styles.profileInfo}>
          {editing ? (
            <div className={styles.editForm}>
              <Input
                value={profile.name}
                onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="昵称"
                maxLength={20}
              />
              <Input
                value={profile.email}
                onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="邮箱"
                maxLength={60}
              />
              <div className={styles.editActions}>
                <Button size="small" onClick={() => setEditing(false)}>
                  取消
                </Button>
                <Button
                  size="small"
                  type="primary"
                  loading={savingProfile}
                  icon={<CheckOutlined />}
                  onClick={saveProfile}
                >
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.name}>{user.name}</div>
              <div className={styles.email}>{user.email}</div>
              <Button size="small" type="link" className={styles.editBtn} onClick={() => setEditing(true)}>
                编辑资料
              </Button>
            </>
          )}
        </div>
      </div>

      <Button
        danger
        block
        icon={<LogoutOutlined />}
        className={styles.logoutBtn}
        onClick={handleLogout}
      >
        退出登录
      </Button>
    </div>
  )

  const systemTab = (
    <div className={styles.systemTab}>
      <div className={styles.field}>
        <div className={styles.label}>模型</div>
        <Input
          value={config.model}
          onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
          placeholder={`留空则使用服务端默认${serverModel ? `（${serverModel}）` : ''}`}
          maxLength={64}
        />
        <div className={styles.hint}>填 DeepSeek 兼容的模型名，例如 deepseek-chat、deepseek-reasoner</div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>
          API Key
          {hasApiKey && <span className={styles.savedTag}>已配置</span>}
        </div>
        <div className={styles.keyRow}>
          <Input.Password
            value={config.apiKey}
            onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
            placeholder={hasApiKey ? `已保存 ${apiKeyMasked}，留空则不修改` : '请输入 API Key'}
            autoComplete="new-password"
          />
          {hasApiKey && (
            <Button size="middle" onClick={handleClearApiKey}>
              清除
            </Button>
          )}
        </div>
        <div className={styles.hint}>Key 仅保存在服务端，不会下发到浏览器（本机演示为明文存储）。</div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>
          温度 <span className={styles.value}>{Number(config.temperature).toFixed(1)}</span>
          <Tooltip title={isReasoner ? '推理模型暂不支持调节温度' : '越高越发散，越低越保守'}>
            <InfoCircleOutlined className={styles.hintIcon} />
          </Tooltip>
        </div>
        <Slider
          min={0}
          max={2}
          step={0.1}
          value={config.temperature}
          disabled={isReasoner}
          onChange={(value) => setConfig((prev) => ({ ...prev, temperature: value }))}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.label}>系统提示词</div>
        <Input.TextArea
          rows={4}
          value={config.systemPrompt}
          onChange={(e) => setConfig((prev) => ({ ...prev, systemPrompt: e.target.value }))}
          placeholder="设定 AI 的角色和行为"
          maxLength={2000}
          showCount
        />
      </div>

      <div className={styles.field}>
        <div className={styles.label}>主题</div>
        <Radio.Group
          value={config.theme}
          onChange={(e) => setConfig((prev) => ({ ...prev, theme: e.target.value }))}
        >
          <Radio.Button value="light">
            <SunOutlined /> 浅色
          </Radio.Button>
          <Radio.Button value="dark">
            <MoonOutlined /> 深色
          </Radio.Button>
        </Radio.Group>
      </div>

      <div className={styles.configFooter}>
        <Button
          onClick={() => {
            window.location.href = '/api/export'
          }}
        >
          导出我的数据
        </Button>
        <Button type="primary" loading={savingConfig} onClick={saveConfig}>
          保存配置
        </Button>
      </div>
    </div>
  )

  return (
    <Modal title="我的" open={open} footer={null} width={640} onCancel={onClose}>
      <Tabs tabPosition="left" className={styles.tabs} activeKey={tab} onChange={setTab}>
        <Tabs.TabPane tab="个人信息" key="profile">
          {profileTab}
        </Tabs.TabPane>
        <Tabs.TabPane tab="系统配置" key="system">
          {systemTab}
        </Tabs.TabPane>
      </Tabs>
    </Modal>
  )
}

export default UserModal
