"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet"
import { Menu, X, Heart, LogOut } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useFavorites } from "@/lib/favorites-context"

export function MobileNav() {
    const [open, setOpen] = useState(false)
    const { user, logout } = useAuth()
    const { count: favoritesCount } = useFavorites()

    const navItems = [
        { href: "/pg", label: "PG" },
        { href: "/co-living", label: "Co-living" },
        { href: "/rent", label: "Rent" },
        { href: "/about", label: "About us" },
        { href: "/contact", label: "Contact us" },
    ]

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle menu</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[350px] p-0 [&>button]:hidden">
                <SheetHeader className="sr-only">
                    <SheetTitle>Navigation Menu</SheetTitle>
                    <SheetDescription>
                        Access all sections of ZeroRentals, including dashboard and property listings.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col h-full p-6 relative">
                    <Button variant="ghost" size="icon" className="absolute right-4 top-4 z-50" onClick={() => setOpen(false)}>
                        <X className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center justify-start mb-8 mt-2">
                        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
                            <div className="relative w-8 h-8">
                                <Image
                                    src="/zerorentals-logo.png"
                                    alt="ZeroRentals"
                                    fill
                                    className="object-contain"
                                />
                            </div>
                            <span className="font-bold text-lg">ZeroRentals</span>
                        </Link>
                    </div>

                    {user && (
                        <div className="mb-6 p-4 bg-muted rounded-lg">
                            <p className="text-sm text-muted-foreground">Logged in as</p>
                            <p className="font-semibold">{user.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                        </div>
                    )}

                    <nav className="flex flex-col gap-2 flex-1">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="text-lg font-medium hover:text-primary transition-colors py-2 px-3 rounded-md hover:bg-muted"
                                onClick={() => setOpen(false)}
                            >
                                {item.label}
                            </Link>
                        ))}

                        {user && (
                            <Link
                                href={`/dashboard/${user.role}`}
                                className="text-lg font-medium hover:text-primary transition-colors py-2 px-3 rounded-md hover:bg-muted"
                                onClick={() => setOpen(false)}
                            >
                                Dashboard
                            </Link>
                        )}

                        {user?.role === 'owner' && (
                            <Link
                                href="/post-property"
                                className="text-lg font-medium hover:text-primary transition-colors py-2 px-3 rounded-md hover:bg-muted"
                                onClick={() => setOpen(false)}
                            >
                                Post Property
                            </Link>
                        )}

                        {user?.role === 'tenant' && (
                            <Link
                                href="/dashboard/tenant?tab=favorites"
                                className="text-lg font-medium hover:text-primary transition-colors py-2 px-3 rounded-md hover:bg-muted flex items-center gap-2"
                                onClick={() => setOpen(false)}
                            >
                                <Heart className="h-5 w-5" />
                                Favorites
                                {favoritesCount > 0 && (
                                    <span className="bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold">
                                        {favoritesCount}
                                    </span>
                                )}
                            </Link>
                        )}
                    </nav>

                    <div className="mt-auto space-y-2">
                        {user ? (
                            <Button
                                className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white hover:scale-105 transition-all duration-200 shadow-md"
                                onClick={() => {
                                    logout()
                                    setOpen(false)
                                }}
                            >
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </Button>
                        ) : (
                            <>
                                <Button variant="outline" className="w-full" asChild>
                                    <Link href="/login/tenant" onClick={() => setOpen(false)}>
                                        Login as Tenant
                                    </Link>
                                </Button>
                                <Button variant="outline" className="w-full" asChild>
                                    <Link href="/login/owner" onClick={() => setOpen(false)}>
                                        Login as Owner
                                    </Link>
                                </Button>
                                <Button className="w-full bg-accent hover:bg-accent/90" asChild>
                                    <Link href="/pricing" onClick={() => setOpen(false)}>
                                        Post Property
                                    </Link>
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
