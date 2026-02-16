import { supabase } from '@/lib/supabase';

const SESSION_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry

export class SessionManager {
    private refreshTimer: NodeJS.Timeout | null = null;
    private supabaseClient = supabase;

    /**
     * Start automatic session refresh
     */
    start() {
        // Clear any existing timer
        this.stop();

        // Set up periodic refresh
        this.refreshTimer = setInterval(async () => {
            await this.refreshSession();
        }, SESSION_REFRESH_INTERVAL);

        // Also refresh immediately if session is close to expiry
        this.checkAndRefreshIfNeeded();
    }

    /**
     * Stop automatic session refresh
     */
    stop() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * Check if session needs refresh and refresh if needed
     */
    private async checkAndRefreshIfNeeded() {
        try {
            const {
                data: { session },
            } = await this.supabaseClient.auth.getSession();

            if (!session) {
                return;
            }

            const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
            const now = Date.now();
            const timeUntilExpiry = expiresAt - now;

            // Refresh if session expires in less than 5 minutes
            if (timeUntilExpiry < SESSION_EXPIRY_BUFFER) {
                await this.refreshSession();
            }
        } catch (error) {
            console.error('Error checking session expiry:', error);
        }
    }

    /**
     * Manually refresh the session
     */
    async refreshSession(): Promise<boolean> {
        try {
            const { data, error } = await this.supabaseClient.auth.refreshSession();

            if (error) {
                console.error('Session refresh failed:', error);

                // CRITICAL: Only sign out on actual auth errors, not network errors
                if (error.message.includes('refresh_token_not_found') ||
                    error.message.includes('invalid_grant') ||
                    error.message.includes('Token expired') ||
                    error.message.includes('Invalid token')) {
                    console.warn('Session expired, user needs to re-login');
                    // Just sign out. AuthContext will detect the SIGNED_OUT event and update UI.
                    await this.supabaseClient.auth.signOut();
                    return false;
                }

                // Network errors - don't sign out, just return false
                if (error.message.includes('fetch') || 
                    error.message.includes('network') ||
                    error.message.includes('Network')) {
                    console.warn('Network error during session refresh, will retry later');
                    return false;
                }

                return false;
            }

            if (data.session) {
                return true;
            }

            return false;
        } catch (error: any) {
            console.error('Unexpected error during session refresh:', error);
            
            // Don't sign out on unexpected errors - could be network issues
            return false;
        }
    }

    /**
     * Get current session
     */
    async getSession() {
        const {
            data: { session },
        } = await this.supabaseClient.auth.getSession();
        return session;
    }

    /**
     * Check if session is valid
     */
    async isSessionValid(): Promise<boolean> {
        try {
            const session = await this.getSession();

            if (!session) {
                return false;
            }

            const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
            const now = Date.now();

            return expiresAt > now;
        } catch (error) {
            console.error('Error checking session validity:', error);
            return false;
        }
    }
}

// Singleton instance
let sessionManager: SessionManager | null = null;

/**
 * Get the session manager instance
 */
export function getSessionManager(): SessionManager {
    if (!sessionManager) {
        sessionManager = new SessionManager();
    }
    return sessionManager;
}

/**
 * Initialize session management (call this in your app initialization)
 * Returns cleanup function to prevent memory leaks
 */
export function initializeSessionManagement(): () => void {
    const manager = getSessionManager();
    manager.start();

    // Clean up on page unload
    if (typeof window !== 'undefined') {
        const beforeUnloadHandler = () => manager.stop();
        window.addEventListener('beforeunload', beforeUnloadHandler);

        // CRITICAL: Recover session when user returns to tab
        // This handles cases where user was away and session might have expired
        const visibilityHandler = async () => {
            if (document.visibilityState === 'visible') {
                // Check if session is still valid
                const isValid = await manager.isSessionValid();

                if (!isValid) {
                    await manager.refreshSession();
                }
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);

        // CRITICAL: Handle online/offline events
        const onlineHandler = async () => {
            const session = await manager.getSession();
            if (session) {
                const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
                const now = Date.now();
                const timeUntilExpiry = expiresAt - now;

                if (timeUntilExpiry < SESSION_EXPIRY_BUFFER) {
                    await manager.refreshSession();
                }
            }
        };
        window.addEventListener('online', onlineHandler);

        // Return cleanup function
        return () => {
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            document.removeEventListener('visibilitychange', visibilityHandler);
            window.removeEventListener('online', onlineHandler);
            manager.stop();
        };
    }

    // Return no-op cleanup for SSR
    return () => {};
}

