import { Spin } from 'antd'
import AppLayout from './components/AppLayout'
import LoginPage from './components/LoginPage'
import Router from './router'
import { AuthProvider, useAuthContext } from './context/AuthContext'
import { ChatProvider } from './context/ChatContext'

function ChatRoot() {
  const { user, loading } = useAuthContext()

  if (loading) {
    return (
      <div className="app-loading">
        <Spin size="large" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <ChatProvider key={user.id}>
      <AppLayout>
        <Router />
      </AppLayout>
    </ChatProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ChatRoot />
    </AuthProvider>
  )
}
