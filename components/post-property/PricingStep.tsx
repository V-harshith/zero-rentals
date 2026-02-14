"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { IndianRupee } from "lucide-react"
import { getRoomTypes, getAmenities, type FormData } from "./types"
import { memo } from "react"

interface PricingStepProps {
    formData: FormData
    updateRoomData: (roomType: string, field: string, value: any) => void
    toggleAmenity: (roomType: string, amenity: string) => void
    updateFormData: (field: string, value: any) => void
}

const PricingStepComponent = ({ formData, updateRoomData, toggleAmenity, updateFormData }: PricingStepProps) => {
    const amenities = getAmenities(formData.propertyType)

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="border-b pb-4">
                <h2 className="text-2xl font-bold mb-1">Pricing & Amenities</h2>
                <p className="text-muted-foreground">Set rent and deposit for each room type.</p>
            </div>

            {Object.entries(formData.rooms).filter(([_, r]) => r.selected).map(([roomType, data], idx) => {
                const roomTypes = getRoomTypes(formData.propertyType)
                const roomInfo = roomTypes.find(r => r.id === roomType)
                if (!roomInfo) return null
                return (
                    <div key={roomType} className={`space-y-6 ${idx > 0 ? "pt-8 border-t" : ""}`}>
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">{roomInfo.icon}</span>
                            <h3 className="text-xl font-bold">{roomInfo.label}</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Monthly Rent <span className="text-red-500">*</span></Label>
                                <div className="relative">
                                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        className="pl-9"
                                        placeholder="0"
                                        value={data.rent}
                                        onChange={e => updateRoomData(roomType, 'rent', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Security Deposit <span className="text-red-500">*</span></Label>
                                <div className="relative">
                                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        className="pl-9"
                                        placeholder="0"
                                        value={data.deposit}
                                        onChange={e => updateRoomData(roomType, 'deposit', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}

            {/* Property-Level Amenities */}
            <div className="pt-8 border-t space-y-4">
                <div>
                    <h3 className="text-lg font-semibold mb-2">Property Amenities</h3>
                    <p className="text-sm text-muted-foreground">
                        {formData.propertyType === 'Rent'
                            ? 'Select amenities available in this property'
                            : 'These amenities are available for the entire property'}
                    </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {amenities.map((amenity) => {
                        const firstSelectedRoom = Object.entries(formData.rooms).find(([_, r]) => r.selected)?.[0] || 'single'
                        const isSelected = formData.rooms[firstSelectedRoom as keyof typeof formData.rooms]?.amenities?.includes(amenity.id) || false
                        
                        return (
                            <div
                                key={amenity.id}
                                onClick={() => {
                                    Object.keys(formData.rooms).forEach(rt => {
                                        if (formData.rooms[rt as keyof typeof formData.rooms]?.selected) {
                                            toggleAmenity(rt, amenity.id)
                                        }
                                    })
                                }}
                                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                    isSelected
                                        ? "border-primary bg-primary/5"
                                        : "border-gray-200 hover:border-gray-300"
                                }`}
                            >
                                <span className="text-2xl">{amenity.icon}</span>
                                <span className="text-sm font-medium">{amenity.label}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Furnish Type Section */}
            <div className="pt-8 border-t space-y-4">
                <div>
                    <h3 className="text-lg font-semibold mb-2">Furnish Type</h3>
                    <p className="text-sm text-muted-foreground">Select furnishing status for the property</p>
                </div>
                <div className="max-w-xs">
                    <Label>Select Furnish Type <span className="text-red-500">*</span></Label>
                    <select
                        value={formData.furnishing}
                        onChange={(e) => updateFormData('furnishing', e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <option value="">Choose furnishing type</option>
                        <option value="Fully Furnished">Fully Furnished</option>
                        <option value="Semi Furnished">Semi Furnished</option>
                        <option value="Unfurnished">Unfurnished</option>
                    </select>
                </div>
            </div>
        </div>
    )
}

export const PricingStep = memo(PricingStepComponent)
