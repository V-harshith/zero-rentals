"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { getSiteSettings, updateSiteSettings, type SiteSettings } from "@/lib/settings-service"

export function ContentEditor() {
    const [settings, setSettings] = useState<SiteSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        setLoading(true)
        try {
            const data = await getSiteSettings()
            setSettings(data)
        } catch (error) {
            toast.error("Failed to load settings")
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async (section: string, data: any) => {
        setSaving(true)
        try {
            const { error } = await updateSiteSettings(section, data)
            if (error) {
                console.error('Settings update error:', error)
                throw new Error(error.message || 'Failed to save settings')
            }
            await loadSettings() // Reload to confirm
            toast.success("Settings saved successfully")
        } catch (error: any) {
            console.error('Content editor save error:', error)
            toast.error(error.message || "Failed to save settings")
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!settings) return null

    return (
        <Tabs defaultValue="contact" className="space-y-4">
            <TabsList>
                <TabsTrigger value="contact">Contact Info</TabsTrigger>
                <TabsTrigger value="hero">Hero Banner</TabsTrigger>
                <TabsTrigger value="social">Social Links</TabsTrigger>
            </TabsList>

            <TabsContent value="contact">
                <Card>
                    <CardHeader>
                        <CardTitle>Contact Information</CardTitle>
                        <CardDescription>Update public contact details</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Email Address</Label>
                            <Input
                                value={settings.contact_info?.email || ""}
                                onChange={(e) => setSettings({ ...settings, contact_info: { ...settings.contact_info, email: e.target.value } })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Phone Number</Label>
                            <Input
                                value={settings.contact_info?.phone || ""}
                                onChange={(e) => setSettings({ ...settings, contact_info: { ...settings.contact_info, phone: e.target.value } })}
                            />
                        </div>
                        <Button
                            onClick={() => handleSave("contact_info", settings.contact_info)}
                            disabled={saving}
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Changes
                        </Button>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="hero">
                <Card>
                    <CardHeader>
                        <CardTitle>Hero Banner</CardTitle>
                        <CardDescription>Customize the homepage hero section</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Main Title</Label>
                            <Input
                                value={settings.hero_banner?.title || ""}
                                onChange={(e) => setSettings({ ...settings, hero_banner: { ...settings.hero_banner, title: e.target.value } })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Subtitle</Label>
                            <Input
                                value={settings.hero_banner?.subtitle || ""}
                                onChange={(e) => setSettings({ ...settings, hero_banner: { ...settings.hero_banner, subtitle: e.target.value } })}
                            />
                        </div>
                        <Button
                            onClick={() => handleSave("hero_banner", settings.hero_banner)}
                            disabled={saving}
                        >
                            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Save Banner
                        </Button>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    )
}
