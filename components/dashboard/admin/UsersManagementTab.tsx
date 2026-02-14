"use client"

import { useState } from "react"
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
import { Search, Loader2, CheckCircle, XCircle, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { updateUserStatus, verifyUser, type User } from "@/lib/user-service"

interface UsersManagementTabProps {
    users: User[]
    loading: boolean
    onRefresh: () => void
    searchQuery?: string // Add this prop
}

export function UsersManagementTab({
    users,
    loading,
    onRefresh,
    searchQuery = "" // Default to empty
}: UsersManagementTabProps) {
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
    const [userToDelete, setUserToDelete] = useState<User | null>(null)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)

    // Filter users based on search query prop
    const filteredUsers = users.filter(
        (user) =>
            user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.role.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleToggleStatus = async (userId: string, currentStatus: string) => {
        setUpdatingUserId(userId)
        try {
            const newStatus: 'active' | 'suspended' = currentStatus === 'active' ? 'suspended' : 'active'
            const { error } = await updateUserStatus(userId, newStatus)

            if (error) {
                toast.error('Failed to update user status')
                return
            }

            toast.success(`User ${newStatus === 'active' ? 'activated' : 'suspended'}`)
            onRefresh()
        } catch (error) {
            toast.error('Failed to update user status')
        } finally {
            setUpdatingUserId(null)
        }
    }

    const handleVerifyUser = async (userId: string) => {
        setUpdatingUserId(userId)
        try {
            const { error } = await verifyUser(userId)

            if (error) {
                toast.error('Failed to verify user')
                return
            }

            toast.success('User verified successfully')
            onRefresh()
        } catch (error) {
            toast.error('Failed to verify user')
        } finally {
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
                    'Authorization': `Bearer ${session.access_token}`
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
                                <TableHead className="text-center">Verified</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                                        <TableCell className="text-center">
                                            {user.verified ? (
                                                <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                            ) : (
                                                <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {/* Status Toggle Button - More reliable than Switch */}
                                                <Button
                                                    size="sm"
                                                    variant={user.status === 'active' ? 'default' : 'secondary'}
                                                    onClick={() => handleToggleStatus(user.id, user.status)}
                                                    disabled={updatingUserId === user.id || deletingUserId === user.id}
                                                    className={user.status === 'active' ? 'bg-green-600 hover:bg-green-700' : ''}
                                                >
                                                    {updatingUserId === user.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : user.status === 'active' ? (
                                                        'Active'
                                                    ) : (
                                                        'Suspended'
                                                    )}
                                                </Button>

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

                                                {/* Delete Button */}
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

                                {/* Status Row */}
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
                                        variant={user.status === 'active' ? 'default' : 'secondary'}
                                        className={user.status === 'active' ? 'bg-green-600' : ''}
                                    >
                                        {user.status}
                                    </Badge>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex flex-wrap gap-2">
                                    {/* Activate/Suspend */}
                                    <Button
                                        size="sm"
                                        variant={user.status === 'active' ? 'default' : 'secondary'}
                                        onClick={() => handleToggleStatus(user.id, user.status)}
                                        disabled={updatingUserId === user.id || deletingUserId === user.id}
                                        className={`flex-1 ${user.status === 'active' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                                    >
                                        {updatingUserId === user.id ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : user.status === 'active' ? (
                                            'Suspend'
                                        ) : (
                                            'Activate'
                                        )}
                                    </Button>

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

                                    {/* Delete */}
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
