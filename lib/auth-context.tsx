"use client"

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { signIn, signOut, getCurrentUser } from "./auth"
import { supabase } from "./supabase"
import { initializeSessionManagement } from "./session-manager"
import { toast } from "sonner"

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

  // Memoized function to load user - prevents duplicate calls
  const loadUser = useCallback(async (source: string) => {
    // Skip if already loading
    if (isLoadingUserRef.current) {
      return
    }

    isLoadingUserRef.current = true

    try {
      const currentUser = await getCurrentUser()
      if (currentUser) {
        setUser({
          ...currentUser,
          role: currentUser.role as UserType,
          type: currentUser.role as UserType,
        } as UserWithLegacyType)
        initializeSessionManagement()
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      isLoadingUserRef.current = false
    }
  }, [])

  // Load user on mount and listen for auth changes
  useEffect(() => {
    // Prevent double initialization in React Strict Mode
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    // Safety timeout to prevent permanent loading state
    const safetyTimeout = setTimeout(() => {
      setIsLoading((current) => {
        if (current) {
          return false
        }
        return current
      })
    }, 15000)

    // Initial user load - don't set isLoading false here
    // Wait for INITIAL_SESSION event to ensure session is fully restored
    loadUser("mount").catch(() => {
      // Error handled in loadUser
    })

    // CRITICAL: Also listen for INITIAL_SESSION to handle session restore on refresh
    // This fires when Supabase finishes checking for existing session from cookies
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") {
        // Session restored from cookies - load user if we haven't already
        if (session && !user) {
          await loadUser("INITIAL_SESSION")
        }
        // Mark loading as complete once initial session check is done
        setIsLoading(false)
      } else if (event === "SIGNED_IN" && session) {
        // Small delay to let the session fully propagate
        setTimeout(() => loadUser("SIGNED_IN"), 100)
      } else if (event === "SIGNED_OUT") {
        setUser(null)
        setIsLoading(false)
      }
    })

    // Cross-tab session synchronization
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'supabase.auth.token') {
        if (!e.newValue) {
          setUser(null)
        } else {
          loadUser("cross-tab")
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)

    return () => {
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [loadUser])

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true)

    // Add timeout protection for login
    const loginTimeout = setTimeout(() => {
      setIsLoading(false)
      toast.error('Login Timeout', {
        description: 'Login is taking too long. Please check your connection and try again.',
      })
    }, 10000)

    try {
      const { user: authUser, userData } = await signIn(email, password)

      clearTimeout(loginTimeout) // Clear timeout on success

      if (!userData) {
        throw new Error('User data not found')
      }

      const authenticatedUser: UserWithLegacyType = {
        ...userData,
        id: authUser.id,
        email: authUser.email!,
        role: userData.role as UserType,
        type: userData.role as UserType,
      }

      setUser(authenticatedUser)
      setIsLoading(false)

      // Redirect based on user type - all users go to their dashboard
      router.push(`/dashboard/${userData.role}`)
      return true
    } catch (error: any) {
      clearTimeout(loginTimeout) // Clear timeout on error
      setIsLoading(false)

      // Handle specific error messages from lib/auth.ts
      if (error.message.includes('Invalid email or password') || error.message.includes('Invalid login credentials')) {
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
      if (error.message.includes('account has been suspended')) {
        toast.error('Account Suspended', {
          description: error.message,
          duration: 6000,
        })
        return false
      }

      // Handle other errors
      toast.error('Login Error', {
        description: error.message || 'An unexpected error occurred during login. Please try again.',
      })
      return false
    }
  }

  const logout = async () => {
    console.log('[AUTH] Logout: Starting logout process')

    // 1. Clear user state IMMEDIATELY (optimistic update)
    setUser(null)

    try {
      // 2. Sign out from Supabase in background
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('[AUTH] Logout: Supabase signOut error', error)
      }
    } catch (error) {
      console.error('[AUTH] Logout: Error during logout', error)
    }

    // 3. Force immediate redirect (use href instead of replace for reliability)
    console.log('[AUTH] Logout: Redirecting to home')
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
