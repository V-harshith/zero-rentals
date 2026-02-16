import { supabase } from '@/lib/supabase';

const SESSION_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry
const LOCK_TIMEOUT = 10 * 1000; // 10 seconds lock timeout
const LEADER_HEARTBEAT_INTERVAL = 5 * 1000; // 5 seconds
const LEADER_TIMEOUT = 15 * 1000; // 15 seconds without heartbeat = new leader

// Message types for cross-tab communication
type BroadcastMessage =
    | { type: 'REFRESH_REQUEST'; tabId: string; timestamp: number }
    | { type: 'REFRESH_COMPLETE'; tabId: string; success: boolean; timestamp: number }
    | { type: 'REFRESH_IN_PROGRESS'; tabId: string; timestamp: number }
    | { type: 'LEADER_HEARTBEAT'; tabId: string; timestamp: number }
    | { type: 'LEADER_ELECTION'; tabId: string; timestamp: number };

export class SessionManager {
    private refreshTimer: NodeJS.Timeout | null = null;
    private supabaseClient = supabase;

    // Concurrent request handling
    private refreshPromise: Promise<boolean> | null = null;
    private refreshLock: boolean = false;
    private lockTimeoutId: NodeJS.Timeout | null = null;

    // Cross-tab coordination
    private broadcastChannel: BroadcastChannel | null = null;
    private tabId: string;
    private isLeader: boolean = false;
    private leaderHeartbeatTimer: NodeJS.Timeout | null = null;
    private leaderCheckTimer: NodeJS.Timeout | null = null;
    private lastLeaderHeartbeat: number = 0;

