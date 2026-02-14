"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { forgotPasswordAction } from "@/app/actions/auth-actions"
import { toast } from "sonner"
import { Mail, ArrowLeft } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address")
      setIsLoading(false)
      return
    }

    try {
      const result = await forgotPasswordAction(email)
      if (result.success) {
        setEmailSent(true)
        toast.success("Check your email for password reset instructions.")
      } else {
        throw new Error(result.error || "Failed to send reset email")
      }
    } catch (error: any) {
      console.error("Password reset error:", error)
      toast.error(error.message || "Failed to send reset email. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Forgot Password</CardTitle>
          <CardDescription className="text-center">
            {emailSent
              ? "Check your email for reset instructions"
              : "Enter your email to receive a password reset link"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!emailSent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send Reset Link"}
              </Button>

              <div className="text-center text-sm">
                <Link href="/login" className="text-primary hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" />
                  Back to Login
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  We've sent a password reset link to <strong>{email}</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  Click the link in the email to reset your password.
                </p>
              </div>

              <Button variant="outline" className="w-full" onClick={() => setEmailSent(false)}>
                Didn't receive email? Try again
              </Button>

              <div className="text-center text-sm">
                <Link href="/login" className="text-primary hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" />
                  Back to Login
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
