"use client"

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { csrfFetch } from '@/lib/csrf-fetch'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type VerificationStatus = 
  | 'idle'
  | 'pending'
  | 'verifying'
  | 'verified'
  | 'failed'
  | 'expired'
  | 'already_verified'
  | 'rate_limited'

interface VerificationState {
  status: VerificationStatus
  email: string | null
  error: string | null
  canResend: boolean
  resendCooldown: number
  attempts: number
  lastAttemptAt: number | null
}

interface EmailVerificationContextValue {
  // State
  state: VerificationState
  
  // Actions
  sendVerificationEmail: (email: string, name: string, role: 'owner' | 'tenant') => Promise<boolean>
  resendVerificationEmail: () => Promise<boolean>
  verifyToken: (token: string) => Promise<boolean>
  resetState: () => void
  
  // Utilities
  isRateLimited: () => boolean
  getRemainingCooldown: () => number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RESEND_COOLDOWN_MS = 60 * 1000 // 1 minute between resends
const MAX_ATTEMPTS_PER_HOUR = 5
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

const VERIFICATION_ERRORS: Record<string, string> = {
  missing_token: 'Verification link is incomplete. Please check your email and try again.',
  invalid_token: 'This verification link is invalid or has already been used.',
  expired: 'This verification link has expired. Please request a new one.',
  already_verified: 'Your email is already verified. You can log in now.',
  rate_limited: 'Too many attempts. Please wait before trying again.',
  server_error: 'Something went wrong. Please try again later.',
  network_error: 'Network error. Please check your connection and try again.',
  email_not_found: 'No account found with this email address.',
  email_already_exists: 'This email is already registered and verified.',
}

// ============================================================================
// CONTEXT
// ============================================================================

const EmailVerificationContext = createContext<EmailVerificationContextValue | null>(null)

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function EmailVerificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  
  const [state, setState] = useState<VerificationState>({
    status: 'idle',
    email: null,
    error: null,
    canResend: true,
    resendCooldown: 0,
    attempts: 0,
    lastAttemptAt: null,
  })

  // ============================================================================
  // RATE LIMITING LOGIC
  // ============================================================================

  const isRateLimited = useCallback((): boolean => {
    if (!state.lastAttemptAt) return false
    
    const timeSinceLastAttempt = Date.now() - state.lastAttemptAt
    
    // Check if within cooldown period
    if (timeSinceLastAttempt < RESEND_COOLDOWN_MS) {
      return true
    }
    
    // Check if exceeded max attempts per hour
    if (state.attempts >= MAX_ATTEMPTS_PER_HOUR) {
      const timeInWindow = Date.now() - state.lastAttemptAt
      if (timeInWindow < ATTEMPT_WINDOW_MS) {
        return true
      }
    }
    
    return false
  }, [state.lastAttemptAt, state.attempts])

  const getRemainingCooldown = useCallback((): number => {
    if (!state.lastAttemptAt) return 0
    
    const timeSinceLastAttempt = Date.now() - state.lastAttemptAt
    const remaining = RESEND_COOLDOWN_MS - timeSinceLastAttempt
    
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0
  }, [state.lastAttemptAt])

  // ============================================================================
  // COOLDOWN TIMER
  // ============================================================================

  useEffect(() => {
    if (!state.canResend && state.lastAttemptAt) {
      const interval = setInterval(() => {
        const cooldown = getRemainingCooldown()
        
        setState(prev => ({
          ...prev,
          resendCooldown: cooldown,
          canResend: cooldown === 0,
        }))
        
        if (cooldown === 0) {
          clearInterval(interval)
        }
      }, 1000)
      
      return () => clearInterval(interval)
    }
  }, [state.canResend, state.lastAttemptAt, getRemainingCooldown])

  // ============================================================================
  // SEND VERIFICATION EMAIL
  // ============================================================================

