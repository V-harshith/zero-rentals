import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
    }),
    usePathname: () => '/dashboard/admin/bulk-import',
    useSearchParams: () => new URLSearchParams(),
    redirect: vi.fn(),
}))

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: () => ({
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
    }),
    headers: () => new Map(),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    },
    Toaster: () => null,
}))

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockReturnThis(),
        })),
    },
}))

// Mock Supabase server
vi.mock('@/lib/supabase-server', () => ({
    createClient: vi.fn(),
}))

// Mock Supabase admin
vi.mock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
        })),
        storage: {
            from: vi.fn(() => ({
                upload: vi.fn(),
                getPublicUrl: vi.fn(() => ({ publicUrl: 'https://example.com/image.jpg' })),
                remove: vi.fn(),
            })),
        },
        auth: {
            admin: {
                createUser: vi.fn(),
                listUsers: vi.fn(),
            },
        },
    },
}))

// Mock browser-image-compression
vi.mock('browser-image-compression', () => ({
    default: vi.fn((file) => Promise.resolve(file)),
}))

// Global fetch mock
global.fetch = vi.fn()

// Mock FileReader
global.FileReader = class FileReader {
    onload: ((event: any) => void) | null = null
    onerror: ((event: any) => void) | null = null
    result: string | ArrayBuffer | null = null
    readonly EMPTY = 0
    readonly LOADING = 1
    readonly DONE = 2
    readyState = 0

    readAsArrayBuffer(file: Blob) {
        setTimeout(() => {
            this.result = new ArrayBuffer(8)
            if (this.onload) this.onload({ target: this })
        }, 0)
    }

    readAsDataURL(file: Blob) {
        setTimeout(() => {
            this.result = 'data:image/jpeg;base64,test'
            if (this.onload) this.onload({ target: this })
        }, 0)
    }
}

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:test')
global.URL.revokeObjectURL = vi.fn()
