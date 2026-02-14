"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Eye,
    AlertTriangle,
    CheckCircle,
    Loader2,
    ArrowLeft,
    ArrowRight,
    Building2,
    Users,
    Images,
    Warning,
} from "lucide-react"
import { toast } from "sonner"

interface ReviewStepProps {
    jobId: string
    previewData: any
    onComplete: (data: any) => void
    onBack: () => void
}

export function ReviewStep({ jobId, previewData, onComplete, onBack }: ReviewStepProps) {
    const [confirming, setConfirming] = useState(false)
    const [progress, setProgress] = useState(0)
    const [status, setStatus] = useState("")

    const summary = previewData?.summary || {}
    const properties = previewData?.properties || []
    const newOwners = previewData?.new_owners_preview || []

    const handleConfirm = async () => {
        setConfirming(true)
        setStatus("Starting import...")
        setProgress(0)

        try {
            const res = await fetch(`/api/admin/bulk-import/jobs/${jobId}/confirm`, {
                method: "POST",
            })

            if (!res.ok) {
                const errorData = await res.json()
                throw new Error(errorData.error || "Import failed")
            }

            // Handle streaming response
            const reader = res.body?.getReader()
            const decoder = new TextDecoder()

            if (reader) {
                let buffer = ""

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split("\n")
                    buffer = lines.pop() || ""

                    for (const line of lines) {
                        if (!line.trim()) continue

                        try {
                            const data = JSON.parse(line)

                            if (data.error) {
                                throw new Error(data.error)
                            }

                            if (data.progress !== undefined) {
                                setProgress(data.progress)
                            }

                            if (data.status) {
                                setStatus(data.status)
                            }

                            if (data.completed) {
                                const results = data.results || {}
                                const created = results.created_properties || 0
                                const failed = results.failed_properties || 0
                                const newOwners = results.new_owners || 0

                                if (failed > 0) {
                                    toast.warning(`Import completed with ${failed} errors`, {
                                        description: `${created} properties created, ${newOwners} new owners`,
                                        duration: 6000,
                                    })
                                } else {
                                    toast.success(`Import completed successfully!`, {
                                        description: `${created} properties created, ${newOwners} new owners`,
                                    })
                                }
                                onComplete(data)
                            }

                            // Progress notifications
                            if (data.step === 'creating_owners' && data.owners_created !== undefined) {
                                toast.info(`Creating owner accounts...`, {
                                    description: `${data.owners_created} created`,
                                    id: 'creating-owners',
                                })
                            }

                            if (data.step === 'creating_properties' && data.properties_created !== undefined) {
                                toast.info(`Creating properties...`, {
                                    description: `${data.properties_created} of ${properties.length} done`,
                                    id: 'creating-properties',
                                })
                            }
                        } catch (e: any) {
                            if (e.message) {
                                toast.error(e.message)
                            }
                        }
                    }
                }
            }
        } catch (err: any) {
            toast.error(err.message || "Import failed")
        } finally {
            setConfirming(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Review Import</h2>
                <p className="text-muted-foreground">
                    Review the properties and images before confirming the import
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6 text-center">
                        <Building2 className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                        <p className="text-2xl font-bold">{summary.total_properties}</p>
                        <p className="text-xs text-muted-foreground">Properties</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6 text-center">
                        <Users className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        <p className="text-2xl font-bold">{summary.new_owners}</p>
                        <p className="text-xs text-muted-foreground">New Owners</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6 text-center">
                        <Images className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                        <p className="text-2xl font-bold">{summary.total_images}</p>
                        <p className="text-xs text-muted-foreground">Images</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6 text-center">
                        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        <p className="text-2xl font-bold">{summary.properties_with_images}</p>
                        <p className="text-xs text-muted-foreground">With Images</p>
                    </CardContent>
                </Card>
            </div>

            {/* Warnings */}
            {summary.properties_without_images > 0 && (
                <Alert className="bg-orange-50 border-orange-200">
                    <Warning className="h-4 w-4 text-orange-600" />
                    <AlertDescription className="text-orange-800">
                        <strong>{summary.properties_without_images}</strong> properties will be imported without images.
                        You can add images later via the bulk image upload feature.
                    </AlertDescription>
                </Alert>
            )}

            {summary.orphaned_images > 0 && (
                <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        <strong>{summary.orphaned_images}</strong> images don't match any PSN and will be skipped.
                    </AlertDescription>
                </Alert>
            )}

            {/* New Owners Preview */}
            {newOwners.length > 0 && (
                <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        New Owner Accounts ({newOwners.length})
                    </h3>
                    <div className="bg-muted rounded-lg p-3">
                        <ScrollArea className="h-32">
                            <div className="space-y-2">
                                {newOwners.slice(0, 5).map((owner: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-sm">
                                        <span>{owner.name}</span>
                                        <span className="text-muted-foreground">{owner.email}</span>
                                    </div>
                                ))}
                                {newOwners.length > 5 && (
                                    <p className="text-sm text-muted-foreground">
                                        ...and {newOwners.length - 5} more
                                    </p>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            )}

            {/* Properties Preview */}
            <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Properties Preview ({properties.length})
                </h3>
                <ScrollArea className="h-64 border rounded-lg">
                    <div className="p-2 space-y-2">
                        {properties.slice(0, 20).map((prop: any) => (
                            <div
                                key={prop.psn}
                                className="flex items-center justify-between p-2 bg-muted/50 rounded"
                            >
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline">{prop.psn}</Badge>
                                    <div>
                                        <p className="font-medium text-sm">{prop.property_name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {prop.city}, {prop.area} • {prop.owner_name}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {prop.is_new_owner && (
                                        <Badge variant="secondary" className="text-xs">New Owner</Badge>
                                    )}
                                    {prop.image_count > 0 ? (
                                        <Badge className="bg-green-100 text-green-700 text-xs">
                                            {prop.image_count} images
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-orange-500 text-xs">
                                            No images
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        ))}
                        {properties.length > 20 && (
                            <p className="text-center text-sm text-muted-foreground py-2">
                                ...and {properties.length - 20} more properties
                            </p>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Progress (when confirming) */}
            {confirming && (
                <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium text-blue-800">{status}</span>
                        <span className="text-blue-600">{progress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Confirm Warning */}
            {!confirming && (
                <Alert variant="destructive" className="bg-red-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        <strong>Important:</strong> This action cannot be undone. Please verify all data before confirming.
                        New owner accounts will be created with temporary passwords.
                    </AlertDescription>
                </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
                <Button
                    variant="outline"
                    onClick={onBack}
                    disabled={confirming}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>

                <Button
                    onClick={handleConfirm}
                    disabled={confirming || properties.length === 0}
                    className="flex-1"
                    size="lg"
                >
                    {confirming ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Importing...
                        </>
                    ) : (
                        <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirm Import ({properties.length} properties)
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}
