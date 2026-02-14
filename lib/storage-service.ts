import { supabase } from '@/lib/supabase';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const STORAGE_BUCKET = 'property-images';

export interface UploadProgress {
    fileName: string;
    progress: number;
    status: 'uploading' | 'success' | 'error';
    url?: string;
    error?: string;
}

/**
 * Validate file before upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        return {
            valid: false,
            error: `Invalid file type. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`,
        };
    }

    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        };
    }

    return { valid: true };
}

/**
 * Upload multiple property images to Supabase Storage
 */
export async function uploadPropertyImages(
    files: File[],
    propertyId: string,
    onProgress?: (progress: UploadProgress[]) => void
): Promise<{ urls: string[]; errors: string[] }> {
    const uploadedUrls: string[] = [];
    const errors: string[] = [];
    const progressArray: UploadProgress[] = files.map((file) => ({
        fileName: file.name,
        progress: 0,
        status: 'uploading' as const,
    }));

    // Notify initial progress
    if (onProgress) {
        onProgress([...progressArray]);
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validate file
        const validation = validateFile(file);
        if (!validation.valid) {
            progressArray[i].status = 'error';
            progressArray[i].error = validation.error;
            errors.push(`${file.name}: ${validation.error}`);
            if (onProgress) onProgress([...progressArray]);
            continue;
        }

        try {
            // Generate unique file name
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(7);
            const fileExt = file.name.split('.').pop();
            const fileName = `${propertyId}/${timestamp}-${randomString}.${fileExt}`;

            // Upload to Supabase Storage
            const { data, error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false,
                });

            if (error) {
                throw error;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(fileName);

            if (urlData?.publicUrl) {
                uploadedUrls.push(urlData.publicUrl);
                progressArray[i].status = 'success';
                progressArray[i].progress = 100;
                progressArray[i].url = urlData.publicUrl;
            } else {
                throw new Error('Failed to get public URL');
            }
        } catch (error: any) {
            progressArray[i].status = 'error';
            progressArray[i].error = error.message || 'Upload failed';
            errors.push(`${file.name}: ${error.message || 'Upload failed'}`);
        }

        // Notify progress
        if (onProgress) {
            onProgress([...progressArray]);
        }
    }

    return { urls: uploadedUrls, errors };
}

/**
 * Delete a property image from Supabase Storage
 */
export async function deletePropertyImage(imageUrl: string): Promise<{ error: any }> {
    try {
        // Extract file path from URL
        const url = new URL(imageUrl);
        const pathParts = url.pathname.split(`/${STORAGE_BUCKET}/`);
        if (pathParts.length < 2) {
            throw new Error('Invalid image URL');
        }
        const filePath = pathParts[1];

        const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);

        return { error };
    } catch (error: any) {
        return { error };
    }
}

/**
 * Get public URL for an image path
 */
export function getPublicUrl(filePath: string): string {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return data?.publicUrl || '';
}

/**
 * Delete all images for a property
 */
export async function deletePropertyImages(propertyId: string): Promise<{ error: any }> {
    try {
        // List all files in the property folder
        const { data: files, error: listError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list(propertyId);

        if (listError) throw listError;

        if (!files || files.length === 0) {
            return { error: null };
        }

        // Delete all files
        const filePaths = files.map((file) => `${propertyId}/${file.name}`);
        const { error: deleteError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove(filePaths);

        return { error: deleteError };
    } catch (error: any) {
        return { error };
    }
}
