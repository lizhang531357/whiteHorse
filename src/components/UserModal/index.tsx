import { useEffect, useRef, useState } from "react";
import {
  Button,
  Form,
  Input,
  Menu,
  Modal,
  Radio,
  Slider,
  Tooltip,
  Upload,
  message,
} from "antd";
import {
  CloseOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  MoonOutlined,
  RobotOutlined,
  SettingOutlined,
  SunOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useAuthContext } from "../../context/AuthContext";
import { useChatContext } from "../../context/ChatContext";
import { api } from "../../utils/api";
import AvatarCropper from "./AvatarCropper";
import styles from "./index.module.less";

const UserModal = ({ open, onClose, defaultTab = "general" }) => {
  const { user, updateProfile, updateAvatar, changePassword, deleteAccount } =
    useAuthContext();
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
  } = useChatContext();

  const [tab, setTab] = useState("general");
  const [serverBaseUrl, setServerBaseUrl] = useState("");

  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [profile, setProfile] = useState({
    name: user.name,
    email: user.email,
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwordForm] = Form.useForm();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [config, setConfig] = useState({
    model: settings.model,
    models: settings.models || [],
    baseUrl: settings.baseUrl,
    temperature: settings.temperature,
    systemPrompt: settings.systemPrompt,
    apiKey: "",
    theme,
  });
  const [modelInput, setModelInput] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [testing, setTesting] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState("");
  const cropUrlRef = useRef("");
  const [apiKeyTouched, setApiKeyTouched] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (!open) {
      if (cropUrlRef.current) {
        URL.revokeObjectURL(cropUrlRef.current);
        cropUrlRef.current = "";
      }
      setCropOpen(false);
      setCropSrc("");
      return;
    }
    setTab(defaultTab);
    setEditingName(false);
    setEditingEmail(false);
    setShowPasswordForm(false);
    setApiKeyTouched(false);
    setKeyVisible(false);
    passwordForm.resetFields();
    setProfile({ name: user.name, email: user.email });
    setConfig({
      model: settings.model,
      models: settings.models || [],
      baseUrl: settings.baseUrl,
      temperature: settings.temperature,
      systemPrompt: settings.systemPrompt,
      apiKey: hasApiKey ? apiKeyMasked : "",
      theme,
    });
    setModelInput("");
    // 只在打开弹窗时初始化，避免保存配置或切主题时把当前标签页重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const defaultBaseUrl = data.defaultBaseUrl || "";
        setServerBaseUrl(defaultBaseUrl);
        setConfig((prev) => ({
          ...prev,
          baseUrl: prev.baseUrl || defaultBaseUrl,
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const saveName = async () => {
    if (!profile.name.trim()) {
      message.warning("昵称不能为空");
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile({ name: profile.name.trim(), email: user.email });
      message.success("用户名已更新");
      setEditingName(false);
    } catch (err: any) {
      message.error(err?.message || "更新失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveEmail = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({ name: user.name, email: profile.email.trim() });
      message.success("邮箱已更新");
      setEditingEmail(false);
    } catch (err: any) {
      message.error(err?.message || "更新失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const closeCrop = () => {
    if (cropUrlRef.current) {
      URL.revokeObjectURL(cropUrlRef.current);
      cropUrlRef.current = "";
    }
    setCropSrc("");
    setCropOpen(false);
  };

  const handleAvatarUpload = (file: File) => {
    if (!String(file.type || "").startsWith("image/")) {
      message.error("请选择图片文件");
      return Upload.LIST_IGNORE;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error("图片不能超过 5MB");
      return Upload.LIST_IGNORE;
    }

    if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current);
    const url = URL.createObjectURL(file);
    cropUrlRef.current = url;
    setCropSrc(url);
    setCropOpen(true);
    return Upload.LIST_IGNORE;
  };

  const handleCropConfirm = async (dataUrl: string) => {
    setAvatarUploading(true);
    try {
      await updateAvatar(dataUrl);
      message.success("头像已更新");
      closeCrop();
    } catch (err: any) {
      message.error(err?.message || "头像更新失败");
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarUploading(true);
    try {
      await updateAvatar("");
      message.success("头像已移除");
    } catch (err: any) {
      message.error(err?.message || "移除失败");
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveConfig = async () => {
    const baseUrl = config.baseUrl.trim();
    if (baseUrl) {
      try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
          throw new Error("protocol");
      } catch {
        message.error("接口地址必须是 http/https 地址");
        return;
      }
    }

    setSavingConfig(true);
    try {
      setTheme(config.theme);
      // 当前模型若不在列表中（旧设置），自动收进列表
      const models =
        config.model.trim() && !config.models.includes(config.model.trim())
          ? [...config.models, config.model.trim()]
          : config.models;
      updateSettings({
        model: config.model.trim(),
        models,
        baseUrl,
        temperature: config.temperature,
        systemPrompt: config.systemPrompt,
      });

      let nextMasked = apiKeyMasked;
      if (apiKeyTouched) {
        const key = config.apiKey.trim();
        if (key) {
          const data: any = await saveApiKey(key);
          nextMasked = data?.apiKeyMasked || "";
        } else if (hasApiKey) {
          await clearApiKey();
          nextMasked = "";
        }
      }

      setApiKeyTouched(false);
      setKeyVisible(false);
      setConfig((prev) => ({ ...prev, apiKey: nextMasked }));
      message.success("设置已保存");
    } catch (err: any) {
      message.error(err?.message || "保存失败");
    } finally {
      setSavingConfig(false);
    }
  };

  const testConnection = async () => {
    const baseUrl = config.baseUrl.trim();
    if (baseUrl) {
      try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("protocol");
        }
      } catch {
        message.error("接口地址必须是 http/https 地址");
        return;
      }
    }

    setTesting(true);
    try {
      const data: any = await api.testConnection({
        baseUrl,
        model: config.model.trim(),
        apiKey: apiKeyTouched ? config.apiKey.trim() : "",
      });
      if (data?.ok) {
        message.success("连接成功，当前模型可正常使用");
      } else {
        message.error(data?.error || "连接失败");
      }
    } catch (err: any) {
      message.error(err?.message || "连接失败");
    } finally {
      setTesting(false);
    }
  };

  const revealKey = async () => {
    if (keyVisible) {
      setKeyVisible(false);
      if (hasApiKey && !apiKeyTouched) {
        setConfig((prev) => ({ ...prev, apiKey: apiKeyMasked }));
      }
      return;
    }
    if (hasApiKey && !apiKeyTouched) {
      setRevealing(true);
      try {
        const data: any = await api.revealApiKey();
        setConfig((prev) => ({ ...prev, apiKey: String(data?.apiKey || "") }));
      } catch (err: any) {
        message.error(err?.message || "读取 API Key 失败");
        return;
      } finally {
        setRevealing(false);
      }
    }
    setKeyVisible(true);
  };

  const copyKey = async () => {
    let value = config.apiKey;
    if (hasApiKey && !apiKeyTouched && (!value || value === apiKeyMasked)) {
      try {
        const data: any = await api.revealApiKey();
        value = String(data?.apiKey || "");
        setConfig((prev) => ({ ...prev, apiKey: value }));
        setKeyVisible(true);
      } catch (err: any) {
        message.error(err?.message || "读取 API Key 失败");
        return;
      }
    }
    if (!value) {
      message.warning("还没有配置 API Key");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      message.success("已复制 API Key");
    } catch {
      message.error("复制失败");
    }
  };

  const submitPassword = async (values: any) => {
    setSavingPassword(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      message.success("密码已修改，其它设备已退出登录");
      passwordForm.resetFields();
      setShowPasswordForm(false);
    } catch (err: any) {
      if (err?.field) {
        passwordForm.setFields([{ name: err.field, errors: [err.message] }]);
      } else {
        message.error(err?.message || "修改失败");
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAllConversations = () => {
    Modal.confirm({
      title: "删除所有对话",
      content: "会删除当前账号的所有对话和上传附件，且无法恢复。确定删除吗？",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await api.deleteAllConversations();
          clearConversations();
          message.success("已删除所有对话");
        } catch (err: any) {
          message.error(err?.message || "删除失败");
        }
      },
    });
  };

  const handleDeleteAccount = () => {
    Modal.confirm({
      title: "注销账号",
      content: "将永久删除账号、所有对话、附件和配置，且无法恢复。确定注销吗？",
      okText: "注销",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteAccount();
          onClose();
        } catch (err: any) {
          message.error(err?.message || "注销失败");
        }
      },
    });
  };

  const isReasoner = /reasoner/i.test(config.model);
  const showMaskedKey =
    hasApiKey && !apiKeyTouched && config.apiKey === apiKeyMasked;
  const apiKeyInputType = showMaskedKey || keyVisible ? "text" : "password";

  const handleAddModel = () => {
    const value = modelInput.trim().slice(0, 64);
    if (!value) return;
    if (config.models.includes(value)) {
      message.warning("该模型已在列表中");
      return;
    }
    if (config.models.length >= 20) {
      message.warning("最多添加 20 个模型");
      return;
    }
    setConfig((prev) => ({
      ...prev,
      models: [...prev.models, value],
      model: prev.model || value,
    }));
    setModelInput("");
  };

  const handleRemoveModel = (name) => {
    setConfig((prev) => {
      const models = prev.models.filter((item) => item !== name);
      return {
        ...prev,
        models,
        model: prev.model === name ? models[0] || "" : prev.model,
      };
    });
  };

  const changeTheme = (value) => {
    setConfig((prev) => ({ ...prev, theme: value }));
    setTheme(value);
  };

  const changeTemperature = (value) => {
    setConfig((prev) => ({ ...prev, temperature: value }));
    updateSettings({ temperature: value });
  };

  const changeSystemPrompt = (value) => {
    setConfig((prev) => ({ ...prev, systemPrompt: value }));
    updateSettings({ systemPrompt: value });
  };

  const accountContent = (
    <div className={styles.account}>
      <div className={styles.row}>
        <div className={styles.rowLabel}>头像</div>
        <div className={styles.rowControl}>
          <div className={styles.avatarWrap}>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={handleAvatarUpload}
            >
              <div
                className={styles.avatarBox}
                style={!user.avatar ? { background: user.color } : undefined}
              >
                {user.avatar ? (
                  <img
                    className={styles.avatarImg}
                    src={user.avatar}
                    alt="头像"
                  />
                ) : (
                  <span className={styles.avatarLetter}>
                    {String(user.name || "U")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                )}
                <span className={styles.avatarMask}>
                  {avatarUploading ? "上传中…" : "更换"}
                </span>
              </div>
            </Upload>
            {user.avatar && (
              <Button
                type="link"
                size="small"
                loading={avatarUploading}
                onClick={removeAvatar}
              >
                移除
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>用户名</div>
        <div className={styles.rowControl}>
          {editingName ? (
            <div className={styles.inlineEdit}>
              <Input
                className={styles.inlineInput}
                value={profile.name}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="昵称"
                maxLength={20}
                autoFocus
              />
              <Button
                size="small"
                type="primary"
                loading={savingProfile}
                onClick={saveName}
              >
                保存
              </Button>
              <Button size="small" onClick={() => setEditingName(false)}>
                取消
              </Button>
            </div>
          ) : (
            <div className={styles.rowValue}>
              <span>{user.name}</span>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setProfile((prev) => ({ ...prev, name: user.name }));
                  setEditingName(true);
                }}
              >
                修改
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>邮箱</div>
        <div className={styles.rowControl}>
          {editingEmail ? (
            <div className={styles.inlineEdit}>
              <Input
                className={styles.inlineInput}
                value={profile.email}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="邮箱"
                maxLength={60}
                autoFocus
              />
              <Button
                size="small"
                type="primary"
                loading={savingProfile}
                onClick={saveEmail}
              >
                保存
              </Button>
              <Button size="small" onClick={() => setEditingEmail(false)}>
                取消
              </Button>
            </div>
          ) : (
            <div className={styles.rowValue}>
              <span>{user.email}</span>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setProfile((prev) => ({ ...prev, email: user.email }));
                  setEditingEmail(true);
                }}
              >
                修改
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>密码</div>
        <div className={styles.rowControl}>
          <div className={styles.rowValue}>
            <span className={styles.muted}>已设置</span>
            {!showPasswordForm && (
              <Button
                type="link"
                size="small"
                onClick={() => setShowPasswordForm(true)}
              >
                修改
              </Button>
            )}
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
              rules={[{ required: true, message: "请输入当前密码" }]}
            >
              <Input.Password
                placeholder="当前密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item
              name="newPassword"
              rules={[
                { required: true, message: "请输入新密码" },
                { min: 6, message: "新密码至少 6 位" },
              ]}
            >
              <Input.Password
                placeholder="新密码（至少 6 位）"
                autoComplete="new-password"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              dependencies={["newPassword"]}
              rules={[
                { required: true, message: "请再次输入新密码" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("newPassword") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("两次输入的新密码不一致"));
                  },
                }),
              ]}
            >
              <Input.Password
                placeholder="确认新密码"
                autoComplete="new-password"
              />
            </Form.Item>

            <div className={styles.editActions}>
              <Button
                type="primary"
                size="small"
                htmlType="submit"
                loading={savingPassword}
              >
                保存新密码
              </Button>
              <Button size="small" onClick={() => setShowPasswordForm(false)}>
                取消
              </Button>
            </div>
          </Form>
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.rowLabel}>注销账号</div>
        <div className={styles.rowControl}>
          <Button
            danger
            className={styles.actionButton}
            onClick={handleDeleteAccount}
          >
            注销
          </Button>
        </div>
      </div>
    </div>
  );

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

      <div className={`${styles.row} ${styles.rowInput}`}>
        <div className={styles.rowLabel}>
          温度{" "}
          <span className={styles.value}>
            {Number(config.temperature).toFixed(1)}
          </span>
          <Tooltip
            title={
              isReasoner
                ? "推理模型暂不支持调节温度"
                : "越低越稳定保守，越高越发散有创意；写代码/事实类建议 0~0.3，头脑风暴 0.7~1.0"
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
              {isReasoner
                ? "推理模型不支持调节温度"
                : "越低越稳定保守，越高越发散有创意"}
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
  );

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
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))
              }
              placeholder={serverBaseUrl || "留空使用服务端默认地址"}
              allowClear
            />
          </div>
        </div>
      </div>

      <div className={`${styles.row} ${styles.rowInput} ${styles.rowNoBorder}`}>
        <div className={styles.rowLabel}>
          模型
          <Tooltip title="输入模型名称添加到列表，再在下方列表中选择正在使用的模型">
            <InfoCircleOutlined className={styles.hintIcon} />
          </Tooltip>
        </div>
        <div className={styles.rowControl}>
          <div className={styles.controlCol}>
            <div className={styles.modelAdd}>
              <Input
                style={{ width: "100%" }}
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddModel();
                  }
                }}
                placeholder="输入模型名称，如 deepseek-v4-flash"
                maxLength={64}
              />
              <Button disabled={!modelInput.trim()} onClick={handleAddModel}>
                添加
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.block} style={{ paddingTop: 0 }}>
        <div className={styles.modelList}>
          {config.models.length === 0 && (
            <span className={styles.modelEmpty}>还没有模型，请在上方添加</span>
          )}
          {config.models.map((name) => (
            <div
              key={name}
              className={`${styles.modelItem} ${config.model === name ? styles.modelActive : ""}`}
              onClick={() => setConfig((prev) => ({ ...prev, model: name }))}
            >
              <Radio
                className={styles.modelRadio}
                checked={config.model === name}
                onChange={() => setConfig((prev) => ({ ...prev, model: name }))}
              />
              <span className={styles.modelName} title={name}>
                {config.model === name ? `${name}（使用中）` : name}
              </span>
              <Button
                type="text"
                size="small"
                className={styles.modelRemove}
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveModel(name);
                }}
                aria-label={`删除模型 ${name}`}
              />
            </div>
          ))}
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
                setApiKeyTouched(true);
                setConfig((prev) => ({ ...prev, apiKey: e.target.value }));
              }}
              placeholder={hasApiKey ? "请输入新的 API Key" : "请输入 API Key"}
              autoComplete="new-password"
              allowClear
              suffix={
                <span className={styles.keyActions}>
                  <Button
                    type="text"
                    size="small"
                    loading={revealing}
                    icon={
                      keyVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />
                    }
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
  );

  const dataContent = (
    <div className={styles.data}>
      <div className={styles.dataRow}>
        <div className={styles.dataText}>
          <span className={styles.dataTitle}>导出所有历史对话</span>
          <span className={styles.dataDesc}>
            导出内容包含你的账号信息和所有历史对话。
          </span>
        </div>
        <Button
          className={styles.actionButton}
          onClick={() => {
            window.location.href = "/api/export";
          }}
        >
          导出
        </Button>
      </div>

      <div className={styles.dataRow}>
        <div className={styles.dataText}>
          <span className={styles.dataTitle}>删除所有对话</span>
          <span className={styles.dataDesc}>
            会删除当前账号的所有对话和上传附件，无法恢复。
          </span>
        </div>
        <Button
          danger
          className={styles.actionButton}
          onClick={handleDeleteAllConversations}
        >
          删除
        </Button>
      </div>
    </div>
  );

  const contentMap: Record<string, JSX.Element> = {
    general: generalContent,
    model: modelContent,
    data: dataContent,
    account: accountContent,
  };

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
              { key: "general", icon: <SettingOutlined />, label: "通用设置" },
              { key: "model", icon: <RobotOutlined />, label: "模型管理" },
              { key: "data", icon: <DatabaseOutlined />, label: "数据管理" },
              { key: "account", icon: <UserOutlined />, label: "账号管理" },
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

          {tab === "model" && (
            <div className={styles.mainFooter}>
              <Button
                className={styles.actionButton}
                loading={testing}
                onClick={testConnection}
              >
                测试连接
              </Button>
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

      <AvatarCropper
        open={cropOpen}
        src={cropSrc}
        loading={avatarUploading}
        onCancel={closeCrop}
        onConfirm={handleCropConfirm}
      />
    </Modal>
  );
};

export default UserModal;
