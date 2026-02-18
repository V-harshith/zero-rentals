/**
 * Bulk Import System - Structured Logger
 *
 * Development-only logging with proper log levels.
 * No logs in production builds.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
    level: LogLevel
    message: string
    timestamp: string
    context?: Record<string, unknown>
}

/**
 * Check if running in development mode
 */
function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development'
}

/**
 * Format a log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
    const contextStr = entry.context
        ? ` ${JSON.stringify(entry.context)}`
        : ''
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${contextStr}`
}

/**
 * Create a timestamp string
 */
function getTimestamp(): string {
    return new Date().toISOString()
}

/**
 * Log a message (development only)
 */
function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!isDevelopment()) {
        return
    }

    const entry: LogEntry = {
        level,
        message,
        timestamp: getTimestamp(),
        context,
    }

    const formatted = formatLogEntry(entry)

    switch (level) {
        case 'debug':
            // eslint-disable-next-line no-console
            console.debug(formatted)
            break
        case 'info':
            // eslint-disable-next-line no-console
            console.info(formatted)
            break
        case 'warn':
            // eslint-disable-next-line no-console
            console.warn(formatted)
            break
        case 'error':
            // eslint-disable-next-line no-console
            console.error(formatted)
            break
    }
}

/**
 * Logger interface for bulk import operations
 */
export const logger = {
    /**
     * Debug level logging - verbose details for debugging
     */
    debug: (message: string, context?: Record<string, unknown>): void => {
        log('debug', message, context)
    },

    /**
     * Info level logging - general operational information
     */
    info: (message: string, context?: Record<string, unknown>): void => {
        log('info', message, context)
    },

    /**
     * Warn level logging - potential issues that don't block operation
     */
    warn: (message: string, context?: Record<string, unknown>): void => {
        log('warn', message, context)
    },

    /**
     * Error level logging - errors that may affect operation
     */
    error: (message: string, context?: Record<string, unknown>): void => {
        log('error', message, context)
    },

    /**
     * Log an operation start
     */
    start: (operation: string, context?: Record<string, unknown>): void => {
        log('info', `Starting: ${operation}`, context)
    },

    /**
     * Log an operation completion
     */
    complete: (operation: string, context?: Record<string, unknown>): void => {
        log('info', `Completed: ${operation}`, context)
    },

    /**
     * Log an operation failure
     */
    failed: (operation: string, error: unknown, context?: Record<string, unknown>): void => {
        const errorContext = {
            ...context,
            error: error instanceof Error ? error.message : String(error),
        }
        log('error', `Failed: ${operation}`, errorContext)
    },
}

/**
 * No-op logger for production (tree-shakeable)
 */
export const noopLogger = {
    debug: (): void => {},
    info: (): void => {},
    warn: (): void => {},
    error: (): void => {},
    start: (): void => {},
    complete: (): void => {},
    failed: (): void => {},
}

/**
 * Get the appropriate logger based on environment
 */
export function getLogger(): typeof logger {
    return isDevelopment() ? logger : noopLogger
}
