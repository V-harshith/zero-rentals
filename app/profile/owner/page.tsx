"use client"

import { personalInfoSchema, businessDetailsSchema, bankDetailsSchema, passwordChangeSchema } from "@/lib/validations"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Crown, User, Building, CreditCard, Key, Save, Trash2, Loader2, ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { withAuth } from "@/lib/with-auth"

function OwnerProfilePage() {
    const { user, isLoading } = useAuth()
    const router = useRouter()
    const [savingPersonal, setSavingPersonal] = useState(false)
    const [savingBusiness, setSavingBusiness] = useState(false)
    const [savingBank, setSavingBank] = useState(false)
    const [changingPassword, setChangingPassword] = useState(false)
    const [dataLoading, setDataLoading] = useState(true)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [profileData, setProfileData] = useState({
        name: "",
        email: "",
        phone: "",
        businessName: "",
        gstNumber: "",
        address: "",
        city: "",
        state: "", // Add if we add to schema
        pincode: "", // Add if we add to schema
        bankName: "",
        accountNumber: "",
        ifscCode: "",
        accountHolderName: ""
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
                businessName: data.business_name || "",
                gstNumber: data.gst_number || "",
                address: data.address || "",
                city: data.city || "",
                state: "",
                pincode: "",
                bankName: data.bank_name || "",
                accountNumber: data.account_number || "",
                ifscCode: data.ifsc_code || "",
                accountHolderName: data.account_holder_name || ""
            })
        } catch (error) {
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

    // Subscription data - fetched from database
    const [subscription, setSubscription] = useState<{
        plan: string
        status: string
        propertiesLimit: number
        propertiesUsed: number
        expiryDate: string | null
        amount: number | null
    } | null>(null)

    // Fetch subscription on mount
    useEffect(() => {
        async function fetchSubscription() {
            if (!user) return
            try {
                const today = new Date().toISOString()
                const { data: sub } = await supabase
                    .from('subscriptions')
                    .select('plan_name, status, properties_limit, end_date, amount')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .gt('end_date', today)
                    .order('end_date', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                // Also get property count
                const { count } = await supabase
                    .from('properties')
                    .select('*', { count: 'exact', head: true })
                    .eq('owner_id', user.id)
                    .in('status', ['active', 'pending'])

                if (sub) {
                    setSubscription({
                        plan: sub.plan_name || 'Free',
                        status: sub.status || 'inactive',
                        propertiesLimit: sub.properties_limit || 1,
                        propertiesUsed: count || 0,
                        expiryDate: sub.end_date,
                        amount: sub.amount
                    })
                } else {
                    // Free tier
                    setSubscription({
                        plan: 'Free',
                        status: 'active',
                        propertiesLimit: 1,
                        propertiesUsed: count || 0,
                        expiryDate: null,
                        amount: 0
                    })
                }
            } catch (error) {
                setSubscription(null)
            }
        }
        fetchSubscription()
    }, [user])

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
        } catch (error: any) {
            toast.error(error.message || "Failed to update personal info")
        } finally {
            setSavingPersonal(false)
        }
    }

    const handleSaveBusiness = async () => {
        setSavingBusiness(true)
        setErrors({})
        try {
            const businessResult = businessDetailsSchema.safeParse({
                businessName: profileData.businessName,
                gstNumber: profileData.gstNumber,
                address: profileData.address
            })
            if (!businessResult.success) {
                const newErrors: Record<string, string> = {}
                businessResult.error.errors.forEach(err => {
                    newErrors[err.path[0]] = err.message
                })
                setErrors(newErrors)
                toast.error("Please fix business detail errors")
                return
            }

            const { updateUserProfile } = await import('@/lib/user-service')
            const { error } = await updateUserProfile(user!.id, {
                city: profileData.city,
                address: profileData.address,
                business_name: profileData.businessName,
                gst_number: profileData.gstNumber
            })

            if (error) throw error
            toast.success("Business details updated successfully!")
            await fetchFreshUserData()
        } catch (error: any) {
            toast.error(error.message || "Failed to update business details")
        } finally {
            setSavingBusiness(false)
        }
    }

    const handleSaveBank = async () => {
        setSavingBank(true)
        setErrors({})
        try {
            const bankResult = bankDetailsSchema.safeParse({
                bankName: profileData.bankName,
                accountNumber: profileData.accountNumber,
                ifscCode: profileData.ifscCode,
                accountHolderName: profileData.accountHolderName
            })
            if (!bankResult.success) {
                const newErrors: Record<string, string> = {}
                bankResult.error.errors.forEach(err => {
                    newErrors[err.path[0]] = err.message
                })
                setErrors(newErrors)
                toast.error("Please fix bank detail errors")
                return
            }

            const { updateUserProfile } = await import('@/lib/user-service')
            const { error } = await updateUserProfile(user!.id, {
                bank_name: profileData.bankName,
                account_number: profileData.accountNumber,
                ifsc_code: profileData.ifscCode,
                account_holder_name: profileData.accountHolderName
            })

            if (error) throw error
            toast.success("Bank details updated successfully!")
            await fetchFreshUserData()
        } catch (error: any) {
            toast.error(error.message || "Failed to update bank details")
        } finally {
            setSavingBank(false)
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
        if (confirm("Are you sure you want to delete your account? This will permanently remove all your property listings and data. This action cannot be undone.")) {
            try {
                const { deleteAccountAction } = await import("@/app/actions/auth-actions")
                const result = await deleteAccountAction(user!.id)

                if (result.success) {
                    toast.success("Account deleted successfully")
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
                        <Link href="/dashboard/owner">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Dashboard
                        </Link>
                    </Button>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                                <Crown className="h-8 w-8 text-yellow-500" />
                                Owner Profile
                            </h1>
                            <p className="text-muted-foreground">Manage your business and account settings</p>
                        </div>
                        {subscription && (
                            <Badge variant="secondary" className="text-sm">
                                {subscription.plan} Plan
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Subscription Status */}
                    <Card className="border-primary">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Crown className="h-5 w-5 text-primary" />
                                Subscription
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {subscription ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-lg">{subscription.plan} Plan</p>
                                            <p className="text-sm text-muted-foreground">
                                                {subscription.propertiesUsed} of {subscription.propertiesLimit} properties used
                                            </p>
                                        </div>
                                        <Badge variant={subscription.status === 'active' ? 'default' : 'destructive'}>
                                            {subscription.status}
                                        </Badge>
                                    </div>

                                    {subscription.plan !== 'Free' && subscription.expiryDate && (
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="text-muted-foreground">Expires on:</span>
                                                <p className="font-semibold">{new Date(subscription.expiryDate).toLocaleDateString()}</p>
                                            </div>
                                            {subscription.amount && subscription.amount > 0 && (
                                                <div>
                                                    <span className="text-muted-foreground">Amount:</span>
                                                    <p className="font-semibold">₹{subscription.amount}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <Button asChild>
                                            <Link href="/pricing">
                                                <Crown className="h-4 w-4 mr-2" />
                                                {subscription.plan === 'Free' ? 'Get a Plan' : 'Upgrade Plan'}
                                            </Link>
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-muted-foreground">Loading subscription...</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

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
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={profileData.email}
                                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
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
                                    />
                                </div>
                            </div>

                            <Button onClick={handleSavePersonal} disabled={savingPersonal}>
                                <Save className="h-4 w-4 mr-2" />
                                {savingPersonal ? "Saving..." : "Save Changes"}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Business Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building className="h-5 w-5" />
                                Business Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="businessName">Business Name</Label>
                                    <Input
                                        id="businessName"
                                        placeholder="Your Business Name"
                                        value={profileData.businessName}
                                        onChange={(e) => setProfileData({ ...profileData, businessName: e.target.value })}
                                        className={errors.businessName ? "border-destructive" : ""}
                                    />
                                    {errors.businessName && <p className="text-xs text-destructive">{errors.businessName}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="gstNumber">GST Number (Optional)</Label>
                                    <Input
                                        id="gstNumber"
                                        placeholder="22AAAAA0000A1Z5"
                                        value={profileData.gstNumber}
                                        onChange={(e) => setProfileData({ ...profileData, gstNumber: e.target.value })}
                                        className={errors.gstNumber ? "border-destructive" : ""}
                                    />
                                    {errors.gstNumber && <p className="text-xs text-destructive">{errors.gstNumber}</p>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="address">Business Address</Label>
                                <Textarea
                                    id="address"
                                    placeholder="Complete business address"
                                    value={profileData.address}
                                    onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                                    rows={2}
                                    className={errors.address ? "border-destructive" : ""}
                                />
                                {errors.address && <p className="text-xs text-destructive">{errors.address}</p>}
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="city">City</Label>
                                    <Input
                                        id="city"
                                        value={profileData.city}
                                        onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                                        className={errors.city ? "border-destructive" : ""}
                                    />
                                    {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="state">State</Label>
                                    <Input
                                        id="state"
                                        value={profileData.state}
                                        onChange={(e) => setProfileData({ ...profileData, state: e.target.value })}
                                        className={errors.state ? "border-destructive" : ""}
                                    />
                                    {errors.state && <p className="text-xs text-destructive">{errors.state}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="pincode">Pincode</Label>
                                    <Input
                                        id="pincode"
                                        value={profileData.pincode}
                                        onChange={(e) => setProfileData({ ...profileData, pincode: e.target.value })}
                                        className={errors.pincode ? "border-destructive" : ""}
                                    />
                                    {errors.pincode && <p className="text-xs text-destructive">{errors.pincode}</p>}
                                </div>
                            </div>

                            <Button onClick={handleSaveBusiness} disabled={savingBusiness}>
                                <Save className="h-4 w-4 mr-2" />
                                {savingBusiness ? "Saving..." : "Save Business Details"}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Bank Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5" />
                                Bank Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                For receiving payments and refunds
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="bankName">Bank Name</Label>
                                    <Input
                                        id="bankName"
                                        placeholder="HDFC Bank"
                                        value={profileData.bankName}
                                        onChange={(e) => setProfileData({ ...profileData, bankName: e.target.value })}
                                        className={errors.bankName ? "border-destructive" : ""}
                                    />
                                    {errors.bankName && <p className="text-xs text-destructive">{errors.bankName}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="accountNumber">Account Number</Label>
                                    <Input
                                        id="accountNumber"
                                        placeholder="1234567890"
                                        value={profileData.accountNumber}
                                        onChange={(e) => setProfileData({ ...profileData, accountNumber: e.target.value })}
                                        className={errors.accountNumber ? "border-destructive" : ""}
                                    />
                                    {errors.accountNumber && <p className="text-xs text-destructive">{errors.accountNumber}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="ifscCode">IFSC Code</Label>
                                    <Input
                                        id="ifscCode"
                                        placeholder="HDFC0001234"
                                        value={profileData.ifscCode}
                                        onChange={(e) => setProfileData({ ...profileData, ifscCode: e.target.value })}
                                        className={errors.ifscCode ? "border-destructive" : ""}
                                    />
                                    {errors.ifscCode && <p className="text-xs text-destructive">{errors.ifscCode}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="accountHolderName">Account Holder Name</Label>
                                    <Input
                                        id="accountHolderName"
                                        placeholder="John Doe"
                                        value={profileData.accountHolderName}
                                        onChange={(e) => setProfileData({ ...profileData, accountHolderName: e.target.value })}
                                        className={errors.accountHolderName ? "border-destructive" : ""}
                                    />
                                    {errors.accountHolderName && <p className="text-xs text-destructive">{errors.accountHolderName}</p>}
                                </div>
                            </div>

                            <Button onClick={handleSaveBank} disabled={savingBank}>
                                <Save className="h-4 w-4 mr-2" />
                                {savingBank ? "Saving..." : "Save Bank Details"}
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
                                Deleting your account will permanently remove all your property listings, inquiries, and subscription data. This action cannot be undone.
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

export default withAuth(OwnerProfilePage, { requiredRole: 'owner' })
