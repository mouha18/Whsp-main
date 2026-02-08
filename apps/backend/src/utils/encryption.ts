import crypto from 'crypto'

// AES-256-GCM encryption configuration
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 16 bytes for AES
const TAG_LENGTH = 16 // 16 bytes for authentication tag
const KEY_LENGTH = 32 // 32 bytes (256 bits) for AES-256

// Get encryption key from environment (must be 32 bytes / 256 bits)
function getEncryptionKey(): Buffer {
  const key = process.env.AUDIO_ENCRYPTION_KEY
  if (!key) {
    throw new Error('AUDIO_ENCRYPTION_KEY environment variable is required')
  }
  
  // Derive a proper 256-bit key using SHA-256 if the provided key is not exactly 32 bytes
  if (key.length !== KEY_LENGTH) {
    return crypto.createHash('sha256').update(key).digest()
  }
  
  return Buffer.from(key)
}

/**
 * Encrypt a buffer using AES-256-GCM
 * Returns: IV + Tag + Encrypted data (concatenated)
 */
export function encryptAudio(buffer: Buffer): Buffer {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM
  
  const encrypted = Buffer.concat([
    cipher.update(buffer),
    cipher.final()
  ])
  
  const tag = cipher.getAuthTag()
  
  // Concatenate IV + Tag + Encrypted data
  // Format: [IV (16 bytes)][Tag (16 bytes)][Encrypted data]
  return Buffer.concat([iv, tag, encrypted])
}

/**
 * Decrypt a buffer that was encrypted with encryptAudio
 * Expects: IV + Tag + Encrypted data format
 */
export function decryptAudio(encryptedBuffer: Buffer): Buffer {
  const key = getEncryptionKey()
  
  // Extract IV, Tag, and encrypted data
  const iv = encryptedBuffer.subarray(0, IV_LENGTH)
  const tag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = encryptedBuffer.subarray(IV_LENGTH + TAG_LENGTH)
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM
  decipher.setAuthTag(tag)
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])
}

/**
 * Generate a secure random encryption key
 * Useful for initial key generation
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex')
}

/**
 * Check if encryption is enabled
 */
export function isEncryptionEnabled(): boolean {
  return process.env.AUDIO_ENCRYPTION_KEY !== undefined
}
