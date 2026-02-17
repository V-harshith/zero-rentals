"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Search, Loader2, CheckCircle, XCircle, Trash2, Crown } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { verifyUser, type User } from "@/lib/user-service"
import { useCsrf } from "@/lib/csrf-context"

interface UsersManagementTabProps {
    users: User[]
    loading: boolean
    onRefresh: () => void
    searchQuery?: string // Add this prop
    currentAdminId?: string // Current logged-in admin's ID
}

export function UsersManagementTab({
    users,
    loading,
    onRefresh,
    searchQuery = "", // Default to empty
    currentAdminId
}: UsersManagementTabProps) {
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
    const [userToDelete, setUserToDelete] = useState<User | null>(null)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const { csrfToken } = useCsrf()

    // Filter users based on search query prop - with XSS-safe sanitization
    const sanitizeInput = (input: string): string => {
        // Remove any HTML tags and limit length to prevent XSS
        return input.replace(/[<>\"']/g, '').slice(0, 100).toLowerCase()
    }

    const safeSearchQuery = sanitizeInput(searchQuery)
    const filteredUsers = users.filter(
        (user) =>
            user.email.toLowerCase().includes(safeSearchQuery) ||
            user.name.toLowerCase().includes(safeSearchQuery) ||
            user.role.toLowerCase().includes(safeSearchQuery) ||
            (user.subscription?.plan_name || '').toLowerCase().includes(safeSearchQuery)
    )

    // Helper function to get plan badge color
    const getPlanBadgeColor = (planName?: string) => {
        if (!planName) return 'bg-gray-100 text-gray-600'
        const plan = planName.toLowerCase()
        if (plan.includes('elite')) return 'bg-purple-100 text-purple-700 border-purple-200'
        if (plan.includes('platinum')) return 'bg-blue-100 text-blue-700 border-blue-200'
        if (plan.includes('gold')) return 'bg-yellow-100 text-yellow-700 border-yellow-200'
        if (plan.includes('silver')) return 'bg-gray-100 text-gray-700 border-gray-200'
        return 'bg-green-100 text-green-700 border-green-200' // Free
    }

    // Helper function to format days remaining
    const getDaysRemaining = (endDate?: string) => {
        if (!endDate) return null
        const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        if (days < 0) return 'Expired'
        if (days === 0) return 'Expires today'
        if (days === 1) return '1 day left'
        return `${days} days left`
    }

    // Refs to track in-flight requests for deduplication
    const verifyingRef = useRef<Set<string>>(new Set())
    const deletingRef = useRef<Set<string>>(new Set())

    const handleVerifyUser = async (userId: string) => {
        // Prevent duplicate requests
        if (verifyingRef.current.has(userId)) return
        verifyingRef.current.add(userId)
        setUpdatingUserId(userId)

        try {
            const { error } = await verifyUser(userId, csrfToken || undefined)

            if (error) {
                toast.error(error.message || 'Failed to verify user')
                return
            }

            // Only show success and refresh after confirmed API success
            toast.success('User verified successfully')
            onRefresh()
        } catch {
            toast.error('Failed to verify user')
        } finally {
            verifyingRef.current.delete(userId)
            setUpdatingUserId(null)
        }
    }

    const handleDeleteUser = async (user: User) => {
        setUserToDelete(user)
        setShowDeleteDialog(true)
    }

    const confirmDeleteUser = async () => {
        if (!userToDelete) return

        setDeletingUserId(userToDelete.id)
        setShowDeleteDialog(false)

        try {
            // Get auth token
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast.error('Authentication required')
                return
            }

            const response = await fetch(`/api/admin/users/${userToDelete.id}/delete`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
                }
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete user')
            }

            toast.success(`User ${userToDelete.email} deleted successfully`)
            onRefresh()
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete user')
        } finally {
            setDeletingUserId(null)
            setUserToDelete(null)
        }
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                        <p className="mt-4 text-muted-foreground">Loading users...</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Users Management ({users.length})</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                {/* Desktop Table View */}
                <div className="hidden md:block rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Plan</TableHead>
                                <TableHead className="text-center">Verified</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No users found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredUsers.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.name}</TableCell>
                                        <TableCell className="text-sm">{user.email}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="capitalize">{user.role}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            {user.subscription ? (
                                                <div className="space-y-1">
                                                    <Badge
                                                        variant="outline"
                                                        className={`${getPlanBadgeColor(user.subscription.plan_name)} font-medium`}
                                                    >
                                                        <Crown className="h-3 w-3 mr-1" />
                                                        {user.subscription.plan_name}
                                                    </Badge>
                                                    <div className="text-xs text-muted-foreground">
                                                        {getDaysRemaining(user.subscription.end_date)}
                                                    </div>
                                                </div>
                                            ) : (
                                                <Badge variant="outline" className="bg-gray-100 text-gray-600">
                                                    Free
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {user.verified ? (
                                                <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                            ) : (
                                                <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2 flex-wrap">
                                                {/* Verify Button */}
                                                {!user.verified && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleVerifyUser(user.id)}
                                                        disabled={updatingUserId === user.id || deletingUserId === user.id}
                                                        className="border-blue-500 text-blue-600 hover:bg-blue-50"
                                                    >
                                                        {updatingUserId === user.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <CheckCircle className="h-3 w-3 mr-1" />
                                                                Verify
                                                            </>
                                                        )}
                                                    </Button>
                                                )}

                                                {/* Delete Button - Hidden for current admin */}
                                                {currentAdminId !== user.id && (
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => handleDeleteUser(user)}
                                                        disabled={updatingUserId === user.id || deletingUserId === user.id}
                                                    >
                                                        {deletingUserId === user.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                    {filteredUsers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground border rounded-lg">
                            No users found
                        </div>
                    ) : (
                        filteredUsers.map((user) => (
                            <div key={user.id} className="border rounded-lg p-4 space-y-3 bg-card">
                                {/* User Info Header */}
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-medium">{user.name}</p>
                                        <p className="text-sm text-muted-foreground">{user.email}</p>
                                    </div>
                                    <Badge variant="outline" className="capitalize">{user.role}</Badge>
                                </div>

                                {/* Plan Row */}
                                <div className="flex items-center justify-between py-2 border-t">
                                    <span className="text-sm text-muted-foreground">Plan:</span>
                                    {user.subscription ? (
                                        <div className="text-right">
                                            <Badge
                                                variant="outline"
                                                className={`${getPlanBadgeColor(user.subscription.plan_name)} font-medium`}
                                            >
                                                <Crown className="h-3 w-3 mr-1" />
                                                {user.subscription.plan_name}
                                            </Badge>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {getDaysRemaining(user.subscription.end_date)}
                                            </div>
                                        </div>
                                    ) : (
                                        <Badge variant="outline" className="bg-gray-100 text-gray-600">
                                            Free
                                        </Badge>
                                    )}
                                </div>

                                {/* Verification Row */}
                                <div className="flex items-center justify-between py-2 border-t border-b">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">Status:</span>
                                        {user.verified ? (
                                            <span className="flex items-center gap-1 text-sm text-green-600">
                                                <CheckCircle className="h-3 w-3" /> Verified
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-sm text-red-600">
                                                <XCircle className="h-3 w-3" /> Unverified
                                            </span>
                                        )}
                                    </div>
                                    <Badge
                                        variant={user.verified ? 'default' : 'secondary'}
                                        className={user.verified ? 'bg-green-600' : ''}
                                    >
                                        {user.verified ? 'Verified' : 'Pending'}
                                    </Badge>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex flex-wrap gap-2">
                                    {/* Verify */}
                                    {!user.verified && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleVerifyUser(user.id)}
                                            disabled={updatingUserId === user.id || deletingUserId === user.id}
                                            className="flex-1 border-blue-500 text-blue-600 hover:bg-blue-50"
                                        >
                                            {updatingUserId === user.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <>
                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                    Verify
                                                </>
                                            )}
                                        </Button>
                                    )}

                                    {/* Delete - Hidden for current admin */}
                                    {currentAdminId !== user.id && (
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => handleDeleteUser(user)}
                                            disabled={updatingUserId === user.id || deletingUserId === user.id}
                                        >
                                            {deletingUserId === user.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3 w-3" />
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete User Account</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                        <p>Are you sure you want to delete this user account?</p>
                        {userToDelete && (
                            <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                                <p><strong>Name:</strong> {userToDelete.name}</p>
                                <p><strong>Email:</strong> {userToDelete.email}</p>
                                <p><strong>Role:</strong> {userToDelete.role}</p>
                            </div>
                        )}
                        <p className="text-destructive font-semibold mt-4">
                            This will permanently delete:
                        </p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                            <li>User account and profile</li>
                            <li>All properties owned by this user</li>
                            <li>Subscriptions and payment history</li>
                            <li>Saved searches and favorites</li>
                        </ul>
                        <p className="text-destructive font-semibold mt-2">
                            This action cannot be undone.
                        </p>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={confirmDeleteUser}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        Delete User
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
    )
}
