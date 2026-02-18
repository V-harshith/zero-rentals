"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PasswordStrength } from "@/components/password-strength"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Lock, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [hasValidSession, setHasValidSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  })

  const [passwordStrength, setPasswordStrength] = useState(0)

  // Use refs to prevent race conditions and stale closures
  const isMountedRef = useRef(true)
  const sessionEstablishedRef = useRef(false)

  // Fetch CSRF token on mount
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const response = await fetch("/api/csrf")
        const data = await response.json()
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken)
        }
      } catch (error) {
        console.error("Failed to fetch CSRF token:", error)
      }
    }
    fetchCsrfToken()
  }, [])

  // Session validation with proper race condition handling
  const validateSession = useCallback(async () => {
    // Wait for Supabase to process URL hash (detectSessionInUrl)
    await new Promise(resolve => setTimeout(resolve, 500))

    if (!isMountedRef.current || sessionEstablishedRef.current) return

    // Check if we have a valid session from the recovery link
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      setSessionError("Failed to validate session. Please try again.")
      setIsCheckingSession(false)
      return
    }

    if (session) {
      sessionEstablishedRef.current = true
      setHasValidSession(true)
      setIsCheckingSession(false)

      // Clear the URL hash to prevent re-processing on refresh
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search)
      }
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    // Set up auth state listener FIRST to catch PASSWORD_RECOVERY event
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMountedRef.current) return

      if (event === "PASSWORD_RECOVERY") {
        sessionEstablishedRef.current = true
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)

        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search)
        }
      } else if (event === "SIGNED_IN" && session && !sessionEstablishedRef.current) {
        sessionEstablishedRef.current = true
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)

        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search)
        }
      }
    })

    // Check for existing session after setting up listener
    const sessionCheckTimeout = setTimeout(() => {
      validateSession()
    }, 1000)

    // Safety timeout - show error if session isn't established after 10 seconds
    const safetyTimeout = setTimeout(() => {
      if (isMountedRef.current && !sessionEstablishedRef.current) {
        setIsCheckingSession(false)
        setSessionError("This password reset link is invalid or has expired. Please request a new one.")
      }
    }, 10000)

    return () => {
      isMountedRef.current = false
      clearTimeout(sessionCheckTimeout)
      clearTimeout(safetyTimeout)
      authListener.subscription.unsubscribe()
    }
  }, [validateSession])

  const isPasswordValid = passwordStrength === 100

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!csrfToken) {
      toast.error("Security token not available. Please refresh the page.")
      return
    }

    // Prevent double submission
    if (isLoading) return

    setIsLoading(true)

    // Validation
    if (!formData.password || !formData.confirmPassword) {
      toast.error("All fields are required")
      setIsLoading(false)
      return
    }

    if (!isPasswordValid) {
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
      // Get the current session's access token
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error("Session expired")
      }

      // Call the API route to update password
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ password: formData.password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to update password")
      }

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
      console.error("Password reset error:", error)

      if (error.message?.includes("session") || error.message?.includes("expired")) {
        toast.error("Session expired", {
          description: "Your password reset link has expired. Please request a new one.",
        })
        setSessionError("This password reset link has expired. Please request a new one.")
        setHasValidSession(false)
      } else if (error.message?.includes("weak")) {
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
              <Link href="/auth/forgot-password">Request New Link</Link>
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
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, password: e.target.value }))
                    }
                    placeholder="Enter new password"
                    required
                    minLength={8}
                    disabled={isLoading}
                  />
                  <PasswordStrength
                    password={formData.password}
                    onStrengthChange={setPasswordStrength}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))
                    }
                    placeholder="Confirm new password"
                    required
                    disabled={isLoading}
                  />
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-sm text-red-500">Passwords do not match</p>
                  )}
                  {formData.confirmPassword && formData.password === formData.confirmPassword && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Passwords match
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !isPasswordValid || formData.password !== formData.confirmPassword}
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

              <div className="mt-4 text-center">
                <Link
                  href="/login"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to Login
                </Link>
              </div>
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
