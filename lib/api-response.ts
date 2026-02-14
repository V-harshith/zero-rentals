import { NextResponse } from 'next/server'

export type ApiResponse<T = any> = {
    success: boolean
    data?: T
    error?: {
        message: string
        code?: string
        details?: any
    }
}

export function successResponse<T>(data: T, status: number = 200) {
    return NextResponse.json({
        success: true,
        data
    }, { status })
}

export function errorResponse(message: string, status: number = 400, details?: any, code?: string) {
    return NextResponse.json({
        success: false,
        error: {
            message,
            code,
            details
        }
    }, { status })
}
