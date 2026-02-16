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
    preferred_city?: string;
    preferred_area?: string;
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

    // Map database fields to User interface - compute verified from email_verified_at
    return (data || []).map((user: any) => ({
        ...user,
        // A user is considered verified if either the verified flag is true OR email_verified_at is set
        verified: user.verified === true || user.email_verified_at !== null
    })) as User[];
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
        .update({
            verified: true,
            email_verified_at: new Date().toISOString()
        })
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
 * Note: Email cannot be changed through this function for security reasons
 */
export async function updateUserProfile(userId: string, updates: Partial<User>): Promise<{ error: any }> {
    try {
        // Remove email from updates to prevent email changes
        const { email, ...safeUpdates } = updates

        const { error } = await supabase
            .from('users')
            .update(safeUpdates)
            .eq('id', userId)

        if (error) throw error
        return { error: null }
    } catch (error) {
        console.error("Error updating profile:", error)
        return { error }
    }
}
