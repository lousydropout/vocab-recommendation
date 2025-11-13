import { redirect } from '@tanstack/react-router'
import { isAuthenticated } from './auth'

/**
 * Route protection utility for TanStack Router beforeLoad
 * Redirects to /login if user is not authenticated
 */
export async function requireAuth() {
  const authenticated = await isAuthenticated()
  if (!authenticated) {
    throw redirect({
      to: '/login',
      search: {
        redirect: window.location.pathname,
      },
    })
  }
}

