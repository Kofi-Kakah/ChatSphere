import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useThemeStore } from './store/theme.js'
import Shell from './app/Shell.jsx'
import DesignPreview from './app/DesignPreview.jsx'

const queryClient = new QueryClient()

export default function App() {
  useThemeStore()
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Shell />} />
          <Route path="/design-preview" element={<DesignPreview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
