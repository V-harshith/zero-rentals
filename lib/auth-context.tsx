"use client"

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { signIn, signOut, getCurrentUser } from "./auth"
import { supabase } from "./supabase"
import { initializeSessionManagement } from "./session-manager"
import { toast } from "sonner"

// Auth state change queue types
type AuthStateChange =
  | { type: 'LOGIN'; email: string; password: string; resolve: (result: boolean) => void }
  | { type: 'LOGOUT'; resolve: () => void }
  | { type: 'SET_USER'; user: User | null }
  | { type: 'SET_LOADING'; loading: boolean }

interface AuthStateQueue {
  enqueue: (change: AuthStateChange) => void
  clear: () => void
  isProcessing: () => boolean
}

type UserType = "admin" | "owner" | "tenant" | null

interface User {
  id: string
  email: string
  name: string
  phone?: string
  role: UserType
  city?: string
  address?: string
  business_name?: string
  gst_number?: string
  bank_name?: string
  account_number?: string
  ifsc_code?: string
  account_holder_name?: string
  preferences?: any
  subscription?: 'free' | 'basic' | 'premium' | 'elite'
}

interface UserWithLegacyType extends User {
  type: UserType // Legacy field for backward compatibility
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  isLoading: boolean
  loading: boolean // Alias for isLoading
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Ref to prevent duplicate getCurrentUser calls
  const isLoadingUserRef = useRef(false)
  const hasInitializedRef = useRef(false)
  const pendingLoadPromiseRef = useRef<Promise<void> | null>(null)
  const lastLoadTimeRef = useRef<number>(0)
  const loginInProgressRef = useRef(false)
  const currentUserRef = useRef<User | null>(null) // Track current user without closure issues
  const sessionManagerCleanupRef = useRef<(() => void) | null>(null) // Store cleanup function
  const retryCountRef = useRef(0) // Track retry attempts for session recovery
  const COOLDOWN_MS = 5000 // 5-second cooldown between requests
  const MAX_RETRY_ATTEMPTS = 2 // Maximum retry attempts for session recovery

  // Auth state queue for sequential processing
  const queueRef = useRef<AuthStateChange[]>([])
  const processingRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  // Cancel in-flight requests
  const cancelInFlightRequests = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  // Process auth state changes sequentially
  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return

    processingRef.current = true

    while (queueRef.current.length > 0) {
      // Check if component is still mounted
      if (!isMountedRef.current) {
        queueRef.current = []
        break
      }

      const change = queueRef.current.shift()
      if (!change) continue

      try {
        switch (change.type) {
          case 'SET_USER':
            if (isMountedRef.current) {
              setUser(change.user)
              currentUserRef.current = change.user
            }
            break
          case 'SET_LOADING':
            if (isMountedRef.current) {
              setIsLoading(change.loading)
            }
            break
        }
      } catch (error) {
        // Silently handle errors to prevent queue from getting stuck
      }
    }

