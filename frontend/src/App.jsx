import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useThemeStore } from './store/theme.js'
import { useAuthStore } from './store/auth.js'
import { connectSocket, disconnectSocket } from './lib/socket.js'
import Chats from './features/chats/Chats.jsx'
import DesignPreview from './app/DesignPreview.jsx'
import Login from './features/auth/Login.jsx'
import Register from './features/auth/Register.jsx'
import Profile from './features/profile/Profile.jsx'
import ProtectedRoute from './app/ProtectedRoute.jsx'
import ConnectionBanner from './components/ui/ConnectionBanner.jsx'
import ToastHost from './components/ui/Toast.jsx'

const queryClient = new QueryClient()

export default function App() {
  useThemeStore()
  const accessToken = useAuthStore((s) => s.accessToken)
  useEffect(() => {
    if (accessToken) connectSocket()
    else disconnectSocket()
  }, [accessToken])
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionBanner />
      <ToastHost />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/design-preview" element={<DesignPreview />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Chats /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
