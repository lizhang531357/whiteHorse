import { Navigate, Route, Routes } from 'react-router-dom'
import Chat from '../pages/chat'

export default function Router() {
  return (
    <Routes>
      <Route path="/chat" element={<Chat />} />
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  )
}
