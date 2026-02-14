"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { getHouseRules, getGenderOptions, type FormData } from "./types"
import { memo } from "react"

interface RulesStepProps {
    formData: FormData
    setFormData: (data: FormData) => void
}

const RulesStepComponent = ({ formData, setFormData }: RulesStepProps) => {
    const updateField = (field: keyof FormData, value: any) => {
        setFormData({ ...formData, [field]: value })
    }

    const rules = getHouseRules(formData.propertyType)
    const genderOptions = getGenderOptions(formData.propertyType)

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="border-b pb-4">
                <h2 className="text-2xl font-bold mb-1">
                    {formData.propertyType === 'Rent' ? 'Rent Preferences' : 
                     formData.propertyType === 'Co-living' ? 'Co-living Rules & Preferences' :
                     'PG Rules & Preferences'}
                </h2>
                <p className="text-muted-foreground">
                    {formData.propertyType === 'Rent' ? 'Who can rent this property?' : 
                     `Who is this ${formData.propertyType} available for?`}
                </p>
            </div>

            <div className="space-y-4">
                <Label className="text-base">Gender Preference</Label>
                <Select
                    value={formData.gender}
                    onValueChange={v => updateField('gender', v)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {genderOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-4 pt-4">
                <Label className="text-base">House Rules</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Preferred Tenant</Label>
                        <Select
                            value={formData.preferredTenant}
                            onValueChange={v => updateField('preferredTenant', v)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="any">Any / All</SelectItem>
                                <SelectItem value="student">Student Only</SelectItem>
                                <SelectItem value="professional">Working Professional Only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                    {rules.map((rule) => (
                        <div key={rule.id} className="flex items-center space-x-2 border p-4 rounded-lg">
                            <Checkbox
                                id={rule.id}
                                checked={formData[rule.id as keyof FormData] as boolean}
                                onCheckedChange={(checked) => updateField(rule.id as keyof FormData, !!checked)}
                            />
                            <Label htmlFor={rule.id} className="cursor-pointer flex items-center gap-2">
                                <span>{rule.icon}</span>
                                <span>{rule.label}</span>
                            </Label>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export const RulesStep = memo(RulesStepComponent)
