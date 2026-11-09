import { Navigate, Route, Routes } from 'react-router-dom'
import Chat from '../pages/chat'

const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<Chat />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default Router
