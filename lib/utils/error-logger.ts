/**
 * Comprehensive Error Logging Module
 *
 * Provides structured error logging with severity levels, context tracking,
 * and multiple output strategies (console, external service, file).
 *
 * Features:
 * - Structured error objects with consistent schema
 * - Severity levels (debug, info, warning, error, critical)
 * - Error codes for categorization
 * - Context and metadata attachment
 * - Error deduplication
 * - Rate limiting for error floods
 * - Async batching for performance
 *
 * @example
 * const logger = createErrorLogger('PaymentService')
 *
 * try {
 *   await processPayment(order)
 * } catch (error) {
 *   logger.error({
 *     code: 'PAYMENT_FAILED',
 *     message: 'Payment processing failed',
 *     cause: error,
 *     context: { orderId: order.id, amount: order.amount }
 *   })
 * }
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical'

export interface ErrorContext {
    [key: string]: unknown
}

export interface ErrorLogEntry {
    id: string
    timestamp: string
    severity: ErrorSeverity
    code: string
    message: string
    source: string
    context?: ErrorContext
    cause?: unknown
    stack?: string
    userAgent?: string
    url?: string
    userId?: string
    sessionId?: string
    correlationId?: string
}

export interface ErrorLoggerConfig {
    source: string
    minSeverity?: ErrorSeverity
    enableConsole?: boolean
    enableRemote?: boolean
    remoteEndpoint?: string
    enableDedup?: boolean
    dedupWindowMs?: number
    maxContextDepth?: number
    redactFields?: string[]
}

export type ErrorHandler = (entry: ErrorLogEntry) => void | Promise<void>

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: Partial<ErrorLoggerConfig> = {
    minSeverity: 'debug',
    enableConsole: true,
    enableRemote: false,
    enableDedup: true,
    dedupWindowMs: 60000, // 1 minute
    maxContextDepth: 3,
    redactFields: ['password', 'token', 'secret', 'apiKey', 'authorization', 'cookie'],
}

const SEVERITY_WEIGHTS: Record<ErrorSeverity, number> = {
    debug: 0,
    info: 1,
    warning: 2,
    error: 3,
    critical: 4,
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique error ID
 */
function generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generate a correlation ID for tracing related errors
 */
function generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get current timestamp in ISO format
 */
function getTimestamp(): string {
    return new Date().toISOString()
}

/**
 * Safely serialize an error to JSON
 */
function safeSerialize(obj: unknown, maxDepth: number = 3, currentDepth: number = 0): unknown {
    if (currentDepth >= maxDepth) {
        return '[Max Depth Reached]'
    }

    if (obj === null || obj === undefined) {
        return obj
    }

    if (obj instanceof Error) {
        return {
            name: obj.name,
            message: obj.message,
            stack: obj.stack,
            ...(obj.cause && { cause: safeSerialize(obj.cause, maxDepth, currentDepth + 1) }),
        }
    }

    if (obj instanceof Date) {
        return obj.toISOString()
    }

    if (obj instanceof Map) {
        return safeSerialize(Object.fromEntries(obj), maxDepth, currentDepth + 1)
    }

    if (obj instanceof Set) {
        return safeSerialize(Array.from(obj), maxDepth, currentDepth + 1)
    }

    if (Array.isArray(obj)) {
        return obj.map(item => safeSerialize(item, maxDepth, currentDepth + 1))
    }

    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(obj)) {
            result[key] = safeSerialize(value, maxDepth, currentDepth + 1)
        }
        return result
    }

    return obj
}

/**
 * Redact sensitive fields from context
 */
function redactSensitiveFields(context: ErrorContext, fieldsToRedact: string[]): ErrorContext {
    const redacted: ErrorContext = {}

    for (const [key, value] of Object.entries(context)) {
        const shouldRedact = fieldsToRedact.some(field =>
            key.toLowerCase().includes(field.toLowerCase())
        )

        if (shouldRedact) {
            redacted[key] = '[REDACTED]'
        } else if (typeof value === 'object' && value !== null) {
            redacted[key] = redactSensitiveFields(value as ErrorContext, fieldsToRedact)
        } else {
            redacted[key] = value
        }
    }

    return redacted
}

/**
 * Get stack trace from error
 */
