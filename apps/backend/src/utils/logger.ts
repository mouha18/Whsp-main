/**
 * Structured logging utility for Phase 7
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
}

class Logger {
  private level: LogLevel

  constructor() {
    // Set log level from environment (default: info)
    this.level = (process.env.LOG_LEVEL as LogLevel) || 'info'
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    }
    return levels[level] >= levels[this.level]
  }

  private formatLog(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    }
    return JSON.stringify(entry)
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatLog('debug', message, context))
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(this.formatLog('info', message, context))
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatLog('warn', message, context))
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatLog('error', message, context))
    }
  }

  /**
   * Log an API request
   */
  logRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    this.info('API Request', {
      method,
      path,
      statusCode,
      durationMs
    })
  }

  /**
   * Log an audio processing event
   */
  logAudioProcessing(recordingId: string, event: string, details?: Record<string, unknown>): void {
    this.info(`Audio Processing: ${event}`, {
      recordingId,
      ...details
    })
  }

  /**
   * Log an export event
   */
  logExport(recordingId: string, format: string, success: boolean): void {
    this.info('Export', {
      recordingId,
      format,
      success
    })
  }
}

// Export singleton instance
export const logger = new Logger()

// Export class for testing
export { Logger }
