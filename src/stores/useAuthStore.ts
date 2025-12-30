import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  email: string
  full_name: string
}

interface LoginResult {
  success: boolean
  homePage?: string
}

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  homePage: string | null
  token: string | null
  error: string | null
  login: (usr: string, pwd: string) => Promise<LoginResult>
  logout: () => Promise<void>
  clearError: () => void
}

export const API_BASE = 'https://gcdev.m.frappe.cloud'

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      homePage: null,
      token: null,
      error: null,
      login: async (usr: string, pwd: string) => {
        try {
          set({ error: null })
          
          const response = await fetch(`${API_BASE}/api/method/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ usr, pwd }),
            credentials: 'include',
          })

          const data = await response.json()

          // Handle successful login - response can be "Logged In" or "No App"
          if (response.ok && (data.message === 'Logged In' || data.message === 'No App')) {
            const homePage = data.home_page || '/me'
            // Use the provided token for API authentication
            const token = 'b5a11fd3272c41d:b107017770524e7'
            set({
              isAuthenticated: true,
              user: {
                email: usr,
                full_name: data.full_name || usr.split('@')[0],
              },
              homePage,
              token,
              error: null,
            })
            return { success: true, homePage }
          } else {
            set({ error: data.message || 'Login failed' })
            return { success: false }
          }
        } catch {
          set({ error: 'Network error. Please try again.' })
          return { success: false }
        }
      },
      logout: async () => {
        try {
          await fetch(`${API_BASE}/api/method/logout`, {
            method: 'POST',
            credentials: 'include',
          })
        } catch {
          // Ignore logout errors
        }
        set({
          isAuthenticated: false,
          user: null,
          homePage: null,
          token: null,
          error: null,
        })
      },
      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
    }
  )
)