  const sendVerificationEmail = useCallback(async (
    email: string,
    name: string,
    role: 'owner' | 'tenant'
  ): Promise<boolean> => {
    // Check rate limiting
    if (isRateLimited()) {
      const cooldown = getRemainingCooldown()
      setState(prev => ({
        ...prev,
        status: 'rate_limited',
        error: `Please wait ${cooldown} seconds before trying again.`,
      }))
      
      toast.error('Too many attempts', {
        description: `Please wait ${cooldown} seconds before trying again.`,
      })
      
      return false
    }

    setState(prev => ({
      ...prev,
      status: 'pending',
      email,
      error: null,
    }))

    try {
      const response = await csrfFetch('/api/auth/send-verification', {
        method: 'POST',
        body: JSON.stringify({ email, name, role }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send verification email')
      }

      setState(prev => ({
        ...prev,
        status: 'pending',
        email,
        canResend: false,
        attempts: prev.attempts + 1,
        lastAttemptAt: Date.now(),
        resendCooldown: RESEND_COOLDOWN_MS / 1000,
      }))

      toast.success('Verification email sent!', {
        description: 'Please check your inbox and spam folder.',
        duration: 5000,
      })

      return true
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to send verification email'
      
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: errorMessage,
      }))

      toast.error('Failed to send email', {
        description: errorMessage,
      })

      return false
    }
  }, [isRateLimited, getRemainingCooldown])

  // ============================================================================
  // RESEND VERIFICATION EMAIL
  // ============================================================================

  const resendVerificationEmail = useCallback(async (): Promise<boolean> => {
    if (!state.email) {
      toast.error('No email address found')
      return false
    }

    if (isRateLimited()) {
      const cooldown = getRemainingCooldown()
      toast.error('Too many attempts', {
        description: `Please wait ${cooldown} seconds before trying again.`,
      })
      return false
    }

    setState(prev => ({
      ...prev,
      status: 'pending',
      error: null,
    }))

    try {
      const response = await csrfFetch('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: state.email }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle specific error cases
        if (data.message === 'Email already verified') {
          setState(prev => ({
            ...prev,
            status: 'already_verified',
            error: null,
          }))
          
          toast.success('Email already verified!', {
            description: 'You can log in now.',
          })
          
          // Redirect to login after 2 seconds
          setTimeout(() => {
            router.push('/login')
          }, 2000)
          
          return true
        }
        
        throw new Error(data.message || 'Failed to resend verification email')
      }

      setState(prev => ({
        ...prev,
        status: 'pending',
        canResend: false,
        attempts: prev.attempts + 1,
        lastAttemptAt: Date.now(),
        resendCooldown: RESEND_COOLDOWN_MS / 1000,
      }))

      toast.success('Verification email resent!', {
        description: 'Please check your inbox and spam folder.',
        duration: 5000,
      })

      return true
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to resend verification email'
      
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: errorMessage,
      }))

      toast.error('Failed to resend email', {
        description: errorMessage,
      })

      return false
    }
  }, [state.email, isRateLimited, getRemainingCooldown, router])

  // ============================================================================
  // VERIFY TOKEN
  // ============================================================================

  const verifyToken = useCallback(async (token: string): Promise<boolean> => {
    if (!token || token.length < 32) {
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: VERIFICATION_ERRORS.invalid_token,
      }))
      return false
    }

    setState(prev => ({
      ...prev,
      status: 'verifying',
      error: null,
    }))

    try {
      // The API endpoint will handle the redirect, but we track status here
      const response = await fetch(`/api/verify-email?token=${token}`, {
        method: 'GET',
        redirect: 'manual', // Don't auto-follow redirects
      })

      // Check response status
      if (response.type === 'opaqueredirect' || response.status === 0) {
        // Redirect happened, verification likely successful
        setState(prev => ({
          ...prev,
          status: 'verified',
          error: null,
        }))
        return true
      }

      // If we get here, check the response
      if (!response.ok) {
        throw new Error('Verification failed')
      }

      setState(prev => ({
        ...prev,
        status: 'verified',
        error: null,
      }))

      return true
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: error.message || VERIFICATION_ERRORS.server_error,
      }))

      return false
    }
  }, [])

  // ============================================================================
  // RESET STATE
  // ============================================================================

  const resetState = useCallback(() => {
    setState({
      status: 'idle',
      email: null,
      error: null,
      canResend: true,
      resendCooldown: 0,
      attempts: 0,
      lastAttemptAt: null,
    })
  }, [])

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: EmailVerificationContextValue = {
    state,
    sendVerificationEmail,
    resendVerificationEmail,
    verifyToken,
    resetState,
    isRateLimited,
    getRemainingCooldown,
  }

  return (
    <EmailVerificationContext.Provider value={value}>
      {children}
    </EmailVerificationContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

export function useEmailVerification() {
  const context = useContext(EmailVerificationContext)
  
  if (!context) {
    throw new Error('useEmailVerification must be used within EmailVerificationProvider')
  }
  
  return context
}

// ============================================================================
// UTILITY FUNCTIONS (exported for use in components)
// ============================================================================

export function getVerificationErrorMessage(reason: string): string {
  return VERIFICATION_ERRORS[reason] || VERIFICATION_ERRORS.server_error
}

export function getVerificationStatusColor(status: VerificationStatus): string {
  switch (status) {
    case 'verified':
    case 'already_verified':
      return 'text-green-600'
    case 'failed':
    case 'expired':
      return 'text-red-600'
    case 'rate_limited':
      return 'text-orange-600'
    case 'verifying':
    case 'pending':
      return 'text-blue-600'
    default:
      return 'text-gray-600'
  }
}

export function getVerificationStatusIcon(status: VerificationStatus): string {
  switch (status) {
    case 'verified':
    case 'already_verified':
      return '✅'
    case 'failed':
    case 'expired':
      return '❌'
    case 'rate_limited':
      return '⏱️'
    case 'verifying':
    case 'pending':
      return '⏳'
    default:
      return '📧'
  }
}
