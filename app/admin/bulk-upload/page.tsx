"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

export default function BulkUploadPage() {
    const router = useRouter()
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [results, setResults] = useState<{
        total: number
        success: number
        failed: number
        errors: string[]
    } | null>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0]
            if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
                setFile(selectedFile)
                setResults(null)
            } else {
                toast.error("Please select an Excel file (.xlsx or .xls)")
            }
        }
    }

    const handleUpload = async () => {
        if (!file) {
            toast.error("Please select a file first")
            return
        }

        setUploading(true)
        setProgress(0)
        setResults(null)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('/api/admin/bulk-upload', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                throw new Error('Upload failed')
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    const chunk = decoder.decode(value)
                    const lines = chunk.split('\n').filter(line => line.trim())

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line)

                            if (data.progress !== undefined) {
                                setProgress(data.progress)
                            }

                            if (data.results) {
                                setResults(data.results)
                                if (data.results.failed === 0) {
                                    toast.success(`Successfully uploaded ${data.results.success} properties!`)
                                } else {
                                    toast.warning(`Uploaded ${data.results.success} properties with ${data.results.failed} errors`)
                                }
                            }
                        } catch (e) {
                            console.error('Parse error:', e)
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Upload error:', error)
            toast.error("Failed to upload file")
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="min-h-screen bg-muted/30 py-8">
            <div className="container mx-auto px-4 max-w-4xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Bulk Property Upload</h1>
                    <p className="text-muted-foreground">Upload Excel file with property listings</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileSpreadsheet className="h-5 w-5" />
                            Upload Excel File
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* File Upload */}
                        <div className="border-2 border-dashed rounded-lg p-8 text-center">
                            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <h3 className="font-semibold mb-2">Choose Excel File</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                Upload .xlsx or .xls file with property data
                            </p>
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileChange}
                                className="hidden"
                                id="file-upload"
                                disabled={uploading}
                            />
                            <label htmlFor="file-upload">
                                <Button variant="outline" disabled={uploading} asChild>
                                    <span>Select File</span>
                                </Button>
                            </label>
                            {file && (
                                <div className="mt-4 p-3 bg-muted rounded-lg">
                                    <p className="text-sm font-semibold">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Expected Format */}
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                                <strong>Expected Excel Columns:</strong>
                                <div className="mt-2 text-xs space-y-1">
                                    <p>• Country, City, Area, Locality</p>
                                    <p>• PG's For, Property Name, Owner Name, Owner Contact</p>
                                    <p>• Landmark, USP, Facilities</p>
                                    <p>• Private Room, Double Sharing, Triple Sharing, Four Sharing</p>
                                    <p>• Deposit, Location (Google Maps URL), PSN</p>
                                </div>
                            </AlertDescription>
                        </Alert>

                        {/* Progress */}
                        {uploading && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span>Uploading...</span>
                                    <span>{progress}%</span>
                                </div>
                                <Progress value={progress} />
                            </div>
                        )}

                        {/* Results */}
                        {results && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <Card>
                                        <CardContent className="pt-6 text-center">
                                            <p className="text-2xl font-bold">{results.total}</p>
                                            <p className="text-sm text-muted-foreground">Total</p>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6 text-center">
                                            <p className="text-2xl font-bold text-green-600">{results.success}</p>
                                            <p className="text-sm text-muted-foreground">Success</p>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6 text-center">
                                            <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                                            <p className="text-sm text-muted-foreground">Failed</p>
                                        </CardContent>
                                    </Card>
                                </div>

                                {results.errors.length > 0 && (
                                    <Alert variant="destructive">
                                        <XCircle className="h-4 w-4" />
                                        <AlertDescription>
                                            <strong>Errors:</strong>
                                            <div className="mt-2 text-xs max-h-40 overflow-y-auto">
                                                {results.errors.slice(0, 10).map((error, index) => (
                                                    <p key={index}>• {error}</p>
                                                ))}
                                                {results.errors.length > 10 && (
                                                    <p className="mt-2 font-semibold">
                                                        ...and {results.errors.length - 10} more errors
                                                    </p>
                                                )}
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            <Button
                                onClick={handleUpload}
                                disabled={!file || uploading}
                                className="flex-1"
                                size="lg"
                            >
                                {uploading ? (
                                    <>Uploading...</>
                                ) : (
                                    <>
                                        <Upload className="h-4 w-4 mr-2" />
                                        Upload Properties
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => router.push('/dashboard/admin')}
                                disabled={uploading}
                            >
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
