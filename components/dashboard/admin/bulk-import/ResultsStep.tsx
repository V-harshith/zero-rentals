"use client"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
    CheckCircle,
    XCircle,
    Download,
    RotateCcw,
    Building2,
    Users,
    Images,
    ExternalLink,
    AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

interface ResultsStepProps {
    jobId: string
    results: any
    onStartOver: () => void
}

export function ResultsStep({ jobId, results, onStartOver }: ResultsStepProps) {
    const result = results?.results || {}
    const hasErrors = result.failed_items?.length > 0

    const downloadCredentials = () => {
        window.open(`/api/admin/bulk-import/jobs/${jobId}/credentials`, "_blank")
        toast.success("Credentials download started")
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                {result.failed_properties === 0 ? (
                    <>
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="h-10 w-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-green-800 mb-2">
                            Import Complete!
                        </h2>
                        <p className="text-muted-foreground">
                            All properties have been successfully imported
                        </p>
                    </>
                ) : (
                    <>
                        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="h-10 w-10 text-orange-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-orange-800 mb-2">
                            Import Completed with Errors
                        </h2>
                        <p className="text-muted-foreground">
                            Some properties failed to import. Check the details below.
                        </p>
                    </>
                )}
            </div>

            {/* Results Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6 text-center">
                        <Building2 className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                        <p className="text-2xl font-bold">{result.created_properties}</p>
                        <p className="text-xs text-muted-foreground">Properties Created</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6 text-center">
                        <Users className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        <p className="text-2xl font-bold">{result.new_owners}</p>
                        <p className="text-xs text-muted-foreground">New Owners</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6 text-center">
                        <Images className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                        <p className="text-2xl font-bold">
                            {results?.total_images || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Images Assigned</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6 text-center">
                        {result.failed_properties === 0 ? (
                            <>
                                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                                <p className="text-2xl font-bold text-green-600">0</p>
                                <p className="text-xs text-muted-foreground">Failed</p>
                            </>
                        ) : (
                            <>
                                <XCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                                <p className="text-2xl font-bold text-red-600">{result.failed_properties}</p>
                                <p className="text-xs text-muted-foreground">Failed</p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Credentials Download */}
            {result.new_owners > 0 && (
                <Alert className="bg-green-50 border-green-200">
                    <Download className="h-4 w-4 text-green-600" />
                    <AlertDescription className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-green-800">
                                {result.new_owners} new owner account{result.new_owners > 1 ? "s" : ""} created
                            </p>
                            <p className="text-sm text-green-700 mt-1">
                                Download the credentials CSV now — passwords cannot be retrieved later!
                            </p>
                        </div>
                        <Button
                            onClick={downloadCredentials}
                            className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Download CSV
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* Failed Items */}
            {hasErrors && (
                <div className="border rounded-lg p-4 bg-red-50">
                    <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Failed Items ({result.failed_items.length})
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {result.failed_items.map((item: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                                <Badge variant="outline" className="shrink-0">
                                    {item.type}
                                </Badge>
                                <span className="font-medium">{item.psn || item.email}</span>
                                <span className="text-red-600">{item.error}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Link href="/properties" className="flex-1">
                    <Button variant="outline" className="w-full gap-2">
                        <ExternalLink className="h-4 w-4" />
                        View Properties
                    </Button>
                </Link>

                <Button
                    onClick={onStartOver}
                    className="flex-1 gap-2"
                >
                    <RotateCcw className="h-4 w-4" />
                    Import More Properties
                </Button>
            </div>

            {/* Note */}
            <p className="text-xs text-muted-foreground text-center">
                Properties are now visible on the site. New owners can log in with their credentials.
            </p>
        </div>
    )
}
