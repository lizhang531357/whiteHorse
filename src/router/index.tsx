import { Navigate, Route, Routes } from 'react-router-dom'
import Chat from '../pages/chat'

const Router = () => {
  return (
    <Routes>
      <Route path="/chat" element={<Chat />} />
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  )
}

export default Router
