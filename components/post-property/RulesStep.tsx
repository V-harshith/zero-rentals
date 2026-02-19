"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getHouseRules, getGenderOptions, type FormData } from "./types"
import { memo } from "react"
import { ShieldCheck, ImageIcon, Phone, Home } from "lucide-react"

interface RulesStepProps {
    formData: FormData
    setFormData: (data: FormData) => void
    isAdmin?: boolean
    isEditMode?: boolean
}

const RulesStepComponent = ({ formData, setFormData, isAdmin, isEditMode }: RulesStepProps) => {
    const updateField = (field: keyof FormData, value: any) => {
        setFormData({ ...formData, [field]: value })
    }

    const rules = getHouseRules(formData.propertyType)
    const genderOptions = getGenderOptions(formData.propertyType)

    // Consents are required for owners (not admins) posting new properties (not editing)
    const showConsents = !isAdmin && !isEditMode

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

            {/* Legal Consents - Required for owners posting new properties */}
            {showConsents && (
                <div className="space-y-4 pt-6 border-t">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        <Label className="text-base font-semibold">Legal Consents (Required)</Label>
                    </div>
                    <Alert className="bg-blue-50 border-blue-200">
                        <AlertDescription className="text-sm text-blue-800">
                            Please read and agree to the following before submitting your property.
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-4 mt-4">
                        {/* Consent 1: Publish/Display */}
                        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                            <Checkbox
                                id="consentPublished"
                                checked={formData.consentPublished}
                                onCheckedChange={(checked) => updateField('consentPublished', !!checked)}
                                className="mt-0.5"
                            />
                            <div className="space-y-1">
                                <Label htmlFor="consentPublished" className="cursor-pointer font-medium flex items-center gap-2">
                                    <Home className="h-4 w-4" />
                                    Property Listing Consent
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    I confirm that I am the legal owner or authorized representative of this property
                                    and I give my consent to Zerorentals.com to publish, display, and promote this
                                    property on its website and associated marketing platforms.
                                </p>
                            </div>
                        </div>

                        {/* Consent 2: Image Rights */}
                        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                            <Checkbox
                                id="consentImages"
                                checked={formData.consentImages}
                                onCheckedChange={(checked) => updateField('consentImages', !!checked)}
                                className="mt-0.5"
                            />
                            <div className="space-y-1">
                                <Label htmlFor="consentImages" className="cursor-pointer font-medium flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4" />
                                    Image Usage Authorization
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    I confirm that the uploaded images belong to me or I have full rights to use them
                                    and I authorize Zerorentals.com to display them on the platform and marketing materials.
                                </p>
                            </div>
                        </div>

                        {/* Consent 3: Contact Permission */}
                        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                            <Checkbox
                                id="consentContact"
                                checked={formData.consentContact}
                                onCheckedChange={(checked) => updateField('consentContact', !!checked)}
                                className="mt-0.5"
                            />
                            <div className="space-y-1">
                                <Label htmlFor="consentContact" className="cursor-pointer font-medium flex items-center gap-2">
                                    <Phone className="h-4 w-4" />
                                    Contact Permission
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    I agree to be contacted via phone, SMS, WhatsApp, or email regarding property-related
                                    inquiries from potential tenants.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export const RulesStep = memo(RulesStepComponent)
