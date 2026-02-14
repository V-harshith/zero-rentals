import { supabase } from '@/lib/supabase';

export interface User {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    role: 'admin' | 'owner' | 'tenant';
    avatar_url: string | null;
    verified: boolean;
    status: 'active' | 'inactive' | 'suspended';
    city?: string;
    address?: string;
    business_name?: string;
    gst_number?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_holder_name?: string;
    preferences?: any;
    created_at: string;
}

/**
 * Fetch all users (Admin only)
 * @returns Promise resolving to array of users, or throws on error
 */
export async function getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching users:', error);
        throw new Error(`Failed to fetch users: ${error.message}`);
    }

    return data as User[];
}

/**
 * Update user status (Admin only)
 */
export async function updateUserStatus(userId: string, status: 'active' | 'suspended'): Promise<{ error: any }> {
    const { error } = await supabase
        .from('users')
        .update({ status })
        .eq('id', userId);

    return { error };
}

/**
 * Verify user (Admin only)
 */
export async function verifyUser(userId: string): Promise<{ error: any }> {
    const { error } = await supabase
        .from('users')
        .update({ verified: true })
        .eq('id', userId);

    return { error };
}

/**
 * Update user role (Admin only - be careful)
 */
export async function updateUserRole(userId: string, role: 'admin' | 'owner' | 'tenant'): Promise<{ error: any }> {
    const { error } = await supabase
        .from('users')
        .update({ role })
        .eq('id', userId);

    return { error };
}

/**
 * Update user profile data
 */
export async function updateUserProfile(userId: string, updates: Partial<User>): Promise<{ error: any }> {
    try {
        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)

        if (error) throw error
        return { error: null }
    } catch (error) {
        console.error("Error updating profile:", error)
        return { error }
    }
}
