"use client"

import React from 'react'
import { useAuth } from '@/lib/auth-context'
import { useModal } from '@/lib/modal-context'
import { Button } from '@/components/ui/button'
import { Lock } from 'lucide-react'

interface LockedButtonProps extends React.ComponentProps<typeof Button> {
    requireAuth?: boolean
    requireRole?: 'tenant' | 'owner' | 'admin'
    lockedText?: string
}

export function LockedButton({
    children,
    requireAuth = true,
    requireRole,
    lockedText,
    onClick,
    ...props
}: LockedButtonProps) {
    const { user } = useAuth()
    const { showLoginModal } = useModal()

    // Admins always bypass locks
    const isLocked = user?.role !== 'admin' && (
        (requireAuth && !user) ||
        (requireRole && user?.role !== requireRole)
    )

    if (isLocked) {
        return (
            <Button
                {...props}
                onClick={showLoginModal}
            >
                <Lock className="h-4 w-4 mr-2" />
                {lockedText || children}
            </Button>
        )
    }

    return (
        <Button {...props} onClick={onClick}>
            {children}
        </Button>
    )
}