function getStackTrace(error?: unknown): string | undefined {
    if (error instanceof Error) {
        return error.stack
    }
    return new Error().stack
}

// ============================================================================
// Deduplication System
// ============================================================================

class ErrorDeduplicator {
    private seen = new Map<string, number>()
    private readonly windowMs: number

    constructor(windowMs: number) {
        this.windowMs = windowMs
    }

    /**
     * Generate a deduplication key for an error
     */
    private getDedupKey(entry: ErrorLogEntry): string {
        return `${entry.code}:${entry.message}:${entry.source}`
    }

    /**
     * Check if this error has been seen recently
     */
    isDuplicate(entry: ErrorLogEntry): boolean {
        const key = this.getDedupKey(entry)
        const lastSeen = this.seen.get(key)
        const now = Date.now()

        if (lastSeen && now - lastSeen < this.windowMs) {
            return true
        }

        this.seen.set(key, now)
        this.cleanup()
        return false
    }

    /**
     * Clean up old entries
     */
    private cleanup(): void {
        const now = Date.now()
        for (const [key, timestamp] of this.seen.entries()) {
            if (now - timestamp > this.windowMs) {
                this.seen.delete(key)
            }
        }
    }
}

// ============================================================================
// Rate Limiter
// ============================================================================

class ErrorRateLimiter {
    private counts = new Map<ErrorSeverity, { count: number; windowStart: number }>()
    private readonly limits: Record<ErrorSeverity, { max: number; windowMs: number }> = {
        debug: { max: 1000, windowMs: 60000 },
        info: { max: 500, windowMs: 60000 },
        warning: { max: 100, windowMs: 60000 },
        error: { max: 50, windowMs: 60000 },
        critical: { max: 1000, windowMs: 60000 }, // Don't limit critical
    }

    /**
     * Check if logging should be allowed for this severity
     */
    allow(severity: ErrorSeverity): boolean {
        if (severity === 'critical') return true

        const now = Date.now()
        const current = this.counts.get(severity)

        if (!current || now - current.windowStart > this.limits[severity].windowMs) {
            this.counts.set(severity, { count: 1, windowStart: now })
            return true
        }

        if (current.count >= this.limits[severity].max) {
            return false
        }

        current.count++
        return true
    }
}

// ============================================================================
// Console Output Handler
// ============================================================================

class ConsoleHandler {
    private severityColors: Record<ErrorSeverity, string> = {
        debug: '\x1b[90m',    // Gray
        info: '\x1b[36m',     // Cyan
        warning: '\x1b[33m',  // Yellow
        error: '\x1b[31m',    // Red
        critical: '\x1b[35m', // Magenta
    }

    private resetColor = '\x1b[0m'

    handle(entry: ErrorLogEntry): void {
        const color = this.severityColors[entry.severity]
        const reset = this.resetColor

        const lines = [
            `${color}[${entry.severity.toUpperCase()}] ${entry.code}${reset}`,
            `  Message: ${entry.message}`,
            `  Source: ${entry.source}`,
            `  ID: ${entry.id}`,
            `  Time: ${entry.timestamp}`,
        ]

        if (entry.correlationId) {
            lines.push(`  Correlation: ${entry.correlationId}`)
        }

        if (entry.userId) {
            lines.push(`  User: ${entry.userId}`)
        }

        if (entry.url) {
            lines.push(`  URL: ${entry.url}`)
        }

        if (entry.context && Object.keys(entry.context).length > 0) {
            lines.push(`  Context: ${JSON.stringify(entry.context, null, 2)}`)
        }

        if (entry.cause) {
            lines.push(`  Cause: ${JSON.stringify(safeSerialize(entry.cause), null, 2)}`)
        }

        if (entry.stack) {
            lines.push(`  Stack: ${entry.stack}`)
        }

        const output = lines.join('\n')

        switch (entry.severity) {
            case 'debug':
                console.debug(output)
                break
            case 'info':
                console.info(output)
                break
            case 'warning':
                console.warn(output)
                break
            case 'error':
            case 'critical':
                console.error(output)
                break
        }
    }
}

// ============================================================================
// Remote Handler (for external logging services)
// ============================================================================

