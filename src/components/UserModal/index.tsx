import { useEffect, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Menu,
  Modal,
  Radio,
  Slider,
  Tooltip,
  message,
} from 'antd'
import {
  CloseOutlined,
  CopyOutlined,
  DatabaseOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  MoonOutlined,
  RobotOutlined,
  SettingOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useAuthContext } from '../../context/AuthContext'
import { useChatContext } from '../../context/ChatContext'
import { api } from '../../utils/api'
import styles from './index.module.less'

const UserModal = ({ open, onClose }) => {
  const { user, updateProfile, changePassword, deleteAccount } = useAuthContext()
  const {
    settings,
    updateSettings,
    hasApiKey,
    apiKeyMasked,
    saveApiKey,
    clearApiKey,
    theme,
    setTheme,
    clearConversations,
  } = useChatContext()

  const [tab, setTab] = useState('general')
  const [serverModel, setServerModel] = useState('')
  const [serverBaseUrl, setServerBaseUrl] = useState('')

  const [editing, setEditing] = useState(false)
  const [profile, setProfile] = useState({ name: user.name, email: user.email })
  const [savingProfile, setSavingProfile] = useState(false)

  const [passwordForm] = Form.useForm()
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const [config, setConfig] = useState({
    model: settings.model,
    baseUrl: settings.baseUrl,
    temperature: settings.temperature,
    systemPrompt: settings.systemPrompt,
    apiKey: '',
    theme,
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const [apiKeyTouched, setApiKeyTouched] = useState(false)
  const [keyVisible, setKeyVisible] = useState(false)
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab('general')
    setEditing(false)
    setShowPasswordForm(false)
    setApiKeyTouched(false)
    setKeyVisible(false)
    passwordForm.resetFields()
    setProfile({ name: user.name, email: user.email })
    setConfig({
      model: settings.model,
      baseUrl: settings.baseUrl,
      temperature: settings.temperature,
      systemPrompt: settings.systemPrompt,
      apiKey: hasApiKey ? apiKeyMasked : '',
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
        if (cancelled) return
        const defaultModel = data.defaultModel || ''
        const defaultBaseUrl = data.defaultBaseUrl || ''
        setServerModel(defaultModel)
        setServerBaseUrl(defaultBaseUrl)
        setConfig((prev) => ({
          ...prev,
          model: prev.model || defaultModel,
          baseUrl: prev.baseUrl || defaultBaseUrl,
        }))
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
    } catch (err: any) {
      message.error(err?.message || '更新失败')
    } finally {
      setSavingProfile(false)
    }
  }

  const saveConfig = async () => {
    const baseUrl = config.baseUrl.trim()
    if (baseUrl) {
      try {
        const parsed = new URL(baseUrl)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol')
      } catch {
        message.error('接口地址必须是 http/https 地址')
        return
      }
    }

    setSavingConfig(true)
    try {
      setTheme(config.theme)
      updateSettings({
        model: config.model.trim(),
        baseUrl,
        temperature: config.temperature,
        systemPrompt: config.systemPrompt,
      })

      let nextMasked = apiKeyMasked
      if (apiKeyTouched) {
        const key = config.apiKey.trim()
        if (key) {
          const data: any = await saveApiKey(key)
          nextMasked = data?.apiKeyMasked || ''
        } else if (hasApiKey) {
          await clearApiKey()
          nextMasked = ''
        }
      }

      setApiKeyTouched(false)
      setKeyVisible(false)
      setConfig((prev) => ({ ...prev, apiKey: nextMasked }))
      message.success('设置已保存')
    } catch (err: any) {
      message.error(err?.message || '保存失败')
    } finally {
      setSavingConfig(false)
    }
  }

  const revealKey = async () => {
    if (keyVisible) {
      setKeyVisible(false)
      if (hasApiKey && !apiKeyTouched) {
        setConfig((prev) => ({ ...prev, apiKey: apiKeyMasked }))
      }
      return
    }
    if (hasApiKey && !apiKeyTouched) {
      setRevealing(true)
      try {
        const data: any = await api.revealApiKey()
        setConfig((prev) => ({ ...prev, apiKey: String(data?.apiKey || '') }))
      } catch (err: any) {
        message.error(err?.message || '读取 API Key 失败')
        return
      } finally {
        setRevealing(false)
      }
    }
    setKeyVisible(true)
  }

  const copyKey = async () => {
    let value = config.apiKey
    if (hasApiKey && !apiKeyTouched && (!value || value === apiKeyMasked)) {
      try {
        const data: any = await api.revealApiKey()
        value = String(data?.apiKey || '')
        setConfig((prev) => ({ ...prev, apiKey: value }))
        setKeyVisible(true)
      } catch (err: any) {
        message.error(err?.message || '读取 API Key 失败')
        return
      }
    }
    if (!value) {
      message.warning('还没有配置 API Key')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      message.success('已复制 API Key')
    } catch {
      message.error('复制失败')
    }
  }

  const submitPassword = async (values: any) => {
    setSavingPassword(true)
    try {
      await changePassword(values.currentPassword, values.newPassword)
      message.success('密码已修改，其它设备已退出登录')
      passwordForm.resetFields()
      setShowPasswordForm(false)
    } catch (err: any) {
      if (err?.field) {
        passwordForm.setFields([{ name: err.field, errors: [err.message] }])
      } else {
        message.error(err?.message || '修改失败')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  const handleDeleteAllConversations = () => {
    Modal.confirm({
      title: '删除所有对话',
      content: '会删除当前账号的所有对话和上传附件，且无法恢复。确定删除吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteAllConversations()
          clearConversations()
          message.success('已删除所有对话')
        } catch (err: any) {
          message.error(err?.message || '删除失败')
        }
      },
    })
  }

  const handleDeleteAccount = () => {
    Modal.confirm({
      title: '注销账号',
      content: '将永久删除账号、所有对话、附件和配置，且无法恢复。确定注销吗？',
      okText: '注销',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteAccount()
          onClose()
        } catch (err: any) {
          message.error(err?.message || '注销失败')
        }
      },
    })
  }

  const isReasoner = /reasoner/i.test(config.model)
  const showMaskedKey = hasApiKey && !apiKeyTouched && config.apiKey === apiKeyMasked
  const apiKeyInputType = showMaskedKey || keyVisible ? 'text' : 'password'

  const changeTheme = (value) => {
    setConfig((prev) => ({ ...prev, theme: value }))
    setTheme(value)
  }

  const changeTemperature = (value) => {
    setConfig((prev) => ({ ...prev, temperature: value }))
    updateSettings({ temperature: value })
  }

  const changeSystemPrompt = (value) => {
    setConfig((prev) => ({ ...prev, systemPrompt: value }))
    updateSettings({ systemPrompt: value })
  }

  const accountContent = (
    <div className={styles.account}>
      <div className={styles.row}>
        <div className={styles.rowLabel}>用户名</div>
        <div className={styles.rowControl}>
          <div className={styles.rowValue}>
            <span>{user.name}</span>
            <Button type="link" size="small" onClick={() => setEditing((value) => !value)}>
              {editing ? '取消' : '编辑'}
            </Button>
          </div>
        </div>
      </div>

      {editing && (
        <div className={styles.editBox}>
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
              <Button size="small" type="primary" loading={savingProfile} onClick={saveProfile}>
                保存
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.rowLabel}>邮箱</div>
        <div className={styles.rowControl}>
          <div className={styles.rowValue}>{user.email}</div>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>密码</div>
        <div className={styles.rowControl}>
          <div className={styles.rowValue}>
            <span className={styles.muted}>已设置</span>
            <Button
              type="link"
              size="small"
              onClick={() => setShowPasswordForm((value) => !value)}
            >
              {showPasswordForm ? '取消' : '修改'}
            </Button>
          </div>
        </div>
      </div>

      {showPasswordForm && (
        <div className={styles.editBox}>
          <Form
            form={passwordForm}
            layout="vertical"
            requiredMark={false}
            onFinish={submitPassword}
            autoComplete="off"
            className={styles.passwordForm}
          >
            <Form.Item
              name="currentPassword"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password placeholder="当前密码" autoComplete="current-password" />
            </Form.Item>

            <Form.Item
              name="newPassword"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '新密码至少 6 位' },
              ]}
            >
              <Input.Password placeholder="新密码（至少 6 位）" autoComplete="new-password" />
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
              <Input.Password placeholder="确认新密码" autoComplete="new-password" />
            </Form.Item>

            <Button type="primary" size="small" htmlType="submit" loading={savingPassword}>
              保存新密码
            </Button>
          </Form>
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.rowLabel}>注销账号</div>
        <div className={styles.rowControl}>
          <Button danger className={styles.actionButton} onClick={handleDeleteAccount}>
            注销
          </Button>
        </div>
      </div>
    </div>
  )

  const generalContent = (
    <div className={styles.general}>
      <div className={styles.row}>
        <div className={styles.rowLabel}>主题</div>
        <div className={styles.rowControl}>
          <Radio.Group
            className={styles.themeToggle}
            value={config.theme}
            onChange={(e) => changeTheme(e.target.value)}
          >
            <Radio.Button value="light">
              <SunOutlined /> 浅色
            </Radio.Button>
            <Radio.Button value="dark">
              <MoonOutlined /> 深色
            </Radio.Button>
          </Radio.Group>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>
          温度 <span className={styles.value}>{Number(config.temperature).toFixed(1)}</span>
          <Tooltip
            title={
              isReasoner
                ? '推理模型暂不支持调节温度'
                : '越低越稳定保守，越高越发散有创意；写代码/事实类建议 0~0.3，头脑风暴 0.7~1.0'
            }
          >
            <InfoCircleOutlined className={styles.hintIcon} />
          </Tooltip>
        </div>
        <div className={styles.rowControl}>
          <div className={styles.controlCol}>
            <Slider
              min={0}
              max={2}
              step={0.1}
              value={config.temperature}
              disabled={isReasoner}
              onChange={(value) => changeTemperature(value)}
            />
            <div className={styles.hint}>
              {isReasoner ? '推理模型不支持调节温度' : '越低越稳定保守，越高越发散有创意'}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.block}>
        <div className={styles.blockLabel}>
          系统提示词
          <Tooltip title="给 AI 设定固定的身份、语气和规则，每次对话都会自动带上。例如「你是一个严谨的中文技术助手，回答尽量简洁」。">
            <InfoCircleOutlined className={styles.hintIcon} />
          </Tooltip>
        </div>
        <Input.TextArea
          rows={5}
          value={config.systemPrompt}
          onChange={(e) => changeSystemPrompt(e.target.value)}
          placeholder="设定 AI 的角色和行为"
          maxLength={2000}
          showCount
        />
      </div>
    </div>
  )

  const modelContent = (
    <div className={styles.model}>
      <div className={`${styles.row} ${styles.rowInput}`}>
        <div className={styles.rowLabel}>
          接口地址
          <Tooltip title="例如 https://api.deepseek.com">
            <InfoCircleOutlined className={styles.hintIcon} />
          </Tooltip>
        </div>
        <div className={styles.rowControl}>
          <div className={styles.controlCol}>
            <Input
              value={config.baseUrl}
              onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder={serverBaseUrl || '留空使用服务端默认地址'}
              allowClear
            />
          </div>
        </div>
      </div>

      <div className={`${styles.row} ${styles.rowInput}`}>
        <div className={styles.rowLabel}>
          模型名称
          <Tooltip title="例如 deepseek-chat、deepseek-reasoner">
            <InfoCircleOutlined className={styles.hintIcon} />
          </Tooltip>
        </div>
        <div className={styles.rowControl}>
          <div className={styles.controlCol}>
            <Input
              value={config.model}
              onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
              placeholder={serverModel || '留空使用服务端默认模型'}
              maxLength={64}
              allowClear
            />
          </div>
        </div>
      </div>

      <div className={`${styles.row} ${styles.rowInput}`}>
        <div className={styles.rowLabel}>
          API 密钥
          <Tooltip title="点击眼睛查看已保存的 Key，复制按钮可直接复制">
            <InfoCircleOutlined className={styles.hintIcon} />
          </Tooltip>
          {hasApiKey && <span className={styles.savedTag}>已配置</span>}
        </div>
        <div className={styles.rowControl}>
          <div className={styles.controlCol}>
            <Input
              type={apiKeyInputType}
              value={config.apiKey}
              onChange={(e) => {
                setApiKeyTouched(true)
                setConfig((prev) => ({ ...prev, apiKey: e.target.value }))
              }}
              placeholder={hasApiKey ? '请输入新的 API Key' : '请输入 API Key'}
              autoComplete="new-password"
              allowClear
              suffix={
                <span className={styles.keyActions}>
                  <Button
                    type="text"
                    size="small"
                    loading={revealing}
                    icon={keyVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    onClick={revealKey}
                    aria-label="查看 API Key"
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={copyKey}
                    aria-label="复制 API Key"
                  />
                </span>
              }
            />
          </div>
        </div>
      </div>
    </div>
  )

  const dataContent = (
    <div className={styles.data}>
      <div className={styles.dataRow}>
        <div className={styles.dataText}>
          <span className={styles.dataTitle}>导出所有历史对话</span>
          <span className={styles.dataDesc}>导出内容包含你的账号信息和所有历史对话。</span>
        </div>
        <Button
          className={styles.actionButton}
          onClick={() => {
            window.location.href = '/api/export'
          }}
        >
          导出
        </Button>
      </div>

      <div className={styles.dataRow}>
        <div className={styles.dataText}>
          <span className={styles.dataTitle}>删除所有对话</span>
          <span className={styles.dataDesc}>会删除当前账号的所有对话和上传附件，无法恢复。</span>
        </div>
        <Button danger className={styles.actionButton} onClick={handleDeleteAllConversations}>
          删除
        </Button>
      </div>
    </div>
  )

  const contentMap: Record<string, JSX.Element> = {
    general: generalContent,
    model: modelContent,
    data: dataContent,
    account: accountContent,
  }

  return (
    <Modal
      open={open}
      footer={null}
      width={760}
      centered
      closable={false}
      onCancel={onClose}
      bodyStyle={{ height: 500, padding: 0 }}
    >
      <div className={styles.settings}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>系统设置</div>
          <Menu
            mode="inline"
            inlineIndent={10}
            selectedKeys={[tab]}
            onClick={({ key }) => setTab(String(key))}
            items={[
              { key: 'general', icon: <SettingOutlined />, label: '通用设置' },
              { key: 'model', icon: <RobotOutlined />, label: '模型管理' },
              { key: 'data', icon: <DatabaseOutlined />, label: '数据管理' },
              { key: 'account', icon: <UserOutlined />, label: '账号管理' },
            ]}
          />
        </aside>

        <section className={styles.main}>
          <header className={styles.mainHeader}>
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
              aria-label="关闭"
            />
          </header>

          <div className={styles.mainBody}>{contentMap[tab]}</div>

          {tab === 'model' && (
            <div className={styles.mainFooter}>
              <Button
                type="primary"
                className={styles.actionButton}
                loading={savingConfig}
                onClick={saveConfig}
              >
                保存设置
              </Button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

export default UserModal
