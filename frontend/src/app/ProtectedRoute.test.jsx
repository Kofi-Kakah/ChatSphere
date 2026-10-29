import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import ProtectedRoute from './ProtectedRoute.jsx'
import { useAuthStore } from '../store/auth.js'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/private"
          element={
            <ProtectedRoute>
              <div>private content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.getState().clear()
})

describe('ProtectedRoute', () => {
  it('redirects to login when there is no access token', () => {
    renderAt('/private')
    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(screen.queryByText('private content')).toBeNull()
  })

  it('renders its children when a session exists', () => {
    useAuthStore.getState().setAuth({ _id: 'u1' }, 'access-token')
    renderAt('/private')
    expect(screen.getByText('private content')).toBeInTheDocument()
    expect(screen.queryByText('login screen')).toBeNull()
  })
})
