/**
 * Input sanitization utilities for database security
 */

/**
 * Sanitize a string to prevent SQL injection
 * Note: This is a supplementary measure - use parameterized queries in the database layer
 */
export function sanitizeString(value: unknown, maxLength: number = 1000): string {
  if (typeof value !== 'string') {
    return ''
  }
  
  // Remove null bytes and trim whitespace
  let sanitized = value.replace(/\0/g, '').trim()
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }
  
  return sanitized
}

/**
 * Sanitize recording ID (UUID format)
 */
export function sanitizeRecordingId(id: unknown): string | null {
  if (typeof id !== 'string') {
    return null
  }
  
  // Recording IDs follow the pattern: rec_TIMESTAMP_UUID
  const sanitized = sanitizeString(id, 100)
  
  // Validate format
  if (!/^rec_\d+_[a-f0-9]{8}$/i.test(sanitized)) {
    return null
  }
  
  return sanitized
}

/**
 * Sanitize mode parameter
 */
export function sanitizeMode(mode: unknown): 'lecture' | 'meeting' | 'interview' | 'custom' | null {
  if (typeof mode !== 'string') {
    return null
  }
  
  const sanitized = sanitizeString(mode, 20).toLowerCase()
  
  const validModes = ['lecture', 'meeting', 'interview', 'custom']
  return validModes.includes(sanitized) ? (sanitized as 'lecture' | 'meeting' | 'interview' | 'custom') : null
}

/**
 * Sanitize export format
 */
export function sanitizeExportFormat(format: unknown): 'md' | 'docx' | 'pdf' | null {
  if (typeof format !== 'string') {
    return null
  }
  
  const sanitized = sanitizeString(format, 10).toLowerCase()
  
  const validFormats = ['md', 'docx', 'pdf']
  return validFormats.includes(sanitized) ? (sanitized as 'md' | 'docx' | 'pdf') : null
}

/**
 * Sanitize custom prompt (for custom mode)
 */
export function sanitizeCustomPrompt(prompt: unknown, maxLength: number = 2000): string {
  if (typeof prompt !== 'string') {
    return ''
  }
  
  let sanitized = prompt.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  
  // Remove potential prompt injection patterns
  sanitized = sanitized.replace(
  /(\b(system|prompt|ignore|override)\b[=:])/gi,
  '[REDACTED]'
);

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }
  
  return sanitized.trim()
}

/**
 * Validate file extension
 */
export function sanitizeFileExtension(filename: unknown): string | null {
  if (typeof filename !== 'string') {
    return null
  }
  
  const sanitized = sanitizeString(filename, 50)
  
  // Only allow audio file extensions
  const validExtensions = ['wav', 'webm', 'mp3', 'mp4', 'm4a', 'ogg', 'flac', 'aac']
  const ext = sanitized.split('.').pop()?.toLowerCase()
  
  if (!ext || !validExtensions.includes(ext)) {
    return null
  }
  
  return ext
}

/**
 * Sanitize numeric value
 */
export function sanitizeNumeric(value: unknown, min = 0, max: number = Number.MAX_SAFE_INTEGER): number | null {
  const num = parseInt(typeof value === 'string' ? value : String(value), 10)
  
  if (isNaN(num) || !isFinite(num)) {
    return null
  }
  
  return Math.max(min, Math.min(num, max))
}
