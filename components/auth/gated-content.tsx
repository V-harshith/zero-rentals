"use client"

import { useAuth } from '@/lib/auth-context'
import { useModal } from '@/lib/modal-context'
import { Button } from '@/components/ui/button'
import { Lock, Users } from 'lucide-react'

interface GatedContentProps {
    children: React.ReactNode
    requireAuth?: boolean
    requireRole?: 'tenant' | 'owner' | 'admin'
    blurAmount?: 'sm' | 'md' | 'lg'
    message?: string
    description?: string
}

export function GatedContent({
    children,
    requireAuth = true,
    requireRole,
    blurAmount = 'md',
    message = 'Login to View',
    description = 'Join 10,000+ users finding their perfect home'
}: GatedContentProps) {
    const { user } = useAuth()
    const { showLoginModal } = useModal()

    // Admins always bypass gates
    const isGated = user?.role !== 'admin' && (
        (requireAuth && !user) ||
        (requireRole && user?.role !== requireRole)
    )

    if (!isGated) {
        return <>{children}</>
    }

    const blurClass = {
        sm: 'blur-sm',
        md: 'blur-md',
        lg: 'blur-lg'
    }[blurAmount]

    return (
        <div className="relative group">
            {/* Blurred Content */}
            <div className={`filter ${blurClass} grayscale opacity-60 pointer-events-none select-none`}>
                {children}
            </div>

            {/* Premium Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="text-center space-y-3 p-6 backdrop-blur-sm bg-white/10 rounded-xl border border-white/20 shadow-2xl">
                    <Lock className="h-8 w-8 mx-auto text-white drop-shadow-lg" />
                    <h3 className="text-white font-semibold text-lg drop-shadow-md">
                        {message}
                    </h3>
                    <p className="text-white/80 text-sm max-w-xs">
                        {description}
                    </p>
                    <Button
                        onClick={showLoginModal}
                        className="w-full bg-white text-black hover:bg-white/90"
                        size="lg"
                    >
                        Continue with Email
                    </Button>
                    <div className="flex items-center justify-center gap-2 text-white/60 text-xs">
                        <Users className="h-3 w-3" />
                        <span>Trusted by 10,000+ users</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
