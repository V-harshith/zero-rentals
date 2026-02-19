"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { signUp } from "@/lib/auth"
import { toast } from "sonner"
import { Building2, Mail, User, Phone, ArrowLeft } from "lucide-react"
import Image from "next/image"
import { PasswordStrength } from "@/components/password-strength"
import { useAuth } from "@/lib/auth-context"
import { csrfFetch } from "@/lib/csrf-fetch"

export default function OwnerRegisterPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  })
  const [passwordStrength, setPasswordStrength] = useState(0)

  // Redirect logged-in users to their dashboard
  useEffect(() => {
    if (!authLoading && user) {
      const dashboardPath = user.role === 'tenant' ? '/' : `/dashboard/${user.role}`
      router.replace(dashboardPath)
    }
  }, [user, authLoading, router])

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Prevent flash of content before redirect
  if (user) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // Validation
    if (!formData.name || !formData.email || !formData.password) {
      toast.error("Please fill in all required fields")
      setIsLoading(false)
      return
    }

    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters")
      setIsLoading(false)
      return
    }

    if (passwordStrength < 100) {
      toast.error("Please use a stronger password")
      setIsLoading(false)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match")
      setIsLoading(false)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      toast.error("Please enter a valid email address")
      setIsLoading(false)
      return
    }

    if (!formData.phone || formData.phone.length !== 10) {
      toast.error("Phone number must be 10 digits")
      setIsLoading(false)
      return
    }


    try {
      // Fetch CSRF token before registration
      const csrfResponse = await fetch('/api/csrf')
      if (!csrfResponse.ok) {
        throw new Error('Failed to fetch CSRF token')
      }
      const { csrfToken } = await csrfResponse.json()

      const result = await signUp(formData.email, formData.password, {
        name: formData.name,
        phone: formData.phone,
        role: "owner",
      }, csrfToken)

      // Show success message with verification requirement
      if (result.requiresVerification) {
        toast.success("Account created successfully!", {
          description: "Please check your email to verify your account before logging in.",
          duration: 6000,
        })
      } else {
        // Edge case: Auto-confirmation is enabled (not recommended)
        toast.warning("Account created!", {
          description: "Email verification is disabled. You can log in immediately.",
          duration: 5000,
        })
      }

      // Redirect to verification page
      router.push(`/auth/verify-email?email=${encodeURIComponent(formData.email)}`)
    } catch (error: any) {
      console.error("Registration error:", error)
      
      // Handle specific error cases
      if (error.message.includes("already registered") || error.message.includes("already exists")) {
        toast.error("This email is already registered", {
          action: {
            label: "Login",
            onClick: () => router.push("/login/owner")
          },
          cancel: {
            label: "Resend Verify Email",
            onClick: async () => {
              const toastId = toast.loading("Sending verification email...")
              try {
                const res = await csrfFetch('/api/auth/resend-verification', {
                  method: 'POST',
                  body: JSON.stringify({ email: formData.email })
                })
                const data = await res.json()

                if (!res.ok) {
                  if (data.message === 'Email already verified') {
                    toast.success("Email already verified! Please login.", { id: toastId })
                    router.push("/login/owner")
                    return
                  }
                  throw new Error(data.error || "Failed to send email")
                }

                toast.success("Verification email sent!", { id: toastId })
              } catch (err: any) {
                toast.error(err.message, { id: toastId })
              }
            }
          }
        })
      } else if (error.message.includes("rate limit") || error.message.includes("too many")) {
        toast.error("Too many signup attempts. Please try again in a few minutes.")
      } else if (error.message.includes("Failed to complete registration")) {
        toast.error("Registration failed. Please try again.", {
          description: "If the problem persists, contact support."
        })
      } else {
        toast.error(error.message || "Registration failed. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 relative">
      {/* Back to Home - Left positioned on desktop, top on mobile */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-white/50 rounded-md absolute left-4 top-4 md:left-8 md:top-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>

      <div className="w-full max-w-md space-y-6 animate-fadeIn pt-8 md:pt-0">
        {/* Header with Logo */}
        <div className="text-center space-y-4">
          <Link href="/" className="inline-flex items-center justify-center gap-2 group">
            <Image
              src="/zerorentals-logo.png"
              alt="ZeroRentals"
              width={48}
              height={48}
              className="h-12 w-12 object-contain transition-transform group-hover:scale-110"
            />
            <span className="text-2xl font-bold">ZeroRentals</span>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Create Owner Account</h1>
            <p className="text-muted-foreground mt-2">
              List your properties and reach millions of tenants
            </p>
          </div>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Owner Registration
            </CardTitle>
            <CardDescription>
              Fill in your details to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="9876543210"
                    maxLength={10}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "") })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <PasswordInput
                  id="password"
                  placeholder="Min 8 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>

              <PasswordStrength
                password={formData.password}
                onStrengthChange={setPasswordStrength}
              />

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating Account..." : "Create Account"}
              </Button>

              <div className="mt-6 space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Already have an account?
                    </span>
                  </div>
                </div>

                <Link href="/login/owner">
                  <Button variant="outline" className="w-full h-12">
                    Sign In to Owner Account
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
