import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'

export default function ProtectedRoute({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  if (!accessToken) return <Navigate to="/login" replace />
  return children
}
