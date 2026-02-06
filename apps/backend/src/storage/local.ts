import fs from 'fs'
import path from 'path'

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'data', 'recordings')

/**
 * Ensure storage directory exists
 */
export function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true })
  }
}

/**
 * Get the storage path for a recording
 */
export function getRecordingPath(recordingId: string): string {
  return path.join(STORAGE_DIR, recordingId)
}

/**
 * Save audio file to storage
 */
export async function saveAudio(recordingId: string, buffer: Buffer, extension: string = 'wav'): Promise<string> {
  ensureStorageDir()
  
  const recordingPath = getRecordingPath(recordingId)
  
  // Create the recording directory if it doesn't exist
  if (!fs.existsSync(recordingPath)) {
    fs.mkdirSync(recordingPath, { recursive: true })
  }
  
  const audioPath = path.join(recordingPath, `audio.${extension}`)
  
  await fs.promises.writeFile(audioPath, buffer)
  
  return audioPath
}

/**
 * Get audio file path
 */
export function getAudioPath(recordingId: string, extension: string = 'wav'): string {
  const recordingPath = getRecordingPath(recordingId)
  return path.join(recordingPath, `audio.${extension}`)
}

/**
 * Check if audio file exists
 */
export function audioExists(recordingId: string, extension: string = 'wav'): boolean {
  const audioPath = getAudioPath(recordingId, extension)
  return fs.existsSync(audioPath)
}

/**
 * Read audio file
 */
export async function readAudio(recordingId: string, extension: string = 'wav'): Promise<Buffer | null> {
  if (!audioExists(recordingId, extension)) {
    return null
  }
  
  const audioPath = getAudioPath(recordingId, extension)
  return fs.promises.readFile(audioPath)
}

/**
 * Delete recording and all associated files
 */
export async function deleteRecording(recordingId: string): Promise<boolean> {
  const recordingPath = getRecordingPath(recordingId)
  
  if (fs.existsSync(recordingPath)) {
    await fs.promises.rm(recordingPath, { recursive: true })
    return true
  }
  
  return false
}

/**
 * List all recordings
 */
export function listRecordings(): string[] {
  ensureStorageDir()
  
  if (!fs.existsSync(STORAGE_DIR)) {
    return []
  }
  
  return fs.readdirSync(STORAGE_DIR)
}
