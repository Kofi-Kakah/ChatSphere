import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useThemeStore } from './store/theme.js'
import Shell from './app/Shell.jsx'
import DesignPreview from './app/DesignPreview.jsx'
import Login from './features/auth/Login.jsx'
import Register from './features/auth/Register.jsx'
import Profile from './features/profile/Profile.jsx'

const queryClient = new QueryClient()

export default function App() {
  useThemeStore()
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/design-preview" element={<DesignPreview />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Shell /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
