"use client"

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import { updatePassword } from '@/lib/auth'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface ChangePasswordDialogProps {
  trigger?: React.ReactNode
}

export function ChangePasswordDialog({ trigger }: ChangePasswordDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [passwordStrength, setPasswordStrength] = useState({
    hasLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false,
  })

  const validatePasswordStrength = (password: string) => {
    setPasswordStrength({
      hasLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    })
  }

  const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value
    setFormData(prev => ({ ...prev, newPassword: password }))
    validatePasswordStrength(password)
  }

  const isPasswordStrong = Object.values(passwordStrength).every(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Validate form
      if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
        toast.error('All fields are required')
        return
      }

      if (formData.newPassword !== formData.confirmPassword) {
        toast.error('New passwords do not match')
        return
      }

      if (!isPasswordStrong) {
        toast.error('Password does not meet strength requirements')
        return
      }

      if (formData.currentPassword === formData.newPassword) {
        toast.error('New password must be different from current password')
        return
      }

      // Verify current password by attempting to sign in
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        toast.error('User not found')
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: formData.currentPassword,
      })

      if (signInError) {
        toast.error('Current password is incorrect')
        return
      }

      // Update password
      await updatePassword(formData.newPassword)

      toast.success('Password changed successfully!', {
        description: 'You can now use your new password to log in.',
      })

      // Reset form and close dialog
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setOpen(false)

    } catch (error: any) {
      console.error('Password change error:', error)
      toast.error(error.message || 'Failed to change password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Lock className="h-4 w-4" />
            Change Password
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new secure password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password */}
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? 'text' : 'password'}
                value={formData.currentPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                placeholder="Enter current password"
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={handleNewPasswordChange}
                placeholder="Enter new password"
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Password Strength Indicator */}
            {formData.newPassword && (
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
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {formData.confirmPassword && formData.newPassword !== formData.confirmPassword && (
              <p className="text-xs text-red-600">Passwords do not match</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !isPasswordStrong || formData.newPassword !== formData.confirmPassword}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
