"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { User, Mail, Key, Trash2, Save, ShieldCheck, Loader2, ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { withAuth } from "@/lib/with-auth"

function AdminProfilePage() {
    const { user, logout, isLoading } = useAuth()
    const router = useRouter()
    const [savingProfile, setSavingProfile] = useState(false)
    const [changingPassword, setChangingPassword] = useState(false)
    const [dataLoading, setDataLoading] = useState(true)
    const [profileData, setProfileData] = useState({
        name: "",
        email: "",
        phone: "",
    })

    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    })

    const [showCurrentPassword, setShowCurrentPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

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
        setPasswordData({ ...passwordData, newPassword: password })
        validatePasswordStrength(password)
    }

    const isPasswordStrong = Object.values(passwordStrength).every(Boolean)

    useEffect(() => {
        if (user?.id) {
            fetchFreshUserData()
        }
    }, [user?.id])

    const fetchFreshUserData = async () => {
        if (!user) return

        setDataLoading(true)
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .maybeSingle()

            if (error) throw error

            if (!data) {
                toast.error('Profile not found')
                return
            }

            setProfileData({
                name: data.name || "",
                email: data.email || "",
                phone: data.phone || "",
            })
        } catch (error) {
            console.error('Error fetching profile:', error)
            toast.error('Failed to load profile data')
        } finally {
            setDataLoading(false)
        }
    }

    if (dataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    const handleSaveProfile = async () => {
        setSavingProfile(true)
        try {
            const { updateUserProfile } = await import('@/lib/user-service')
            const { error } = await updateUserProfile(user!.id, {
                name: profileData.name,
                phone: profileData.phone,
            })

            if (error) throw error
            toast.success("Profile updated successfully!")

            // Refresh data from database
            await fetchFreshUserData()
        } catch (error: any) {
            toast.error(error.message || "Failed to update profile")
        } finally {
            setSavingProfile(false)
        }
    }

    const handleChangePassword = async () => {
        setChangingPassword(true)
        try {
            if (!passwordData.newPassword) {
                toast.error("Please enter a new password")
                setChangingPassword(false)
                return
            }
            if (passwordData.newPassword !== passwordData.confirmPassword) {
                toast.error("Passwords don't match")
                setChangingPassword(false)
                return
            }
            if (!passwordData.currentPassword) {
                toast.error("Please enter your current password")
                setChangingPassword(false)
                return
            }

            // Verify current password by attempting sign-in
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user!.email,
                password: passwordData.currentPassword
            })

            if (signInError) {
                toast.error("Current password is incorrect")
                setChangingPassword(false)
                return
            }

            // Update password
            const { error } = await supabase.auth.updateUser({
                password: passwordData.newPassword
            })
            if (error) throw error
            toast.success("Password changed successfully!")
            setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" })
        } catch (error: any) {
            toast.error(error.message || "Failed to update password")
        } finally {
            setChangingPassword(false)
        }
    }

    const handleDeleteAccount = async () => {
        if (confirm("WARNING: You are about to delete an ADMIN account. This action is irreversible and may impact system operations. Proceed?")) {
            try {
                const { deleteAccountAction } = await import("@/app/actions/auth-actions")
                const result = await deleteAccountAction(user!.id)

                if (result.success) {
                    toast.success("Admin account deleted")
                    logout()
                    router.push('/')
                } else {
                    throw new Error(result.error)
                }
            } catch (error: any) {
                toast.error(error.message || "Failed to delete account")
            }
        }
    }

    return (
        <div className="min-h-screen bg-muted/30 py-8">
            <div className="container mx-auto px-4 max-w-4xl">
                <div className="mb-8">
                    <Button variant="ghost" asChild className="mb-4">
                        <Link href="/dashboard/admin">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Dashboard
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold mb-2">Staff Profile</h1>
                    <p className="text-muted-foreground">Manage your administrative account settings</p>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-primary" />
                                Account Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input
                                        id="name"
                                        value={profileData.name}
                                        onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" value={profileData.email} disabled className="bg-muted" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <Input
                                        id="phone"
                                        value={profileData.phone}
                                        onChange={(e) => {
                                            const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            setProfileData({ ...profileData, phone: value });
                                        }}
                                    />
                                </div>
                            </div>
                            <Button onClick={handleSaveProfile} disabled={savingProfile}>
                                <Save className="h-4 w-4 mr-2" />
                                {savingProfile ? "Saving..." : "Save Changes"}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5" />
                                Security
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="currentPassword">Current Password</Label>
                                <div className="relative">
                                    <Input
                                        type={showCurrentPassword ? "text" : "password"}
                                        id="currentPassword"
                                        value={passwordData.currentPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
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

                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password</Label>
                                <div className="relative">
                                    <Input
                                        type={showNewPassword ? "text" : "password"}
                                        id="newPassword"
                                        value={passwordData.newPassword}
                                        onChange={handleNewPasswordChange}
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
                                {passwordData.newPassword && (
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
                                                One special character (!@#$%...)
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm Password</Label>
                                <div className="relative">
                                    <Input
                                        type={showConfirmPassword ? "text" : "password"}
                                        id="confirmPassword"
                                        value={passwordData.confirmPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
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
                                {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                                    <p className="text-xs text-red-600">Passwords do not match</p>
                                )}
                            </div>

                            <Button onClick={handleChangePassword} disabled={changingPassword || !isPasswordStrong || passwordData.newPassword !== passwordData.confirmPassword}>
                                <Key className="h-4 w-4 mr-2" />
                                {changingPassword ? "Updating..." : "Update Password"}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="border-destructive">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-destructive">
                                <Trash2 className="h-5 w-5" />
                                Danger Zone
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Button variant="destructive" onClick={handleDeleteAccount}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Admin Account
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

export default withAuth(AdminProfilePage, { requiredRole: 'admin' })
