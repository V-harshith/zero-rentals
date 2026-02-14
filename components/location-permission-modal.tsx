"use client"

import { useEffect, useState } from "react"
import { useLocation } from "@/lib/location-context"
import { useAuth } from "@/lib/auth-context"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { MapPin, X } from "lucide-react"

export function LocationPermissionModal() {
    const { locationPermission, requestLocation, userLocation } = useLocation()
    const { user } = useAuth()
    const [showModal, setShowModal] = useState(false)
    const [hasAsked, setHasAsked] = useState(false)

    useEffect(() => {
        // Don't show to admins or owners - only tenants and anonymous users
        if (user && user.role !== 'tenant') {
            return
        }

        // Check if we've already asked in this session
        const askedBefore = sessionStorage.getItem("location-asked")

        if (!askedBefore && !userLocation && locationPermission !== "granted") {
            // Show modal after 2 seconds
            const timer = setTimeout(() => {
                setShowModal(true)
            }, 2000)

            return () => clearTimeout(timer)
        }
    }, [userLocation, locationPermission, user])

    const handleAllow = async () => {
        setHasAsked(true)
        sessionStorage.setItem("location-asked", "true")
        await requestLocation()
        setShowModal(false)
    }

    const handleDeny = () => {
        setHasAsked(true)
        sessionStorage.setItem("location-asked", "true")
        setShowModal(false)
    }

    if (!showModal || hasAsked) return null

    return (
        <Dialog open={showModal} onOpenChange={setShowModal}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <MapPin className="h-6 w-6 text-primary" />
                    </div>
                    <DialogTitle className="text-center">Enable Location Access</DialogTitle>
                    <DialogDescription className="text-center">
                        Allow ZeroRentals to access your location to show you properties near you and provide better search results.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-4">
                    <div className="flex items-start gap-3 text-sm">
                        <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-green-600 text-xs">✓</span>
                        </div>
                        <div>
                            <p className="font-semibold">Find properties near you</p>
                            <p className="text-muted-foreground text-xs">See distance to each property</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 text-sm">
                        <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-green-600 text-xs">✓</span>
                        </div>
                        <div>
                            <p className="font-semibold">Better search results</p>
                            <p className="text-muted-foreground text-xs">Personalized recommendations</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 text-sm">
                        <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-green-600 text-xs">✓</span>
                        </div>
                        <div>
                            <p className="font-semibold">Save time</p>
                            <p className="text-muted-foreground text-xs">No need to manually enter location</p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-col gap-2">
                    <Button onClick={handleAllow} className="w-full" size="lg">
                        <MapPin className="h-4 w-4 mr-2" />
                        Allow Location Access
                    </Button>
                    <Button onClick={handleDeny} variant="ghost" className="w-full">
                        Not Now
                    </Button>
                </DialogFooter>

                <p className="text-xs text-center text-muted-foreground mt-2">
                    You can change this anytime in your browser settings
                </p>
            </DialogContent>
        </Dialog>
    )
}