    constructor() {
        // Generate unique tab ID
        this.tabId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Initialize broadcast channel for cross-tab communication
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            this.broadcastChannel = new BroadcastChannel('zero_rentals_session');
            this.broadcastChannel.onmessage = (event) => {
                this.handleBroadcastMessage(event.data as BroadcastMessage);
            };

            // Start leader election
            this.startLeaderElection();
        }
    }

    /**
     * Handle incoming broadcast messages from other tabs
     */
    private handleBroadcastMessage(message: BroadcastMessage): void {
        switch (message.type) {
            case 'REFRESH_REQUEST':
                // If we're the leader, handle the refresh
                if (this.isLeader && message.tabId !== this.tabId) {
                    this.performRefresh();
                }
                break;

            case 'REFRESH_COMPLETE':
                // Clear lock if another tab completed a refresh
                if (message.tabId !== this.tabId) {
                    this.clearLock();
                }
                break;

            case 'REFRESH_IN_PROGRESS':
                // Another tab is refreshing, wait for it
                if (message.tabId !== this.tabId) {
                    this.waitForOtherTabRefresh();
                }
                break;

            case 'LEADER_HEARTBEAT':
                if (message.tabId !== this.tabId) {
                    this.lastLeaderHeartbeat = message.timestamp;
                    this.isLeader = false; // Another tab is leader
                }
                break;

            case 'LEADER_ELECTION':
                if (message.tabId !== this.tabId) {
                    // Another tab is claiming leadership, yield if they have lower ID
                    if (message.tabId < this.tabId) {
                        this.isLeader = false;
                    }
                }
                break;
        }
    }

    /**
     * Start leader election process
     */
    private startLeaderElection(): void {
        // Claim leadership initially
        this.claimLeadership();

        // Start heartbeat to maintain leadership
        this.leaderHeartbeatTimer = setInterval(() => {
            if (this.isLeader) {
                this.broadcast({
                    type: 'LEADER_HEARTBEAT',
                    tabId: this.tabId,
                    timestamp: Date.now(),
                });
            }
        }, LEADER_HEARTBEAT_INTERVAL);

        // Check if leader is still alive
        this.leaderCheckTimer = setInterval(() => {
            if (!this.isLeader) {
                const timeSinceLastHeartbeat = Date.now() - this.lastLeaderHeartbeat;
                if (timeSinceLastHeartbeat > LEADER_TIMEOUT) {
                    // Leader is dead, claim leadership
                    this.claimLeadership();
                }
            }
        }, LEADER_HEARTBEAT_INTERVAL);
    }

    /**
     * Claim leadership for this tab
     */
    private claimLeadership(): void {
        this.isLeader = true;
        this.lastLeaderHeartbeat = Date.now();
        this.broadcast({
            type: 'LEADER_ELECTION',
            tabId: this.tabId,
            timestamp: Date.now(),
        });
    }

    /**
    * Broadcast message to all tabs
    */
    private broadcast(message: BroadcastMessage): void {
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage(message);
        }
    }

    /**
     * Acquire lock for token refresh
     */
    private acquireLock(): boolean {
        if (this.refreshLock) {
            return false;
        }

        this.refreshLock = true;

        // Auto-release lock after timeout
        this.lockTimeoutId = setTimeout(() => {
            this.clearLock();
        }, LOCK_TIMEOUT);

        return true;
    }

    /**
     * Clear the refresh lock
     */
    private clearLock(): void {
        this.refreshLock = false;
        this.refreshPromise = null;
        if (this.lockTimeoutId) {
            clearTimeout(this.lockTimeoutId);
            this.lockTimeoutId = null;
        }
    }

    /**
     * Wait for another tab's refresh to complete
     */
    private async waitForOtherTabRefresh(): Promise<boolean> {
        // Wait up to LOCK_TIMEOUT for the other tab to complete
        const startTime = Date.now();
        while (this.refreshLock && Date.now() - startTime < LOCK_TIMEOUT) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Check if session is now valid
        return this.isSessionValid();
    }

    /**
     * Start automatic session refresh
     */
    start() {
        // Clear any existing timer
        this.stop();

        // Set up periodic refresh (only leader performs periodic refresh)
        this.refreshTimer = setInterval(async () => {
            if (this.isLeader) {
                await this.refreshSession();
            }
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

        if (this.leaderHeartbeatTimer) {
            clearInterval(this.leaderHeartbeatTimer);
            this.leaderHeartbeatTimer = null;
        }

        if (this.leaderCheckTimer) {
            clearInterval(this.leaderCheckTimer);
            this.leaderCheckTimer = null;
        }

        this.clearLock();

        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = null;
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
     * Manually refresh the session with deduplication
     */
    async refreshSession(): Promise<boolean> {
        // If a refresh is already in progress, return the existing promise
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        // Try to acquire lock
        if (!this.acquireLock()) {
            // Another tab is refreshing, wait for it
            return this.waitForOtherTabRefresh();
        }

        // Notify other tabs that we're starting a refresh
        this.broadcast({
            type: 'REFRESH_IN_PROGRESS',
            tabId: this.tabId,
            timestamp: Date.now(),
        });

        // Create the refresh promise
        this.refreshPromise = this.performRefresh();

        try {
            const result = await this.refreshPromise;

            // Notify other tabs of completion
            this.broadcast({
                type: 'REFRESH_COMPLETE',
                tabId: this.tabId,
                success: result,
                timestamp: Date.now(),
            });

            return result;
        } finally {
            this.clearLock();
        }
    }

    /**
     * Perform the actual session refresh
     */
    private async performRefresh(): Promise<boolean> {
        try {
            const { data, error } = await this.supabaseClient.auth.refreshSession();

            if (error) {
                console.error('Session refresh failed:', error);

                // CRITICAL: Only sign out on actual auth errors, not network errors
                if (
                    error.message.includes('refresh_token_not_found') ||
                    error.message.includes('invalid_grant') ||
                    error.message.includes('Token expired') ||
                    error.message.includes('Invalid token')
                ) {
                    console.warn('Session expired, user needs to re-login');
                    // Just sign out. AuthContext will detect the SIGNED_OUT event and update UI.
                    await this.supabaseClient.auth.signOut();
                    return false;
                }

                // Network errors - don't sign out, just return false
                if (
                    error.message.includes('fetch') ||
                    error.message.includes('network') ||
                    error.message.includes('Network')
                ) {
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

    /**
     * Check if this tab is the leader
     */
    isLeaderTab(): boolean {
        return this.isLeader;
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
                    // Only refresh if we're the leader, otherwise wait for leader
                    if (manager.isLeaderTab()) {
                        await manager.refreshSession();
                    } else {
                        // Request leader to refresh
                        if (manager['broadcastChannel']) {
                            manager['broadcast']({
                                type: 'REFRESH_REQUEST',
                                tabId: manager['tabId'],
                                timestamp: Date.now(),
                            });
                        }
                    }
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
