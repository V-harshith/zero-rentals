"use client"

import { useState, useEffect } from "react"
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
import Image from "next/image"
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

  // Industry-standard: Use onAuthStateChange to detect RECOVERY event from email link
  // This is more reliable than getSession() and doesn't timeout
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let isMounted = true
    let sessionEstablished = false

    // Listen for auth state changes (including RECOVERY from email link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted || sessionEstablished) return

      console.log("[AUTH] Password Reset - Auth event:", event)

      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset link from email - session is being created
        console.log("✅ PASSWORD_RECOVERY event detected")
        sessionEstablished = true
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)
        if (timeoutId) clearTimeout(timeoutId)
      } else if (event === 'SIGNED_IN' && session) {
        // Session established (could be from token in URL hash)
        console.log("✅ User signed in for password reset")
        sessionEstablished = true
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)
        if (timeoutId) clearTimeout(timeoutId)
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Token was refreshed, still valid
        sessionEstablished = true
        setHasValidSession(true)
        setIsCheckingSession(false)
        if (timeoutId) clearTimeout(timeoutId)
      }
    })

    // Also check for existing session (in case page was refreshed)
    const checkExistingSession = async () => {
      // CRITICAL FIX: Give Supabase more time to process URL hash token
      // The detectSessionInUrl option needs time to parse and validate tokens
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (!isMounted || sessionEstablished) return

      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        console.log("✅ Existing session found for password reset")
        sessionEstablished = true
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)
      } else {
        // No session yet - might be waiting for RECOVERY event
        // Try one more time after a delay (Supabase may still be processing)
        await new Promise(resolve => setTimeout(resolve, 2000))

        if (!isMounted || sessionEstablished) return

        const { data: { session: retrySession } } = await supabase.auth.getSession()

        if (retrySession) {
          console.log("✅ Session found on retry for password reset")
          sessionEstablished = true
          setHasValidSession(true)
          setSessionError(null)
          setIsCheckingSession(false)
          return
        }

        // Still no session - show error
        setIsCheckingSession(false)
        setSessionError("This password reset link is invalid or has expired. Please request a new one.")
      }
    }

    checkExistingSession()

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

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
    setFormData({ ...formData, password })
    validatePasswordStrength(password)
  }

  const isPasswordStrong = Object.values(passwordStrength).every(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

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
      toast.success("Password updated successfully!")

      // Add delay before redirecting
      setTimeout(() => {
        router.push("/login")
      }, 2000)
    } catch (error) {
      console.error("Password update error:", error)
      toast.error("Failed to update password. Please try again.")
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
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      placeholder="Confirm new password"
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
