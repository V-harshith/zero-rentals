"use client"

import { useState, useEffect } from "react"
import { Check, X } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface PasswordStrengthProps {
    password: string
    onStrengthChange?: (strength: number) => void
}

export function PasswordStrength({ password, onStrengthChange }: PasswordStrengthProps) {
    const [strength, setStrength] = useState(0)
    const [checks, setChecks] = useState({
        length: false,
        uppercase: false,
        lowercase: false,
        number: false,
        special: false,
    })

    useEffect(() => {
        const newChecks = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
        }

        setChecks(newChecks)

        // Calculate strength (0-100)
        const passedChecks = Object.values(newChecks).filter(Boolean).length
        const newStrength = (passedChecks / 5) * 100
        setStrength(newStrength)

        if (onStrengthChange) {
            onStrengthChange(newStrength)
        }
    }, [password, onStrengthChange])

    const getStrengthLabel = () => {
        if (strength === 0) return { label: "", color: "" }
        if (strength < 40) return { label: "Weak", color: "text-red-500" }
        if (strength < 80) return { label: "Medium", color: "text-yellow-500" }
        return { label: "Strong", color: "text-green-500" }
    }

    const getProgressColor = () => {
        if (strength < 40) return "bg-red-500"
        if (strength < 80) return "bg-yellow-500"
        return "bg-green-500"
    }

    const strengthInfo = getStrengthLabel()

    if (!password) return null

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Password Strength</span>
                    {strengthInfo.label && (
                        <span className={`text-sm font-semibold ${strengthInfo.color}`}>
                            {strengthInfo.label}
                        </span>
                    )}
                </div>
                <div className="relative">
                    <Progress value={strength} className="h-2" />
                    <div
                        className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor()}`}
                        style={{ width: `${strength}%` }}
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Password must contain:</p>
                <div className="grid grid-cols-1 gap-1.5">
                    <RequirementItem met={checks.length} text="At least 8 characters" />
                    <RequirementItem met={checks.uppercase} text="One uppercase letter" />
                    <RequirementItem met={checks.lowercase} text="One lowercase letter" />
                    <RequirementItem met={checks.number} text="One number" />
                    <RequirementItem met={checks.special} text="One special character (!@#$%...)" />
                </div>
            </div>
        </div>
    )
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            {met ? (
                <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
            ) : (
                <X className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <span className={met ? "text-green-600" : "text-muted-foreground"}>{text}</span>
        </div>
    )
}
