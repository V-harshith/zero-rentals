"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    FileSpreadsheet,
    Download, Loader2, Users, Key,
    History, Clock, RotateCcw,
    ChevronDown, ArrowRight, Images, Sparkles
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { useSecureFetch } from "@/lib/csrf-context"

// ============================================================================
// TYPES
// ============================================================================
interface UploadHistoryItem {
    id: string
    file_name: string
    total_rows: number
    success_count: number
    failed_count: number
    status: string
    new_owners_count: number
    created_at: string
    completed_at: string | null
}

interface UploadDetail {
    id: string
    file_name: string
    status: string
    total_rows: number
    success_count: number
    failed_count: number
    new_owners_count: number
    errors: string[]
    credentials_count: number
    created_at: string
    completed_at: string | null
}

// ============================================================================
// COMPONENT
// ============================================================================
export function BulkUploadTab() {
    const secureFetch = useSecureFetch()

    // Upload history
    const [history, setHistory] = useState<UploadHistoryItem[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [uploadDetail, setUploadDetail] = useState<UploadDetail | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)

    // Load upload history on mount
    const loadHistory = useCallback(async () => {
        setLoadingHistory(true)
        try {
            const res = await secureFetch('/api/admin/bulk-upload/history')
            if (res.ok) {
                const data = await res.json()
                setHistory(data.uploads || [])
            }
        } catch {
            // Silent fail for history
        } finally {
            setLoadingHistory(false)
        }
    }, [secureFetch])

    useEffect(() => {
        loadHistory()
    }, [])

    const toggleDetail = async (id: string) => {
        if (expandedId === id) {
            setExpandedId(null)
            setUploadDetail(null)
            return
        }
        setExpandedId(id)
        setLoadingDetail(true)
        setUploadDetail(null)
        try {
            const res = await fetch(`/api/admin/bulk-upload/${id}`)
            if (res.ok) {
                const data = await res.json()
                setUploadDetail(data.upload)
            } else {
                toast.error('Failed to load upload details')
            }
        } catch {
            toast.error('Failed to load upload details')
        } finally {
            setLoadingDetail(false)
        }
    }

    const downloadPastCredentials = (id: string) => {
        window.open(`/api/admin/bulk-upload/${id}?format=csv`, '_blank')
        toast.success('Credentials download started')
    }

    const downloadPastErrors = () => {
        if (!uploadDetail?.errors?.length) return
        const csvRows = ['Category,Row,Error']
        for (const error of uploadDetail.errors) {
            csvRows.push(`"${error.replace(/"/g, '""')}"`)
        }
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `errors_${uploadDetail.file_name}_${new Date(uploadDetail.created_at).toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    // ========================================================================
    // RENDER
    // ====================================================================
    return (
        <div className="space-y-6">
            {/* New Unified Bulk Import Card */}
            <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-blue-600" />
                        Unified Bulk Import (New)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-start gap-4">
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground mb-3">
                                Import properties with images in one seamless workflow. Upload your Excel file
                                and image folders organized by PSN. The system will automatically match
                                images to properties and create owner accounts.
                            </p>
                            <div className="flex flex-wrap gap-2 mb-4">
                                <Badge variant="outline" className="gap-1">
                                    <FileSpreadsheet className="h-3 w-3" />
                                    Excel Upload
                                </Badge>
                                <Badge variant="outline" className="gap-1">
                                    <Images className="h-3 w-3" />
                                    Image Folders
                                </Badge>
                                <Badge variant="outline" className="gap-1">
                                    <Users className="h-3 w-3" />
                                    Auto-Create Owners
                                </Badge>
                            </div>
                        </div>
                    </div>
                    <Link href="/dashboard/admin/bulk-import">
                        <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                            Launch Unified Import Wizard
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </CardContent>
            </Card>

{/* Upload History */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <History className="h-5 w-5" />
                            Upload History
                        </CardTitle>
                        <Button variant="ghost" size="sm" onClick={loadHistory} disabled={loadingHistory}>
                            <RotateCcw className={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loadingHistory ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            Loading history...
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p>No upload history yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {history.map((item) => (
                                <div key={item.id} className="rounded-lg border hover:bg-muted/50 transition-colors">
                                    <button
                                        onClick={() => toggleDetail(item.id)}
                                        className="w-full flex items-center justify-between p-3 text-left"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <p className="font-medium text-sm truncate">{item.file_name}</p>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {new Date(item.created_at).toLocaleDateString('en-IN', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right text-xs">
                                                <span className="text-green-600 font-medium">{item.success_count}</span>
                                                <span className="text-muted-foreground"> / </span>
                                                <span>{item.total_rows}</span>
                                                {item.failed_count > 0 && (
                                                    <span className="text-red-600 ml-1">({item.failed_count} failed)</span>
                                                )}
                                            </div>
                                            {item.new_owners_count > 0 && (
                                                <Badge variant="outline" className="text-xs gap-1">
                                                    <Users className="h-3 w-3" />
                                                    {item.new_owners_count}
                                                </Badge>
                                            )}
                                            <Badge
                                                variant={
                                                    item.status === 'completed' ? 'default' :
                                                    item.status === 'processing' ? 'secondary' : 'destructive'
                                                }
                                                className="text-xs"
                                            >
                                                {item.status}
                                            </Badge>
                                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedId === item.id ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {/* Expanded Detail Panel */}
                                    {expandedId === item.id && (
                                        <div className="px-4 pb-4 border-t">
                                            {loadingDetail ? (
                                                <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    Loading details...
                                                </div>
                                            ) : uploadDetail ? (
                                                <div className="pt-3 space-y-3">
                                                    {/* Stats Row */}
                                                    <div className="grid grid-cols-4 gap-2">
                                                        <div className="text-center p-2 bg-blue-50 rounded">
                                                            <p className="text-lg font-bold">{uploadDetail.total_rows}</p>
                                                            <p className="text-xs text-muted-foreground">Total</p>
                                                        </div>
                                                        <div className="text-center p-2 bg-green-50 rounded">
                                                            <p className="text-lg font-bold text-green-600">{uploadDetail.success_count}</p>
                                                            <p className="text-xs text-muted-foreground">Success</p>
                                                        </div>
                                                        <div className="text-center p-2 bg-red-50 rounded">
                                                            <p className="text-lg font-bold text-red-600">{uploadDetail.failed_count}</p>
                                                            <p className="text-xs text-muted-foreground">Failed</p>
                                                        </div>
                                                        <div className="text-center p-2 bg-purple-50 rounded">
                                                            <p className="text-lg font-bold text-purple-600">{uploadDetail.new_owners_count}</p>
                                                            <p className="text-xs text-muted-foreground">New Owners</p>
                                                        </div>
                                                    </div>

                                                    {/* Duration */}
                                                    {uploadDetail.completed_at && (
                                                        <p className="text-xs text-muted-foreground">
                                                            Duration: {Math.round((new Date(uploadDetail.completed_at).getTime() - new Date(uploadDetail.created_at).getTime()) / 1000)}s
                                                        </p>
                                                    )}

                                                    {/* Error Summary */}
                                                    {uploadDetail.errors.length > 0 && (
                                                        <div className="bg-red-50 border border-red-200 rounded p-3">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs font-medium text-red-800">
                                                                    {uploadDetail.errors.length} error{uploadDetail.errors.length > 1 ? 's' : ''}
                                                                </span>
                                                                <Button variant="ghost" size="sm" onClick={downloadPastErrors} className="text-xs h-6 px-2 gap-1">
                                                                    <Download className="h-3 w-3" />
                                                                    Errors CSV
                                                                </Button>
                                                            </div>
                                                            <div className="text-xs text-red-700 max-h-24 overflow-y-auto space-y-0.5">
                                                                {uploadDetail.errors.slice(0, 5).map((err, i) => (
                                                                    <p key={i}>• {err}</p>
                                                                ))}
                                                                {uploadDetail.errors.length > 5 && (
                                                                    <p className="font-medium">...and {uploadDetail.errors.length - 5} more</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Action Buttons */}
                                                    <div className="flex gap-2">
                                                        {uploadDetail.credentials_count > 0 && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => downloadPastCredentials(uploadDetail.id)}
                                                                className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                                                            >
                                                                <Key className="h-3 w-3" />
                                                                Download {uploadDetail.credentials_count} Credentials
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="py-4 text-center text-sm text-muted-foreground">Failed to load details</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
