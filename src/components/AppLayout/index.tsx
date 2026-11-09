import { useState } from 'react'
import { Avatar, Button, Drawer, Dropdown, Layout } from 'antd'
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import ConversationList from '../ConversationList'
import UserModal from '../UserModal'
import { useAuthContext } from '../../context/AuthContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import styles from './index.module.less'

const { Sider, Content } = Layout

const AppLayout = ({ children }) => {
  const { user, logout } = useAuthContext()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  const isCollapsed = !isMobile && collapsed

  const renderSidebar = () => {
    return (
      <div className={styles.siderInner}>
        <div className={styles.siderTop}>
          {isCollapsed ? (
            <button
              type="button"
              className={styles.expandBtn}
              title="展开侧边栏"
              onClick={() => setCollapsed(false)}
            >
              <img className={styles.logoIcon} src="/logo.svg" alt="白马AI" />
            </button>
          ) : (
            <>
              <div className={styles.brand}>
                <img className={styles.logoIcon} src="/logo.svg" alt="白马AI" />
                <span className={styles.logoText}>白马AI</span>
              </div>
              {!isMobile && (
                <Button
                  type="text"
                  size="small"
                  icon={<MenuFoldOutlined />}
                  onClick={() => setCollapsed(true)}
                />
              )}
            </>
          )}
        </div>

        <div className={styles.siderBody}>
          <ConversationList collapsed={isCollapsed} onNavigate={() => setDrawerOpen(false)} />
        </div>

        <div className={styles.siderBottom}>
          <Dropdown
            trigger={['click']}
            placement="topLeft"
            menu={{
              items: [
                { key: 'settings', icon: <SettingOutlined />, label: '系统设置' },
                { type: 'divider' as const },
                { key: 'logout', icon: <LogoutOutlined />, label: '退出账号', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'settings') {
                  setUserOpen(true)
                  setDrawerOpen(false)
                }
                if (key === 'logout') {
                  setDrawerOpen(false)
                  logout()
                }
              },
            }}
          >
            <Button type="text" block className={styles.mine}>
              <Avatar size={28} style={{ background: user.color }}>
                {String(user.name || 'U').slice(0, 1).toUpperCase()}
              </Avatar>
              {!isCollapsed && <span className={styles.mineName}>{user.name}</span>}
            </Button>
          </Dropdown>
        </div>
      </div>
    )
  }

  return (
    <Layout className={styles.layout}>
      {!isMobile && (
        <Sider
          className={styles.sider}
          width={240}
          collapsedWidth={64}
          collapsed={collapsed}
          trigger={null}
          theme="light"
        >
          {renderSidebar()}
        </Sider>
      )}

      <Content className={styles.content}>
        {isMobile && (
          <div className={styles.mobileBar}>
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
            <span className={styles.mobileBrand}>白马AI</span>
            <span className={styles.mobileSpacer} />
          </div>
        )}
        <div className={styles.contentInner}>{children}</div>
      </Content>

      {isMobile && (
        <Drawer
          placement="left"
          width={270}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          closable={false}
          className={styles.drawer}
        >
          {renderSidebar()}
        </Drawer>
      )}

      <UserModal open={userOpen} onClose={() => setUserOpen(false)} />
    </Layout>
  )
}

export default AppLayout
