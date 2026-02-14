"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Building2, Search, Shield, Home } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-4xl space-y-8 animate-fadeIn">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Home className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold">ZeroRentals</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">Welcome Back</h1>
          <p className="text-muted-foreground text-lg">
            Choose your account type to continue
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tenant Login */}
          <Link href="/login/tenant">
            <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer group h-full">
              <CardContent className="p-8 text-center space-y-6">
                <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Search className="h-10 w-10 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">I'm a Tenant</h2>
                  <p className="text-muted-foreground">
                    Looking for PG accommodations, co-living spaces, or rental properties
                  </p>
                </div>
                <div className="pt-4">
                  <div className="inline-flex items-center gap-2 text-primary font-semibold group-hover:gap-3 transition-all">
                    Continue as Tenant
                    <span className="text-xl">→</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Owner Login */}
          <Link href="/login/owner">
            <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer group h-full">
              <CardContent className="p-8 text-center space-y-6">
                <div className="w-20 h-20 mx-auto bg-accent/10 rounded-full flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Building2 className="h-10 w-10 text-accent" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">I'm an Owner</h2>
                  <p className="text-muted-foreground">
                    List and manage your properties, track inquiries, and grow your business
                  </p>
                </div>
                <div className="pt-4">
                  <div className="inline-flex items-center gap-2 text-accent font-semibold group-hover:gap-3 transition-all">
                    Continue as Owner
                    <span className="text-xl">→</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>


        {/* Back to Home */}
        <div className="text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-primary">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
