"use client"

import { personalInfoSchema, tenantPreferencesSchema, passwordChangeSchema } from "@/lib/validations"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, MapPin, Key, Save, Trash2, Loader2, ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { withAuth } from "@/lib/with-auth"

function TenantProfilePage() {
    const { user, isLoading, logout } = useAuth()
    const router = useRouter()
    const [savingPersonal, setSavingPersonal] = useState(false)
    const [savingPreferences, setSavingPreferences] = useState(false)
    const [changingPassword, setChangingPassword] = useState(false)
    const [dataLoading, setDataLoading] = useState(true)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [profileData, setProfileData] = useState({
        name: "",
        email: "",
        phone: "",
        city: "",
        preferredLocations: "",
        budgetMin: "",
        budgetMax: "",
        preferredRoomType: "Single",
        moveInDate: ""
    })

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
                city: data.city || "",
                preferredLocations: data.preferences?.preferredLocations || "",
                budgetMin: data.preferences?.budgetMin || "",
                budgetMax: data.preferences?.budgetMax || "",
                preferredRoomType: data.preferences?.preferredRoomType || "Single",
                moveInDate: data.preferences?.moveInDate || ""
            })
        } catch (error) {
            console.error('Error fetching profile:', error)
            toast.error('Failed to load profile data')
        } finally {
            setDataLoading(false)
        }
    }

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

    if (dataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    const handleSavePersonal = async () => {
        setSavingPersonal(true)
        setErrors({})
        try {
            const personalResult = personalInfoSchema.safeParse({
                name: profileData.name,
                phone: profileData.phone,
                city: profileData.city
            })
            if (!personalResult.success) {
                const newErrors: Record<string, string> = {}
                personalResult.error.errors.forEach(err => {
                    newErrors[err.path[0]] = err.message
                })
                setErrors(newErrors)
                toast.error("Please fix personal info errors")
                return
            }

            const { updateUserProfile } = await import('@/lib/user-service')
            const { error } = await updateUserProfile(user!.id, {
                name: profileData.name,
                phone: profileData.phone,
                city: profileData.city
            })

            if (error) throw error
            toast.success("Personal info updated successfully!")
            await fetchFreshUserData()
        } catch (error) {
            console.error(error)
            toast.error("Failed to update personal info")
        } finally {
            setSavingPersonal(false)
        }
    }

    const handleSavePreferences = async () => {
        setSavingPreferences(true)
        setErrors({})
        try {
            const preferencesResult = tenantPreferencesSchema.safeParse({
                preferredLocations: profileData.preferredLocations,
                budgetMin: profileData.budgetMin,
                budgetMax: profileData.budgetMax,
                preferredRoomType: profileData.preferredRoomType,
                moveInDate: profileData.moveInDate
            })
            if (!preferencesResult.success) {
                const newErrors: Record<string, string> = {}
                preferencesResult.error.errors.forEach(err => {
                    newErrors[err.path[0]] = err.message
                })
                setErrors(newErrors)
                toast.error("Please fix preference errors")
                return
            }

            const { updateUserProfile } = await import('@/lib/user-service')
            const { error } = await updateUserProfile(user!.id, {
                preferences: {
                    preferredLocations: profileData.preferredLocations,
                    budgetMin: profileData.budgetMin,
                    budgetMax: profileData.budgetMax,
                    preferredRoomType: profileData.preferredRoomType,
                    moveInDate: profileData.moveInDate
                }
            })

            if (error) throw error
            toast.success("Preferences updated successfully!")
            await fetchFreshUserData()
        } catch (error) {
            console.error(error)
            toast.error("Failed to update preferences")
        } finally {
            setSavingPreferences(false)
        }
    }

    const handleChangePassword = async () => {
        setChangingPassword(true)
        setErrors({})
        try {
            const result = passwordChangeSchema.safeParse(passwordData)
            if (!result.success) {
                const newErrors: Record<string, string> = {}
                result.error.errors.forEach(err => {
                    newErrors[err.path[0]] = err.message
                })
                setErrors(newErrors)
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
        if (confirm("Are you sure you want to delete your account? This action cannot be undone and will remove all your data.")) {
            try {
                const { deleteAccountAction } = await import("@/app/actions/auth-actions")
                const result = await deleteAccountAction(user!.id)

                if (result.success) {
                    toast.success("Account deleted successfully")
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
                        <Link href="/dashboard/tenant">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Dashboard
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold mb-2">My Profile</h1>
                    <p className="text-muted-foreground">Manage your account settings and preferences</p>
                </div>

                <div className="space-y-6">
                    {/* Personal Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                Personal Information
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
                                        className={errors.name ? "border-destructive" : ""}
                                    />
                                    {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={profileData.email}
                                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                                        disabled // Email is not editable
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        placeholder="+91 98765 43210"
                                        value={profileData.phone}
                                        onChange={(e) => {
                                            const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            setProfileData({ ...profileData, phone: value });
                                        }}
                                        className={errors.phone ? "border-destructive" : ""}
                                    />
                                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="city">Current City</Label>
                                    <Input
                                        id="city"
                                        placeholder="Bangalore"
                                        value={profileData.city}
                                        onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                                        className={errors.city ? "border-destructive" : ""}
                                    />
                                    {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
                                </div>
                            </div>

                            <Button onClick={handleSavePersonal} disabled={savingPersonal}>
                                <Save className="h-4 w-4 mr-2" />
                                {savingPersonal ? "Saving..." : "Save Changes"}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Preferences */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5" />
                                Search Preferences
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="locations">Preferred Locations</Label>
                                <Textarea
                                    id="locations"
                                    placeholder="e.g., Koramangala, Indiranagar, Whitefield"
                                    value={profileData.preferredLocations}
                                    onChange={(e) => setProfileData({ ...profileData, preferredLocations: e.target.value })}
                                    rows={2}
                                    className={errors.preferredLocations ? "border-destructive" : ""}
                                />
                                {errors.preferredLocations && <p className="text-xs text-destructive">{errors.preferredLocations}</p>}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="budgetMin">Budget Min (₹/month)</Label>
                                    <Input
                                        id="budgetMin"
                                        type="number"
                                        placeholder="5000"
                                        value={profileData.budgetMin}
                                        onChange={(e) => setProfileData({ ...profileData, budgetMin: e.target.value })}
                                        className={errors.budgetMin ? "border-destructive" : ""}
                                    />
                                    {errors.budgetMin && <p className="text-xs text-destructive">{errors.budgetMin}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="budgetMax">Budget Max (₹/month)</Label>
                                    <Input
                                        id="budgetMax"
                                        type="number"
                                        placeholder="15000"
                                        value={profileData.budgetMax}
                                        onChange={(e) => setProfileData({ ...profileData, budgetMax: e.target.value })}
                                        className={errors.budgetMax ? "border-destructive" : ""}
                                    />
                                    {errors.budgetMax && <p className="text-xs text-destructive">{errors.budgetMax}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label>Preferred Room Type</Label>
                                    <Select
                                        value={profileData.preferredRoomType}
                                        onValueChange={(v) => setProfileData({ ...profileData, preferredRoomType: v })}
                                    >
                                        <SelectTrigger className={errors.preferredRoomType ? "border-destructive" : ""}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Single">Single</SelectItem>
                                            <SelectItem value="Double">Double</SelectItem>
                                            <SelectItem value="Triple">Triple</SelectItem>
                                            <SelectItem value="Any">Any</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {errors.preferredRoomType && <p className="text-xs text-destructive">{errors.preferredRoomType}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="moveInDate">Expected Move-in Date</Label>
                                    <Input
                                        id="moveInDate"
                                        type="date"
                                        value={profileData.moveInDate}
                                        onChange={(e) => setProfileData({ ...profileData, moveInDate: e.target.value })}
                                        className={errors.moveInDate ? "border-destructive" : ""}
                                    />
                                    {errors.moveInDate && <p className="text-xs text-destructive">{errors.moveInDate}</p>}
                                </div>
                            </div>

                            <Button onClick={handleSavePreferences} disabled={savingPreferences}>
                                <Save className="h-4 w-4 mr-2" />
                                {savingPreferences ? "Saving..." : "Save Preferences"}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Change Password */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5" />
                                Change Password
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="currentPassword">Current Password</Label>
                                <div className="relative">
                                    <Input
                                        id="currentPassword"
                                        type={showCurrentPassword ? "text" : "password"}
                                        value={passwordData.currentPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                        className={errors.currentPassword ? "border-destructive pr-10" : "pr-10"}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password</Label>
                                <div className="relative">
                                    <Input
                                        id="newPassword"
                                        type={showNewPassword ? "text" : "password"}
                                        value={passwordData.newPassword}
                                        onChange={handleNewPasswordChange}
                                        className={errors.newPassword ? "border-destructive pr-10" : "pr-10"}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword}</p>}
                                
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
                                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                <div className="relative">
                                    <Input
                                        id="confirmPassword"
                                        type={showConfirmPassword ? "text" : "password"}
                                        value={passwordData.confirmPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                        className={errors.confirmPassword ? "border-destructive pr-10" : "pr-10"}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
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

                    {/* Danger Zone */}
                    <Card className="border-destructive">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-destructive">
                                <Trash2 className="h-5 w-5" />
                                Danger Zone
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Once you delete your account, there is no going back. All your data including saved properties and inquiries will be permanently deleted.
                            </p>
                            <Button variant="destructive" onClick={handleDeleteAccount}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Account
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

export default withAuth(TenantProfilePage, { requiredRole: 'tenant' })