class RemoteHandler {
    private endpoint: string
    private queue: ErrorLogEntry[] = []
    private flushInterval: NodeJS.Timeout | null = null
    private readonly batchSize = 10
    private readonly flushDelayMs = 5000

    constructor(endpoint: string) {
        this.endpoint = endpoint
        this.startFlushInterval()
    }

    handle(entry: ErrorLogEntry): void {
        this.queue.push(entry)

        if (this.queue.length >= this.batchSize) {
            this.flush()
        }
    }

    private startFlushInterval(): void {
        if (typeof window !== 'undefined') return // Only run on server

        this.flushInterval = setInterval(() => {
            this.flush()
        }, this.flushDelayMs)
    }

    private async flush(): Promise<void> {
        if (this.queue.length === 0) return
        if (typeof window !== 'undefined') return // Only run on server

        const batch = this.queue.splice(0, this.batchSize)

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ errors: batch }),
            })

            if (!response.ok) {
                // Put entries back in queue for retry
                this.queue.unshift(...batch)
            }
        } catch {
            // Put entries back in queue for retry
            this.queue.unshift(...batch)
        }
    }

    destroy(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval)
        }
        this.flush()
    }
}

// ============================================================================
// Main Error Logger Class
// ============================================================================

export class ErrorLogger {
    private config: Required<ErrorLoggerConfig>
    private deduplicator: ErrorDeduplicator
    private rateLimiter: ErrorRateLimiter
    private consoleHandler: ConsoleHandler
    private remoteHandler: RemoteHandler | null = null
    private customHandlers: ErrorHandler[] = []
    private correlationId: string | null = null

    constructor(config: ErrorLoggerConfig) {
        this.config = { ...DEFAULT_CONFIG, ...config } as Required<ErrorLoggerConfig>
        this.deduplicator = new ErrorDeduplicator(this.config.dedupWindowMs)
        this.rateLimiter = new ErrorRateLimiter()
        this.consoleHandler = new ConsoleHandler()

        if (this.config.enableRemote && this.config.remoteEndpoint) {
            this.remoteHandler = new RemoteHandler(this.config.remoteEndpoint)
        }
    }

    /**
     * Set correlation ID for tracing related operations
     */
    setCorrelationId(id: string): void {
        this.correlationId = id
    }

    /**
     * Get or create correlation ID
     */
    getCorrelationId(): string {
        if (!this.correlationId) {
            this.correlationId = generateCorrelationId()
        }
        return this.correlationId
    }

    /**
     * Add a custom error handler
     */
    addHandler(handler: ErrorHandler): void {
        this.customHandlers.push(handler)
    }

    /**
     * Remove a custom error handler
     */
    removeHandler(handler: ErrorHandler): void {
        this.customHandlers = this.customHandlers.filter(h => h !== handler)
    }

    /**
     * Main logging method
     */
    log(params: {
        code: string
        message: string
        severity?: ErrorSeverity
        context?: ErrorContext
        cause?: unknown
    }): ErrorLogEntry {
        const severity = params.severity || 'error'

        // Check minimum severity
        if (SEVERITY_WEIGHTS[severity] < SEVERITY_WEIGHTS[this.config.minSeverity]) {
            return this.createEntry(params, severity)
        }

        // Check rate limiting
        if (!this.rateLimiter.allow(severity)) {
            return this.createEntry(params, severity)
        }

        const entry = this.createEntry(params, severity)

        // Check deduplication
        if (this.config.enableDedup && this.deduplicator.isDuplicate(entry)) {
            return entry
        }

        // Process handlers
        this.processEntry(entry)

        return entry
    }

    /**
     * Create an error log entry
     */
    private createEntry(
        params: {
            code: string
            message: string
            severity?: ErrorSeverity
            context?: ErrorContext
            cause?: unknown
        },
        severity: ErrorSeverity
    ): ErrorLogEntry {
        let context = params.context ? { ...params.context } : undefined

        // Redact sensitive fields
        if (context) {
            context = redactSensitiveFields(context, this.config.redactFields)
        }

        return {
            id: generateErrorId(),
            timestamp: getTimestamp(),
            severity,
            code: params.code,
            message: params.message,
            source: this.config.source,
            context,
            cause: params.cause ? safeSerialize(params.cause, this.config.maxContextDepth) : undefined,
            stack: getStackTrace(params.cause),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            url: typeof window !== 'undefined' ? window.location.href : undefined,
            correlationId: this.correlationId || undefined,
        }
    }