    processingRef.current = false
  }, [])

  // Enqueue auth state change
  const enqueueChange = useCallback((change: AuthStateChange) => {
    queueRef.current.push(change)
    // Trigger queue processing
    processQueue()
  }, [processQueue])

  // Clear queue (used on logout)
  const clearQueue = useCallback(() => {
    queueRef.current = []
  }, [])

  // Auth queue API
  const authQueue: AuthStateQueue = {
    enqueue: enqueueChange,
    clear: clearQueue,
    isProcessing: () => processingRef.current,
  }

  // Memoized function to load user - prevents duplicate calls with deduplication
  // CRITICAL: No dependencies to prevent stale closure issues
  // Uses refs for all state access to ensure latest values
  const loadUser = useCallback(async (source: string) => {
    // Check cooldown to prevent rapid successive calls
    const now = Date.now()
    if (now - lastLoadTimeRef.current < COOLDOWN_MS) {
      return
    }

    // Skip if already loading - return existing promise for deduplication
    if (isLoadingUserRef.current && pendingLoadPromiseRef.current) {
      return pendingLoadPromiseRef.current
    }

    isLoadingUserRef.current = true
    lastLoadTimeRef.current = now

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController()

    const loadPromise = (async () => {
      // Timeout protection for session recovery (10 seconds for slow networks)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Session recovery timeout')), 10000)
      })

      try {
        const currentUser = await Promise.race([getCurrentUser(), timeoutPromise])
        // Check if request was aborted or component unmounted
        if (abortControllerRef.current?.signal.aborted || !isMountedRef.current) {
          return
        }
        if (currentUser) {
          const userWithRole = {
            ...currentUser,
            role: currentUser.role as UserType,
            type: currentUser.role as UserType,
          } as UserWithLegacyType
          // Use queue for state update
          enqueueChange({ type: 'SET_USER', user: userWithRole })
          // Store cleanup function to prevent memory leaks - only initialize once
          if (!sessionManagerCleanupRef.current) {
            sessionManagerCleanupRef.current = initializeSessionManagement()
          }
        } else {
          enqueueChange({ type: 'SET_USER', user: null })
        }
      } catch (error) {
        // Check if request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return
        }
        enqueueChange({ type: 'SET_USER', user: null })
        // Error handled silently - no need to throw
      } finally {
        // ALWAYS reset loading state to prevent getting stuck
        if (isMountedRef.current) {
          enqueueChange({ type: 'SET_LOADING', loading: false })
        }
        isLoadingUserRef.current = false
        pendingLoadPromiseRef.current = null
        abortControllerRef.current = null
      }
    })()

    pendingLoadPromiseRef.current = loadPromise
    return loadPromise
  }, [enqueueChange]) // No dependencies - uses refs for state access

  // Load user on mount and listen for auth changes
  useEffect(() => {
    // Set mounted flag
    isMountedRef.current = true

    // Prevent double initialization in React Strict Mode
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    // Safety timeout to prevent permanent loading state (15 seconds)
    const safetyTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        enqueueChange({ type: 'SET_LOADING', loading: false })
      }
    }, 15000)

    // Initial user load - don't set isLoading false here
    // Wait for INITIAL_SESSION event to ensure session is fully restored
    loadUser("mount").catch(() => {
      // Error handled in loadUser - ensure loading state is reset
      if (isMountedRef.current) {
        enqueueChange({ type: 'SET_LOADING', loading: false })
      }
    })

    // CRITICAL: Also listen for INITIAL_SESSION to handle session restore on refresh
    // This fires when Supabase finishes checking for existing session from cookies
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // CRITICAL: Skip all auth state handling during password recovery flow
      // The reset-password page handles PASSWORD_RECOVERY events independently
      // Processing these events here causes race conditions and state conflicts
      if (event === "PASSWORD_RECOVERY") {
        // Password recovery flow is handled by the reset-password page
        // Don't interfere with that flow
        return
      }

      if (event === "INITIAL_SESSION") {
        // Session restored from cookies - always load user on initial session
        // The loadUser function has deduplication to prevent duplicate calls
        try {
          if (session) {
            await loadUser("INITIAL_SESSION")
          }
        } catch {
          // Error handled in loadUser - ensure user is null on failure
          enqueueChange({ type: 'SET_USER', user: null })
          currentUserRef.current = null
          // Attempt retry if under max attempts
          if (retryCountRef.current < MAX_RETRY_ATTEMPTS) {
            retryCountRef.current++
            setTimeout(() => {
              if (isMountedRef.current && !currentUserRef.current) {
                loadUser("INITIAL_SESSION_RETRY")
              }
            }, 2000 * retryCountRef.current) // Exponential backoff: 2s, 4s
          }
        } finally {
          // ALWAYS mark loading as complete, even on errors
          // loadUser now handles this, but ensure it's set for the no-session case
          if (!session) {
            enqueueChange({ type: 'SET_LOADING', loading: false })
          }
        }
      } else if (event === "SIGNED_IN" && session) {
        // Skip if we're already processing a login via the login() function
        // This prevents race condition where both login() and this listener try to set user
        if (loginInProgressRef.current) {
          return
        }
        // Small delay to let the session fully propagate
        setTimeout(() => {
          if (isMountedRef.current) {
            loadUser("SIGNED_IN")
          }
        }, 100)
      } else if (event === "SIGNED_OUT") {
        if (isMountedRef.current) {
          enqueueChange({ type: 'SET_USER', user: null })
          enqueueChange({ type: 'SET_LOADING', loading: false })
        }
      } else if (event === "TOKEN_REFRESHED") {
        // Session was refreshed - reload user to ensure we have latest data
        // Skip if we're already loading to prevent race conditions
        if (!isLoadingUserRef.current && isMountedRef.current) {
          await loadUser("TOKEN_REFRESHED")
        }
      }
    })

    // Cross-tab session synchronization
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'supabase.auth.token') {
        // Skip if login is in progress to prevent race conditions
        if (loginInProgressRef.current) return

        if (!isMountedRef.current) return

        if (!e.newValue) {
          enqueueChange({ type: 'SET_USER', user: null })
        } else {
          loadUser("cross-tab")
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)

    // CRITICAL FIX: Listen for visibility changes to recover session when tab becomes active
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Only reload if we don't have a user and aren't already loading
        // Use ref to avoid stale closure issues
        if (!currentUserRef.current && !isLoadingUserRef.current && isMountedRef.current) {
          loadUser("visibility-change")
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      // Mark component as unmounted to prevent state updates
      isMountedRef.current = false
      // Cancel any in-flight requests
      cancelInFlightRequests()
      // Clear the auth state queue
      clearQueue()
      // Cleanup timeouts and listeners
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
      window.removeEventListener('storage', handleStorageChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadUser, enqueueChange, cancelInFlightRequests, clearQueue])

  const login = async (email: string, password: string): Promise<boolean> => {
    // Prevent race condition with onAuthStateChange listener
    loginInProgressRef.current = true
    enqueueChange({ type: 'SET_LOADING', loading: true })

    // Add timeout protection for login
    const loginTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        enqueueChange({ type: 'SET_LOADING', loading: false })
      }
      loginInProgressRef.current = false
      toast.error('Login Timeout', {
        description: 'Login is taking too long. Please check your connection and try again.',
      })
    }, 10000)

    try {
      const { user: authUser, userData } = await signIn(email, password)

      clearTimeout(loginTimeout) // Clear timeout on success

      if (!userData) {
        throw new Error('User profile not found. Please try again or contact support if the issue persists.')
      }

      const authenticatedUser: UserWithLegacyType = {
        ...userData,
        id: authUser.id,
        email: authUser.email!,
        role: userData.role as UserType,
        type: userData.role as UserType,
      }

      // Set user state and mark loading complete using queue
      if (isMountedRef.current) {
        enqueueChange({ type: 'SET_USER', user: authenticatedUser })
        enqueueChange({ type: 'SET_LOADING', loading: false })
      }
      loginInProgressRef.current = false

      // Redirect based on user type - all users go to their dashboard
      router.push(`/dashboard/${userData.role}`)
      return true
    } catch (error: any) {
      clearTimeout(loginTimeout) // Clear timeout on error
      if (isMountedRef.current) {
        enqueueChange({ type: 'SET_LOADING', loading: false })
      }
      loginInProgressRef.current = false

      // Handle specific error messages from lib/auth.ts
      if (error.message?.includes('Invalid email or password') || error.message?.includes('Invalid login credentials')) {
        toast.error('Login Failed', {
          description: 'The email or password you entered is incorrect. Please check your credentials and try again.',
          duration: 4000,
        })
        return false
      }

      // Handle email not verified
      if (error.message === 'EMAIL_NOT_VERIFIED') {
        toast.error('Email Not Verified', {
          description: 'Please check your inbox and click the verification link to activate your account.',
          duration: 6000,
        })
        return false
      }

      // Handle account suspended
      if (error.message?.includes('account has been suspended')) {
        toast.error('Account Suspended', {
          description: error.message,
          duration: 6000,
        })
        return false
      }

      // Handle profile not found (race condition during login)
      if (error.message?.includes('profile not found') || error.message?.includes('User data not found')) {
        toast.error('Login Issue', {
          description: 'There was a problem loading your profile. Please try again. If the issue persists, contact support.',
          duration: 5000,
        })
        return false
      }

      // Handle other errors
      toast.error('Login Error', {
        description: error?.message || 'An unexpected error occurred during login. Please try again.',
      })
      return false
    }
  }

  const logout = async () => {
    // 1. Cancel any in-flight auth requests
    cancelInFlightRequests()

    // 2. Clear the auth state queue to prevent pending updates
    clearQueue()

    // 3. Clear user state IMMEDIATELY (optimistic update) using queue
    if (isMountedRef.current) {
      enqueueChange({ type: 'SET_USER', user: null })
    }

    // 4. Clean up session manager to prevent memory leaks
    if (sessionManagerCleanupRef.current) {
      sessionManagerCleanupRef.current()
      sessionManagerCleanupRef.current = null
    }

    try {
      // 5. Sign out from Supabase in background
      await supabase.auth.signOut()
    } catch {
      // Error handled silently
    }

    // 6. Force immediate redirect (use href instead of replace for reliability)
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, loading: isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
