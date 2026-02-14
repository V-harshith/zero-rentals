"use client"

import { getRoomTypes, type FormData } from "./types"
import { Check } from "lucide-react"
import { memo } from "react"

interface RoomSelectionStepProps {
    formData: FormData
    toggleRoom: (roomType: string) => void
}

const RoomSelectionStepComponent = ({ formData, toggleRoom }: RoomSelectionStepProps) => {
    const roomTypes = getRoomTypes(formData.propertyType)
    
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="border-b pb-4">
                <h2 className="text-2xl font-bold mb-1">
                    {formData.propertyType === 'Rent' ? 'Property Configuration' : 'Room Configuration'}
                </h2>
                <p className="text-muted-foreground">
                    {formData.propertyType === 'Rent' 
                        ? 'What type of property is available? Select all that apply.' 
                        : 'What kind of rooms are available? Select all that apply.'}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roomTypes.map((room) => {
                    const roomData = formData.rooms[room.id]
                    const isSelected = roomData?.selected || false
                    
                    return (
                        <button
                            key={room.id}
                            onClick={() => toggleRoom(room.id)}
                            className={`relative p-6 border-2 rounded-xl transition-all text-left group
                                ${isSelected
                                    ? "border-primary bg-primary/5 shadow-lg scale-[1.02]"
                                    : "border-border hover:border-gray-400 hover:bg-gray-50"
                                }`}
                        >
                            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{room.icon}</div>
                            <div className="text-lg font-semibold text-gray-900">{room.label}</div>
                            <div className={`absolute top-4 right-4 h-8 w-8 rounded-full flex items-center justify-center transition-all duration-200 
                                ${isSelected 
                                    ? "bg-primary text-white ring-4 ring-white shadow-md animate-in zoom-in" 
                                    : "border-2 border-muted-foreground/30 bg-white"
                                }`}>
                                {isSelected && <Check className="h-5 w-5 stroke-[3]" />}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export const RoomSelectionStep = memo(RoomSelectionStepComponent)

