import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { login, logout, getToken, isAuthenticated, getCurrentUserInfo } from '@/lib/auth'

// Mock aws-amplify
vi.mock('aws-amplify', () => ({
  Amplify: {
    configure: vi.fn(),
  },
}))

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn(),
  fetchAuthSession: vi.fn(),
}))

import { signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth'

describe('Auth Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('login', () => {
    it('should sign in successfully and store token', async () => {
      const mockToken = {
        idToken: {
          toString: () => 'mock-id-token-123',
        },
      }

      const mockSignInOutput = {
        isSignedIn: true,
      }

      vi.mocked(signIn).mockResolvedValue(mockSignInOutput as any)
      vi.mocked(fetchAuthSession).mockResolvedValue({
        tokens: mockToken,
      } as any)

      const result = await login('teacher@example.com', 'password123')

      expect(signIn).toHaveBeenCalledWith({
        username: 'teacher@example.com',
        password: 'password123',
      })
      expect(result.isSignedIn).toBe(true)
      expect(localStorage.getItem('cognito_id_token')).toBe('mock-id-token-123')
    })

    it('should throw error on failed login', async () => {
      const error = new Error('Invalid credentials')
      error.name = 'NotAuthorizedException'
      vi.mocked(signIn).mockRejectedValue(error)

      await expect(login('teacher@example.com', 'wrong-password')).rejects.toThrow('Invalid credentials')
      expect(localStorage.getItem('cognito_id_token')).toBeNull()
    })

    it('should not store token if sign-in not complete', async () => {
      const mockSignInOutput = {
        isSignedIn: false,
      }

      vi.mocked(signIn).mockResolvedValue(mockSignInOutput as any)

      const result = await login('teacher@example.com', 'password123')

      expect(result.isSignedIn).toBe(false)
      expect(localStorage.getItem('cognito_id_token')).toBeNull()
    })
  })

  describe('logout', () => {
    it('should sign out and clear token', async () => {
      localStorage.setItem('cognito_id_token', 'existing-token')
      vi.mocked(signOut).mockResolvedValue(undefined as any)

      await logout()

      expect(signOut).toHaveBeenCalled()
      expect(localStorage.getItem('cognito_id_token')).toBeNull()
    })

    it('should clear token even if signOut fails', async () => {
      localStorage.setItem('cognito_id_token', 'existing-token')
      vi.mocked(signOut).mockRejectedValue(new Error('Sign out failed'))

      await expect(logout()).rejects.toThrow()
      expect(localStorage.getItem('cognito_id_token')).toBeNull()
    })
  })

  describe('getToken', () => {
    it('should get token from session', async () => {
      const mockToken = {
        idToken: {
          toString: () => 'session-token-123',
        },
      }

      vi.mocked(fetchAuthSession).mockResolvedValue({
        tokens: mockToken,
      } as any)

      const token = await getToken()

      expect(token).toBe('session-token-123')
      expect(localStorage.getItem('cognito_id_token')).toBe('session-token-123')
    })

    it('should fallback to localStorage if session has no token', async () => {
      localStorage.setItem('cognito_id_token', 'stored-token-123')
      vi.mocked(fetchAuthSession).mockResolvedValue({
        tokens: null,
      } as any)

      const token = await getToken()

      expect(token).toBe('stored-token-123')
    })

    it('should return null if no token available', async () => {
      vi.mocked(fetchAuthSession).mockResolvedValue({
        tokens: null,
      } as any)

      const token = await getToken()

      expect(token).toBeNull()
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(fetchAuthSession).mockRejectedValue(new Error('Session error'))
      localStorage.setItem('cognito_id_token', 'fallback-token')

      const token = await getToken()

      expect(token).toBe('fallback-token')
    })
  })

  describe('isAuthenticated', () => {
    it('should return true when user is authenticated', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        userId: 'teacher-123',
        username: 'teacher@example.com',
      } as any)

      const result = await isAuthenticated()

      expect(result).toBe(true)
    })

    it('should return false when user is not authenticated', async () => {
      vi.mocked(getCurrentUser).mockRejectedValue(new Error('Not authenticated'))

      const result = await isAuthenticated()

      expect(result).toBe(false)
    })
  })

  describe('getCurrentUserInfo', () => {
    it('should return user info when authenticated', async () => {
      const mockUser = {
        userId: 'teacher-123',
        username: 'teacher@example.com',
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser as any)

      const user = await getCurrentUserInfo()

      expect(user).toEqual(mockUser)
    })

    it('should return null when not authenticated', async () => {
      vi.mocked(getCurrentUser).mockRejectedValue(new Error('Not authenticated'))

      const user = await getCurrentUserInfo()

      expect(user).toBeNull()
    })
  })
})

