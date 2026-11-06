import { Spin } from 'antd'
import AppLayout from './components/AppLayout'
import LoginPage from './components/LoginPage'
import Router from './router'
import { AuthProvider, useAuthContext } from './context/AuthContext'
import { ChatProvider } from './context/ChatContext'

const ChatRoot = () => {
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

const App = () => {
  return (
    <AuthProvider>
      <ChatRoot />
    </AuthProvider>
  )
}

export default App
