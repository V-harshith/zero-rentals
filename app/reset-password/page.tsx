"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { updatePassword } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [hasValidSession, setHasValidSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  })

  const [passwordStrength, setPasswordStrength] = useState({
    hasLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false,
  })

  // Use refs to prevent race conditions and stale closures
  const isMountedRef = useRef(true)
  const sessionEstablishedRef = useRef(false)
  const authListenerRef = useRef<{ subscription: { unsubscribe: () => void } } | null>(null)

  // CRITICAL FIX: Session validation with proper race condition handling
  // The recovery flow has two paths:
  // 1. Supabase detectSessionInUrl processes the hash and fires PASSWORD_RECOVERY event
  // 2. The hash contains tokens that create a temporary session for password reset
  const validateSession = useCallback(async () => {
    console.log("[RESET_PASSWORD] validateSession called")

    // Wait for Supabase to process URL hash (detectSessionInUrl)
    await new Promise(resolve => setTimeout(resolve, 500))

    if (!isMountedRef.current || sessionEstablishedRef.current) {
      console.log("[RESET_PASSWORD] validateSession aborted - unmounted or already established")
      return
    }

    // Check if we have a valid session from the recovery link
    console.log("[RESET_PASSWORD] Checking session...")
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    console.log("[RESET_PASSWORD] Session check result:", { hasSession: !!session, hasError: !!sessionError })

    if (sessionError) {
      console.error("[RESET_PASSWORD] Session error:", sessionError)
      setSessionError("Failed to validate session. Please try again.")
      setIsCheckingSession(false)
      return
    }

    if (session) {
      console.log("[RESET_PASSWORD] Session found, establishing...")
      sessionEstablishedRef.current = true
      setHasValidSession(true)
      setIsCheckingSession(false)

      // Clear the URL hash to prevent re-processing on refresh
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    } else {
      console.log("[RESET_PASSWORD] No session found in validateSession")
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    // DEBUG: Log URL information
    console.log("[RESET_PASSWORD] Page loaded")
    console.log("[RESET_PASSWORD] Full URL:", window.location.href)
    console.log("[RESET_PASSWORD] Hash present:", !!window.location.hash)
    console.log("[RESET_PASSWORD] Hash length:", window.location.hash?.length || 0)

    // Set up auth state listener FIRST to catch PASSWORD_RECOVERY event
    // This must be done before checking session to avoid race conditions
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[RESET_PASSWORD] Auth event:", event, "Session:", !!session)
      if (!isMountedRef.current) return

      if (event === 'PASSWORD_RECOVERY') {
        // PASSWORD_RECOVERY means Supabase has processed the recovery token
        // The session should now be available
        sessionEstablishedRef.current = true
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)

        // Clear the URL hash to prevent re-processing
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      } else if (event === 'SIGNED_IN' && session && !sessionEstablishedRef.current) {
        // Session established from recovery token
        sessionEstablishedRef.current = true
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)

        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      }
    })

    authListenerRef.current = authListener

    // Check for existing session after setting up listener
    // Use a longer delay to allow Supabase to process the hash
    const sessionCheckTimeout = setTimeout(() => {
      validateSession()
    }, 1000)

    // Safety timeout - show error if session isn't established after 30 seconds
    // Increased from 10s to 30s to handle slow networks and PKCE flow
    const safetyTimeout = setTimeout(() => {
      if (isMountedRef.current && !sessionEstablishedRef.current) {
        console.error("[RESET_PASSWORD] Session establishment timeout - checking final state")
        // Try one final check before showing error
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session && isMountedRef.current) {
            console.log("[RESET_PASSWORD] Session found on final check")
            sessionEstablishedRef.current = true
            setHasValidSession(true)
            setIsCheckingSession(false)
          } else if (isMountedRef.current) {
            console.error("[RESET_PASSWORD] No session established after timeout")
            setIsCheckingSession(false)
            setSessionError("This password reset link is invalid or has expired. Please request a new one.")
          }
        })
      }
    }, 30000)

    return () => {
      isMountedRef.current = false
      clearTimeout(sessionCheckTimeout)
      clearTimeout(safetyTimeout)
      authListener.subscription.unsubscribe()
    }
  }, [validateSession])

  const validatePasswordStrength = (password: string) => {
    setPasswordStrength({
      hasLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    })
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value
    setFormData(prev => ({ ...prev, password }))
    validatePasswordStrength(password)
  }

  const isPasswordStrong = Object.values(passwordStrength).every(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Prevent double submission
    if (isLoading) return

    setIsLoading(true)

    // Validation
    if (!formData.password || !formData.confirmPassword) {
      toast.error("All fields are required")
      setIsLoading(false)
      return
    }

    if (!isPasswordStrong) {
      toast.error("Password does not meet strength requirements")
      setIsLoading(false)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match")
      setIsLoading(false)
      return
    }

    try {
      await updatePassword(formData.password)

      // Clear sensitive form data
      setFormData({ password: "", confirmPassword: "" })

      toast.success("Password updated successfully! Redirecting to login...")

      // Sign out the user after password reset to force re-login with new password
      await supabase.auth.signOut()

      // Redirect to login after a short delay
      setTimeout(() => {
        router.push("/login")
      }, 2000)
    } catch (error: any) {
      // Handle specific error types
      if (error.message?.includes('session') || error.message?.includes('expired')) {
        toast.error("Session expired", {
          description: "Your password reset link has expired. Please request a new one.",
        })
        setSessionError("This password reset link has expired. Please request a new one.")
        setHasValidSession(false)
      } else if (error.message?.includes('weak')) {
        toast.error("Weak password", {
          description: "Please choose a stronger password.",
        })
      } else {
        toast.error("Failed to update password", {
          description: error.message || "Please try again.",
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading state while checking session
  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    )
  }

  // Show error if no valid session
  if (!hasValidSession || sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Invalid or Expired Link</CardTitle>
            <CardDescription className="mt-2">
              {sessionError || "This password reset link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Please request a new password reset link.
            </p>
            <Button asChild className="w-full">
              <Link href="/forgot-password">Request New Link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex flex-col">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-5 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 w-full px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">Z</span>
            </div>
            <span className="text-xl font-bold">ZeroRentals</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card className="border-0 shadow-2xl bg-white/80 backdrop-blur-xl">
            <CardHeader className="space-y-1 pb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-2">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
              <CardDescription>
                Create a new password for your account
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={handlePasswordChange}
                      placeholder="Enter new password"
                      required
                      className="pr-10"
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Password Strength Indicator */}
                  {formData.password && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
                      <p className="text-sm font-medium text-gray-700">Password must have:</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`flex items-center gap-2 text-sm ${passwordStrength.hasLength ? 'text-green-600' : 'text-gray-500'}`}>
                          {passwordStrength.hasLength ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                          )}
                          8+ characters
                        </div>
                        <div className={`flex items-center gap-2 text-sm ${passwordStrength.hasUppercase ? 'text-green-600' : 'text-gray-500'}`}>
                          {passwordStrength.hasUppercase ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                          )}
                          Uppercase
                        </div>
                        <div className={`flex items-center gap-2 text-sm ${passwordStrength.hasLowercase ? 'text-green-600' : 'text-gray-500'}`}>
                          {passwordStrength.hasLowercase ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                          )}
                          Lowercase
                        </div>
                        <div className={`flex items-center gap-2 text-sm ${passwordStrength.hasNumber ? 'text-green-600' : 'text-gray-500'}`}>
                          {passwordStrength.hasNumber ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                          )}
                          Number
                        </div>
                        <div className={`flex items-center gap-2 text-sm ${passwordStrength.hasSpecial ? 'text-green-600' : 'text-gray-500'}`}>
                          {passwordStrength.hasSpecial ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                          )}
                          Special char
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Confirm new password"
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(prev => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-sm text-red-500">Passwords do not match</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !isPasswordStrong}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-500">
                Remember your password?{" "}
                <Link href="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} ZeroRentals. All rights reserved.</p>
      </footer>
    </div>
  )
}
