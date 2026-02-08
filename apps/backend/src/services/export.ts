import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'

const EXPORT_DIR = process.env.EXPORT_DIR || './data/exports'
const EXPORT_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes

interface ExportFile {
  id: string
  recordingId: string
  format: string
  filePath: string
  createdAt: Date
  expiresAt: Date
  downloadCount: number
}

/**
 * Ensure export directory exists
 */
function ensureExportDir(): void {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true })
  }
}

/**
 * Create export directory for a recording
 */
export function getExportPath(recordingId: string): string {
  const recordingDir = path.join(EXPORT_DIR, recordingId)
  ensureExportDir()
  if (!fs.existsSync(recordingDir)) {
    fs.mkdirSync(recordingDir, { recursive: true })
  }
  return recordingDir
}

/**
 * Save export file to disk
 */
export async function saveExport(
  recordingId: string,
  filename: string,
  buffer: Buffer
): Promise<ExportFile> {
  const exportDir = getExportPath(recordingId)
  const filePath = path.join(exportDir, filename)
  const exportId = uuidv4()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + EXPORT_EXPIRY_MS)

  // Write file
  await fs.promises.writeFile(filePath, buffer)

  const exportRecord: ExportFile = {
    id: exportId,
    recordingId,
    format: path.extname(filename).slice(1),
    filePath,
    createdAt: now,
    expiresAt,
    downloadCount: 0,
  }

  return exportRecord
}

/**
 * Read export file (increments download count)
 */
export async function readExport(exportId: string): Promise<Buffer | null> {
  const exportDir = EXPORT_DIR
  
  // Search for file in all recording directories
  if (!fs.existsSync(exportDir)) {
    return null
  }

  const recordings = fs.readdirSync(exportDir)
  
  for (const recording of recordings) {
    const recordingPath = path.join(exportDir, recording)
    if (!fs.statSync(recordingPath).isDirectory()) continue
    
    const files = fs.readdirSync(recordingPath)
    const matchingFile = files.find((f) => f.includes(exportId))
    
    if (matchingFile) {
      const filePath = path.join(recordingPath, matchingFile)
      const buffer = await fs.promises.readFile(filePath)
      return buffer
    }
  }
  
  return null
}

/**
 * Check if export file exists and is valid
 */
export async function getExportInfo(exportId: string): Promise<ExportFile | null> {
  const exportDir = EXPORT_DIR
  
  if (!fs.existsSync(exportDir)) {
    return null
  }

  const recordings = fs.readdirSync(exportDir)
  
  for (const recording of recordings) {
    const recordingPath = path.join(exportDir, recording)
    if (!fs.statSync(recordingPath).isDirectory()) continue
    
    const files = fs.readdirSync(recordingPath)
    const matchingFile = files.find((f) => f.includes(exportId))
    
    if (matchingFile) {
      const filePath = path.join(recordingPath, matchingFile)
      const stats = fs.statSync(filePath)
      
      return {
        id: exportId,
        recordingId: recording,
        format: path.extname(matchingFile).slice(1),
        filePath,
        createdAt: stats.birthtime,
        expiresAt: new Date(stats.birthtime.getTime() + EXPORT_EXPIRY_MS),
        downloadCount: 0,
      }
    }
  }
  
  return null
}

/**
 * Clean up expired export files
 */
export async function cleanupExpiredExports(): Promise<number> {
  const exportDir = EXPORT_DIR
  
  if (!fs.existsSync(exportDir)) {
    return 0
  }

  const now = Date.now()
  const recordings = fs.readdirSync(exportDir)
  let deletedCount = 0
  
  for (const recording of recordings) {
    const recordingPath = path.join(exportDir, recording)
    if (!fs.statSync(recordingPath).isDirectory()) continue
    
    const files = fs.readdirSync(recordingPath)
    
    for (const file of files) {
      const filePath = path.join(recordingPath, file)
      const stats = fs.statSync(filePath)
      
      // Delete files older than expiry period
      if (stats.birthtime.getTime() + EXPORT_EXPIRY_MS < now) {
        await fs.promises.unlink(filePath)
        deletedCount++
      }
    }
    
    // Remove empty directories
    const remainingFiles = fs.readdirSync(recordingPath)
    if (remainingFiles.length === 0) {
      await fs.promises.rmdir(recordingPath)
    }
  }
  
  return deletedCount
}

/**
 * Generate signed URL (simplified - for local deployment, returns relative path)
 * In production, this would generate a signed URL with expiration
 */
export function generateSignedUrl(exportId: string): string {
  return `/api/export/${exportId}`
}

/**
 * Delete a specific export file
 */
export async function deleteExport(recordingId: string, filename: string): Promise<boolean> {
  const filePath = path.join(EXPORT_DIR, recordingId, filename)
  
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath)
    
    // Try to remove directory if empty
    const recordingDir = path.join(EXPORT_DIR, recordingId)
    const remainingFiles = fs.readdirSync(recordingDir)
    if (remainingFiles.length === 0) {
      await fs.promises.rmdir(recordingDir)
    }
    
    return true
  }
  
  return false
}

/**
 * Delete all exports for a recording
 */
export async function deleteAllExportsForRecording(recordingId: string): Promise<number> {
  const recordingDir = path.join(EXPORT_DIR, recordingId)
  
  if (!fs.existsSync(recordingDir)) {
    return 0
  }
  
  const files = fs.readdirSync(recordingDir)
  let deletedCount = 0
  
  for (const file of files) {
    const filePath = path.join(recordingDir, file)
    await fs.promises.unlink(filePath)
    deletedCount++
  }
  
  await fs.promises.rmdir(recordingDir)
  return deletedCount
}
