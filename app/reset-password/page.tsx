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
    let timeoutId: NodeJS.Timeout
    let isMounted = true

    // Listen for auth state changes (including RECOVERY from email link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return

      console.log("[AUTH] Password Reset - Auth event:", event)

      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset link from email - session is being created
        console.log("✅ PASSWORD_RECOVERY event detected")
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)
        clearTimeout(timeoutId)
      } else if (event === 'SIGNED_IN' && session) {
        // Session established (could be from token in URL hash)
        console.log("✅ User signed in for password reset")
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)
        clearTimeout(timeoutId)
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Token was refreshed, still valid
        setHasValidSession(true)
        setIsCheckingSession(false)
        clearTimeout(timeoutId)
      }
    })

    // Also check for existing session (in case page was refreshed)
    const checkExistingSession = async () => {
      // Give Supabase more time to process URL hash token (network delay)
      await new Promise(resolve => setTimeout(resolve, 500))

      if (!isMounted) return

      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        console.log("✅ Existing session found for password reset")
        setHasValidSession(true)
        setSessionError(null)
        setIsCheckingSession(false)
      } else {
        // No session yet - might be waiting for RECOVERY event
        // Wait longer (30 seconds) before showing error - network can be slow on mobile
        timeoutId = setTimeout(() => {
          if (isMounted && !hasValidSession) {
            setIsCheckingSession(false)
            setSessionError("Unable to verify reset link. This may be due to slow network. Please try again or request a new password reset.")
          }
        }, 30000) // 30 seconds - industry standard for auth operations
    }

    checkExistingSession()

    return () => {
      isMounted = false
      clearTimeout(timeoutId)
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
      toast.success("Password updated successfully!", {
        description: "You can now log in with your new password."
      })
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/login")
      }, 2000)
    } catch (error: any) {
      console.error("Password update error:", error)
      toast.error(error.message || "Failed to update password. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center justify-center gap-2">
            <Image
              src="/zerorentals-logo.png"
              alt="ZeroRentals"
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
            />
            <span className="text-2xl font-bold">ZeroRentals</span>
          </Link>
        </div>

        <Card className="border-2 shadow-xl">
          <CardHeader className="space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-teal-600 rounded-full flex items-center justify-center"
            >
              <Lock className="h-8 w-8 text-white" />
            </motion.div>
            
            <div className="text-center">
              <CardTitle className="text-2xl">Reset Password</CardTitle>
              <CardDescription className="mt-2">Enter your new secure password</CardDescription>
            </div>
          </CardHeader>
          
          <CardContent>
            {/* Loading State */}
            {isCheckingSession && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Verifying reset link...</p>
                <p className="text-xs text-muted-foreground">This may take up to 30 seconds on slow networks</p>
              </div>
            )}

            {/* Error State */}
            {!isCheckingSession && sessionError && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-900 mb-1">Session Error</h4>
                    <p className="text-sm text-red-700">{sessionError}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Link href="/forgot-password">
                    <Button className="w-full" variant="default">
                      Request New Reset Link
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button className="w-full" variant="outline">
                      Back to Login
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Password Reset Form - Only show if session is valid */}
            {!isCheckingSession && hasValidSession && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      value={formData.password}
                      onChange={handlePasswordChange}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Password Strength Indicator */}
                  {formData.password && (
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`h-3 w-3 ${passwordStrength.hasLength ? 'text-green-600' : 'text-gray-300'}`} />
                        <span className={passwordStrength.hasLength ? 'text-green-600' : 'text-muted-foreground'}>
                          At least 8 characters
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`h-3 w-3 ${passwordStrength.hasUppercase ? 'text-green-600' : 'text-gray-300'}`} />
                        <span className={passwordStrength.hasUppercase ? 'text-green-600' : 'text-muted-foreground'}>
                          One uppercase letter
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`h-3 w-3 ${passwordStrength.hasLowercase ? 'text-green-600' : 'text-gray-300'}`} />
                        <span className={passwordStrength.hasLowercase ? 'text-green-600' : 'text-muted-foreground'}>
                          One lowercase letter
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`h-3 w-3 ${passwordStrength.hasNumber ? 'text-green-600' : 'text-gray-300'}`} />
                        <span className={passwordStrength.hasNumber ? 'text-green-600' : 'text-muted-foreground'}>
                          One number
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`h-3 w-3 ${passwordStrength.hasSpecial ? 'text-green-600' : 'text-gray-300'}`} />
                        <span className={passwordStrength.hasSpecial ? 'text-green-600' : 'text-muted-foreground'}>
                          One special character
                        </span>
                      </div>
                    </div>
                  )}
                </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-xs text-red-600">Passwords do not match</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full h-12" 
                disabled={isLoading || !isPasswordStrong || formData.password !== formData.confirmPassword}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>

              <div className="text-center pt-2">
                <Link href="/login" className="text-sm text-muted-foreground hover:text-primary">
                  Back to Login
                </Link>
              </div>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
