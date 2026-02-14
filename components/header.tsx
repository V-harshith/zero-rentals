"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { MobileNav } from "@/components/mobile-nav"
import { useAuth } from "@/lib/auth-context"
import { useFavorites } from "@/lib/favorites-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { User, Heart, LogOut } from "lucide-react"

export function Header() {
  const { user, logout, isLoading } = useAuth()
  const { count: favoritesCount } = useFavorites()

  return (
    <header className="border-b bg-background sticky top-0 z-50 backdrop-blur-sm bg-background/95">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <Link href="/" className="flex items-center gap-2 flex-shrink-0 group">
              <Image
                src="/zerorentals-logo.png"
                alt="ZeroRentals"
                width={40}
                height={40}
                priority
                className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 object-contain transition-transform group-hover:scale-110"
              />
              <span className="font-bold text-lg sm:text-xl text-foreground hidden sm:inline whitespace-nowrap">
                ZeroRentals
              </span>
            </Link>
            <nav className="hidden lg:flex items-center gap-6">

              <Link href="/about" className="text-sm font-medium hover:text-primary transition-colors">
                About us
              </Link>
              <Link href="/contact" className="text-sm font-medium hover:text-primary transition-colors">
                Contact
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isLoading ? (
              <div className="w-24 h-9 bg-muted animate-pulse rounded-md" />
            ) : user ? (
              <>
                {/* Favorites Counter - Only for tenants */}
                {user.role === 'tenant' && (
                  <Link href="/dashboard/tenant?tab=favorites">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2 hover:scale-105 transition-all relative"
                      aria-label={`View ${favoritesCount} saved properties`}
                    >
                      <Heart className="h-4 w-4" />
                      {favoritesCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold shadow-md">
                          {favoritesCount}
                        </span>
                      )}
                      <span className="hidden md:inline">Saved</span>
                    </Button>
                  </Link>
                )}

                {/* Post Property Button - For Owners (Next to Profile) */}
                {user.role === 'owner' && (
                  <Button
                    size="sm"
                    className="bg-accent hover:bg-accent/90 text-accent-foreground transition-all hover:scale-105"
                    asChild
                  >
                    <Link href="/post-property">Post Property</Link>
                  </Button>
                )}

                {/* User Profile Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2">
                      <User className="h-4 w-4" />
                      <span className="hidden sm:inline">{user.name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div>
                        <p className="font-semibold">{user.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{user.role === 'admin' ? 'Staff' : user.role} Account</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/${user.role}`}>Dashboard</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/profile/${user.role}`}>Profile Settings</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {/* Premium Logout Button */}
                    <DropdownMenuItem asChild className="p-0">
                      <Button
                        onClick={logout}
                        className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white justify-start hover:scale-105 transition-all duration-200 shadow-md"
                        size="sm"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </Button>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
                      Login
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href="/login/tenant">Login as Tenant</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/login/owner">Login as Owner</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  className="bg-accent hover:bg-accent/90 text-accent-foreground text-xs sm:text-sm transition-all hover:scale-105"
                  asChild
                >
                  <Link href="/pricing">Post Property</Link>
                </Button>
              </>
            )}
            <MobileNav />
          </div>
        </div>
      </div>
    </header>
  )
}
