import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { ProtectedRoute } from './ProtectedRoute'
import SigninPage from '@/pages/auth/signin'
import DashboardOverviewPage from '@/pages/dashboard/overview'

export function AppRoutes() {
  const { isAuthenticated, homePage } = useAuthStore()

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to={homePage || '/dashboard'} replace /> : <SigninPage />
        }
      />

      {/* Protected routes - catch all authenticated routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardOverviewPage />
          </ProtectedRoute>
        }
      />

      {/* Default redirect */}
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? (homePage || '/dashboard') : '/login'} replace />}
      />
    </Routes>
  )
}
