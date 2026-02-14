"use client"

import { useState } from 'react'
import { useModal } from '@/lib/modal-context'
import { useAuth } from '@/lib/auth-context'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock, Mail, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export function LoginModal() {
    const { activeModal, closeModal } = useModal()
    const { login } = useAuth()
    const [isLogin, setIsLogin] = useState(true)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            await login(email, password)
            toast.success('Welcome back!')
            closeModal()
        } catch (error: any) {
            toast.error(error.message || 'Login failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={activeModal === 'login'} onOpenChange={closeModal}>
            <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0">
                {/* Glassmorphism Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/10 backdrop-blur-xl" />

                <div className="relative p-8 space-y-6">
                    {/* Header */}
                    <div className="text-center space-y-2">
                        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                            <Lock className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold">
                            {isLogin ? 'Welcome Back' : 'Join ZeroRentals'}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {isLogin ? 'Login to access all features' : 'Create your free account'}
                        </p>
                    </div>

                    {/* Social Proof */}
                    <div className="bg-primary/5 rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>10,000+ verified properties</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Direct owner contact</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>100% free for tenants</span>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 pr-10"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <Button type="submit" className="w-full" size="lg" disabled={loading}>
                            {loading ? 'Loading...' : isLogin ? 'Login' : 'Create Account'}
                        </Button>
                    </form>

                    {/* Toggle */}
                    <div className="text-center text-sm">
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-primary hover:underline"
                        >
                            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
                        </button>
                    </div>

                    {/* Trust Badge */}
                    <p className="text-xs text-center text-muted-foreground">
                        🔒 Secure login • No credit card required
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