    /**
     * Process entry through all handlers
     */
    private processEntry(entry: ErrorLogEntry): void {
        // Console handler
        if (this.config.enableConsole) {
            try {
                this.consoleHandler.handle(entry)
            } catch {
                // Ignore console errors
            }
        }

        // Remote handler
        if (this.remoteHandler) {
            try {
                this.remoteHandler.handle(entry)
            } catch {
                // Ignore remote errors
            }
        }

        // Custom handlers
        for (const handler of this.customHandlers) {
            try {
                handler(entry)
            } catch {
                // Ignore handler errors
            }
        }
    }

    // Convenience methods for different severity levels

    debug(params: Omit<Parameters<typeof this.log>[0], 'severity'>): ErrorLogEntry {
        return this.log({ ...params, severity: 'debug' })
    }

    info(params: Omit<Parameters<typeof this.log>[0], 'severity'>): ErrorLogEntry {
        return this.log({ ...params, severity: 'info' })
    }

    warning(params: Omit<Parameters<typeof this.log>[0], 'severity'>): ErrorLogEntry {
        return this.log({ ...params, severity: 'warning' })
    }

    error(params: Omit<Parameters<typeof this.log>[0], 'severity'>): ErrorLogEntry {
        return this.log({ ...params, severity: 'error' })
    }

    critical(params: Omit<Parameters<typeof this.log>[0], 'severity'>): ErrorLogEntry {
        return this.log({ ...params, severity: 'critical' })
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        if (this.remoteHandler) {
            this.remoteHandler.destroy()
        }
    }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createErrorLogger(source: string, config?: Partial<ErrorLoggerConfig>): ErrorLogger {
    return new ErrorLogger({ source, ...config })
}

// ============================================================================
// Global Error Handlers
// ============================================================================

let globalLogger: ErrorLogger | null = null

/**
 * Get or create the global error logger
 */
export function getGlobalLogger(): ErrorLogger {
    if (!globalLogger) {
        globalLogger = createErrorLogger('Global')
    }
    return globalLogger
}

/**
 * Set the global error logger
 */
export function setGlobalLogger(logger: ErrorLogger): void {
    globalLogger = logger
}

/**
 * Log to the global logger
 */
export function logError(params: Parameters<ErrorLogger['log']>[0]): ErrorLogEntry {
    return getGlobalLogger().log(params)
}

// ============================================================================
// React/Next.js Specific Helpers
// ============================================================================

export interface NextJSErrorContext {
    req?: {
        url?: string
        headers?: Record<string, string>
    }
    res?: {
        statusCode?: number
    }
}

/**
 * Create error logger for API routes
 */
export function createAPIErrorLogger(
    route: string,
    context?: NextJSErrorContext
): ErrorLogger {
    const logger = createErrorLogger(`API:${route}`)

    if (context?.req) {
        logger.addHandler((entry: ErrorLogEntry) => {
            entry.url = context.req?.url || entry.url
        })
    }

    return logger
}

/**
 * Higher-order function for API route error handling
 */
export function withErrorLogging<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    route: string
): T {
    const logger = createAPIErrorLogger(route)

    return (async (...args: unknown[]) => {
        try {
            return await fn(...args)
        } catch (error) {
            logger.error({
                code: 'API_UNHANDLED_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
                cause: error,
                context: { args: safeSerialize(args, 2) },
            })
            throw error
        }
    }) as T
}

// ============================================================================
// Error Boundary Helpers
// ============================================================================

export interface ErrorBoundaryLogParams {
    error: Error
    errorInfo?: {
        componentStack?: string
    }
    componentName?: string
}

/**
 * Log error from React Error Boundary
 */
export function logErrorBoundary(params: ErrorBoundaryLogParams): ErrorLogEntry {
    const logger = createErrorLogger(`Component:${params.componentName || 'Unknown'}`)

    return logger.error({
        code: 'REACT_ERROR_BOUNDARY',
        message: params.error.message,
        cause: params.error,
        context: {
            componentName: params.componentName,
            componentStack: params.errorInfo?.componentStack,
        },
    })
}
