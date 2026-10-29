import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login.jsx'
import Register from './Register.jsx'
import { useAuthStore } from '../../store/auth.js'
import { api } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({ api: vi.fn() }))

function renderForm(element, path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/" element={<div>home</div>} />
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.getState().clear()
})

describe('Login form', () => {
  it('requires both fields and does not call the API', async () => {
    const user = userEvent.setup()
    renderForm(<Login />, '/login')

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getAllByText('Required')).toHaveLength(2)
    expect(api).not.toHaveBeenCalled()
  })

  it('signs in, stores the session, and navigates home', async () => {
    const user = userEvent.setup()
    api.mockResolvedValueOnce({
      user: { _id: 'u1', username: 'alice' },
      accessToken: 'access-token',
    })
    renderForm(<Login />, '/login')

    await user.type(screen.getByPlaceholderText('Email or username'), 'alice@example.test')
    await user.type(screen.getByPlaceholderText('Password'), 'correct-horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'alice@example.test', password: 'correct-horse' }),
    })
    expect(useAuthStore.getState().user).toEqual({ _id: 'u1', username: 'alice' })
    expect(useAuthStore.getState().accessToken).toBe('access-token')
  })

  it('shows the server error and stays on the form', async () => {
    const user = userEvent.setup()
    api.mockRejectedValueOnce(new Error('Invalid credentials'))
    renderForm(<Login />, '/login')

    await user.type(screen.getByPlaceholderText('Email or username'), 'alice')
    await user.type(screen.getByPlaceholderText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
    expect(screen.queryByText('home')).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})

describe('Register form', () => {
  it('requires the four fields and an 8-character password', async () => {
    const user = userEvent.setup()
    renderForm(<Register />, '/register')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getAllByText('Required')).toHaveLength(3)
    expect(screen.getByText('Min 8 chars')).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
  })

  it('enforces the digit rule and the 8-character password boundary', async () => {
    const user = userEvent.setup()
    renderForm(<Register />, '/register')

    await user.type(screen.getByPlaceholderText('Username'), 'alice')
    await user.type(screen.getByPlaceholderText('Email'), 'alice@example.test')
    await user.type(screen.getByPlaceholderText('Display name'), 'Alice')
    await user.type(screen.getByPlaceholderText('Password'), 'abc1234')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText('Must contain at least two numbers')).toBeInTheDocument()
    expect(screen.getByText('Min 8 chars')).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()

    await user.clear(screen.getByPlaceholderText('Username'))
    await user.type(screen.getByPlaceholderText('Username'), 'alice12')
    await user.clear(screen.getByPlaceholderText('Password'))
    await user.type(screen.getByPlaceholderText('Password'), 'abcd1234')
    api.mockResolvedValueOnce({
      user: { _id: 'u2', username: 'alice12' },
      accessToken: 'register-token',
    })
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'alice12',
        email: 'alice@example.test',
        displayName: 'Alice',
        password: 'abcd1234',
      }),
    })
  })

  it('shows a server error and does not navigate', async () => {
    const user = userEvent.setup()
    api.mockRejectedValueOnce(new Error('Email already registered'))
    renderForm(<Register />, '/register')

    await user.type(screen.getByPlaceholderText('Username'), 'alice12')
    await user.type(screen.getByPlaceholderText('Email'), 'alice@example.test')
    await user.type(screen.getByPlaceholderText('Display name'), 'Alice')
    await user.type(screen.getByPlaceholderText('Password'), 'abcd1234')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Email already registered')).toBeInTheDocument()
    expect(screen.queryByText('home')).toBeNull()
  })
})
