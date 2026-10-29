import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Avatar from './Avatar.jsx'
import Badge from './Badge.jsx'
import Button from './Button.jsx'
import Input from './Input.jsx'
import Skeleton from './Skeleton.jsx'

describe('Button', () => {
  it('renders its label and fires onClick', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Send</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies the danger variant tokens and blocks clicks when disabled', () => {
    const onClick = vi.fn()
    render(<Button variant="danger" disabled onClick={onClick}>Delete</Button>)
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toBeDisabled()
    expect(button.className).toContain('--danger')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Input', () => {
  it('forwards value changes and placeholder', () => {
    const onChange = vi.fn()
    render(<Input placeholder="Search people" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Search people')
    fireEvent.change(input, { target: { value: 'ama' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(input).toHaveClass('border-[var(--border)]')
  })
})

describe('Avatar', () => {
  it('derives up to two initials and shows an online dot', () => {
    const { container } = render(<Avatar name="Ama Kofi" online />)
    expect(screen.getByText('AK')).toBeInTheDocument()
    expect(container.querySelector('span')).not.toBeNull()
  })

  it('renders an image with the display name as alt text', () => {
    render(<Avatar name="Kofi" src="https://example.test/avatar.png" />)
    expect(screen.getByAltText('Kofi')).toHaveAttribute('src', 'https://example.test/avatar.png')
  })
})

describe('Badge and Skeleton', () => {
  it('renders badge content', () => {
    render(<Badge>3</Badge>)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders a skeleton with the requested sizing classes', () => {
    const { container } = render(<Skeleton className="h-6 w-32" />)
    expect(container.firstChild).toHaveClass('h-6', 'w-32')
  })
})
