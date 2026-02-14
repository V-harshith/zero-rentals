import { describe, it, expect } from 'vitest'

// Import the PSN extraction function logic from the API route
function extractPSNFromPath(filepath: string): string | null {
    // Remove leading/trailing slashes and normalize
    const normalizedPath = filepath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    const parts = normalizedPath.split('/')

    // Try folder name first (should be the first folder after root)
    if (parts.length >= 2) {
        const potentialPsn = parts[parts.length - 2]
        if (/^\d+$/.test(potentialPsn)) {
            return potentialPsn
        }
    }

    // Try filename patterns as fallback
    const filename = parts[parts.length - 1] || ''
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')

    const patterns = [
        /^(\d+)$/,
        /^PSN-?(\d+)$/i,
        /^(\d+)[-_]\d+$/,
    ]

    for (const pattern of patterns) {
        const match = nameWithoutExt.match(pattern)
        if (match) return match[1]
    }

    return null
}

describe('PSN Extraction from File Paths', () => {
    describe('Folder name extraction (primary method)', () => {
        it('should extract PSN from standard folder structure', () => {
            expect(extractPSNFromPath('Harshith Prop Pics/1053/image1.jpg')).toBe('1053')
            expect(extractPSNFromPath('photos/2048/img_001.jpg')).toBe('2048')
        })

        it('should extract PSN from nested folder structure', () => {
            expect(extractPSNFromPath('bulk/2024/properties/1053/photo.jpg')).toBe('1053')
            expect(extractPSNFromPath('root/sub/deep/9999/image.png')).toBe('9999')
        })

        it('should extract PSN from path with spaces', () => {
            expect(extractPSNFromPath('My Properties/1234/some image.jpg')).toBe('1234')
        })

        it('should handle Windows-style paths', () => {
            expect(extractPSNFromPath('Harshith Prop Pics\\1053\\image1.jpg')).toBe('1053')
            expect(extractPSNFromPath('photos\\2048\\img_001.jpg')).toBe('2048')
        })
    })

    describe('Filename pattern extraction (fallback)', () => {
        it('should extract PSN from plain numeric filename', () => {
            expect(extractPSNFromPath('folder/1053.jpg')).toBe('1053')
            expect(extractPSNFromPath('1053.jpg')).toBe('1053')
        })

        it('should extract PSN from PSN-prefixed filename', () => {
            expect(extractPSNFromPath('folder/PSN-1053.jpg')).toBe('1053')
            expect(extractPSNFromPath('folder/psn-2048.png')).toBe('2048')
            expect(extractPSNFromPath('folder/PSN1053.jpg')).toBe('1053')
        })

        it('should extract PSN from numbered filename variants', () => {
            expect(extractPSNFromPath('folder/1053-1.jpg')).toBe('1053')
            expect(extractPSNFromPath('folder/1053_2.jpg')).toBe('1053')
            expect(extractPSNFromPath('folder/2048-001.jpg')).toBe('2048')
        })
    })

    describe('Edge cases', () => {
        it('should return null for paths without numeric PSN', () => {
            expect(extractPSNFromPath('folder/abc/image.jpg')).toBeNull()
            expect(extractPSNFromPath('random/path/file.jpg')).toBeNull()
        })

        it('should return null for empty paths', () => {
            expect(extractPSNFromPath('')).toBeNull()
            expect(extractPSNFromPath('/')).toBeNull()
        })

        it('should handle single-level paths', () => {
            expect(extractPSNFromPath('1053.jpg')).toBe('1053')
        })

        it('should prioritize folder name over filename', () => {
            // Folder name is 1053, filename is 2048.jpg - should return folder name
            expect(extractPSNFromPath('properties/1053/2048.jpg')).toBe('1053')
        })

        it('should handle leading/trailing slashes', () => {
            expect(extractPSNFromPath('/Harshith Prop Pics/1053/image1.jpg')).toBe('1053')
            expect(extractPSNFromPath('Harshith Prop Pics/1053/image1.jpg/')).toBe('1053')
            expect(extractPSNFromPath('/Harshith Prop Pics/1053/image1.jpg/')).toBe('1053')
        })
    })

    describe('Real-world scenarios', () => {
        it('should handle typical bulk import folder structures', () => {
            // Multiple properties in one folder
            expect(extractPSNFromPath('ZeroRentals Upload/1053/living_room.jpg')).toBe('1053')
            expect(extractPSNFromPath('ZeroRentals Upload/1053/bedroom.jpg')).toBe('1053')
            expect(extractPSNFromPath('ZeroRentals Upload/1054/kitchen.jpg')).toBe('1054')
            expect(extractPSNFromPath('ZeroRentals Upload/1055/balcony.jpg')).toBe('1055')
        })

        it('should handle various image formats', () => {
            expect(extractPSNFromPath('props/1234/image.jpg')).toBe('1234')
            expect(extractPSNFromPath('props/1234/image.jpeg')).toBe('1234')
            expect(extractPSNFromPath('props/1234/image.png')).toBe('1234')
            expect(extractPSNFromPath('props/1234/image.webp')).toBe('1234')
        })
    })
})
