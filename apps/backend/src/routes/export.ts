import express from 'express'
import * as database from '../services/database.js'
import * as exportService from '../services/export.js'
import * as templates from '../templates/markdown.js'
import { generateDocx } from '../templates/docx.js'
import { generatePdf } from '../templates/pdf.js'

const router = express.Router()

type ExportFormat = 'md' | 'docx' | 'pdf'

/**
 * GET /api/export - Download export directly (simplest approach)
 * Query: ?recordingId=xxx&format=md|docx|pdf
 */
router.get('/', async (req, res) => {
  try {
    const { recordingId, format } = req.query

    if (!recordingId || typeof recordingId !== 'string') {
      return res.status(400).json({ error: 'Missing recording ID' })
    }

    if (!format || typeof format !== 'string' || !['md', 'docx', 'pdf'].includes(format)) {
      return res.status(400).json({
        error: 'Invalid format. Must be one of: md, docx, pdf'
      })
    }

    // Get recording from database
    const recording = await database.getRecording(recordingId)
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    // Check if processing is complete
    if (recording.status !== 'completed') {
      return res.status(400).json({
        error: 'Recording is still processing or failed',
        status: recording.status
      })
    }

    // Get summary if available
    const summaryResult = await database.getSummary(recordingId)

    // Prepare export data
    const exportData: templates.ExportData = {
      recordingId: recording.id,
      mode: recording.mode,
      createdAt: recording.created_at?.toISOString() || new Date().toISOString(),
      language: recording.language || 'unknown',
      transcript: {
        rawText: recording.raw_transcript || '',
        cleanText: recording.clean_transcript || '',
        confidenceScore: recording.confidence_score || 0,
        segments: recording.segments || []
      },
      summary: summaryResult ? {
        text: summaryResult.summary,
        mode: summaryResult.mode,
        tokens: summaryResult.tokens,
        confidence: summaryResult.confidence
      } : undefined
    }

    // Generate file based on format
    let buffer: Buffer
    let mimeType: string
    let extension: string

    switch (format) {
      case 'md':
        const markdownContent = templates.generateMarkdown(exportData)
        buffer = Buffer.from(markdownContent, 'utf-8')
        mimeType = 'text/markdown'
        extension = 'md'
        break

      case 'docx':
        buffer = await generateDocx(exportData)
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        extension = 'docx'
        break

      case 'pdf':
        buffer = await generatePdf(exportData)
        mimeType = 'application/pdf'
        extension = 'pdf'
        break

      default:
        return res.status(400).json({ error: 'Invalid format' })
    }

    // Set headers for download
    const timestamp = Date.now()
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition',
      `attachment; filename="whsp-export-${recordingId}-${timestamp}.${extension}"`
    )
    res.setHeader('Content-Length', buffer.length)

    res.send(buffer)

  } catch (error) {
    console.error('Export error:', error)
    res.status(500).json({
      error: 'Failed to create export',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * POST /api/export - Create a new export (returns JSON)
 * Body: { recordingId, format: 'md' | 'docx' | 'pdf' }
 */
router.post('/', async (req, res) => {
  try {
    // Support both JSON and form data
    const recordingId = req.body.recordingId || req.body.recordingId
    const format = req.body.format
    const download = req.query.download === 'true' || req.body.download === 'true'

    if (!recordingId) {
      return res.status(400).json({ error: 'Missing recording ID' })
    }

    if (!format || !['md', 'docx', 'pdf'].includes(format)) {
      return res.status(400).json({
        error: 'Invalid format. Must be one of: md, docx, pdf'
      })
    }

    // Get recording from database
    const recording = await database.getRecording(recordingId)
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    // Check if processing is complete
    if (recording.status !== 'completed') {
      return res.status(400).json({
        error: 'Recording is still processing or failed',
        status: recording.status
      })
    }

    // Get summary if available
    const summaryResult = await database.getSummary(recordingId)

    // Prepare export data
    const exportData: templates.ExportData = {
      recordingId: recording.id,
      mode: recording.mode,
      createdAt: recording.created_at?.toISOString() || new Date().toISOString(),
      language: recording.language || 'unknown',
      transcript: {
        rawText: recording.raw_transcript || '',
        cleanText: recording.clean_transcript || '',
        confidenceScore: recording.confidence_score || 0,
        segments: recording.segments || []
      },
      summary: summaryResult ? {
        text: summaryResult.summary,
        mode: summaryResult.mode,
        tokens: summaryResult.tokens,
        confidence: summaryResult.confidence
      } : undefined
    }

    // Generate file based on format
    let buffer: Buffer
    let mimeType: string
    let extension: string

    switch (format) {
      case 'md':
        const markdownContent = templates.generateMarkdown(exportData)
        buffer = Buffer.from(markdownContent, 'utf-8')
        mimeType = 'text/markdown'
        extension = 'md'
        break

      case 'docx':
        buffer = await generateDocx(exportData)
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        extension = 'docx'
        break

      case 'pdf':
        buffer = await generatePdf(exportData)
        mimeType = 'application/pdf'
        extension = 'pdf'
        break

      default:
        return res.status(400).json({ error: 'Invalid format' })
    }

    // Generate a unique export ID
    const { v4: uuidv4 } = await import('uuid')
    const exportId = uuidv4()
    
    // Save export file
    const filename = `export-${recordingId}-${exportId}.${extension}`
    await exportService.saveExport(recordingId, filename, buffer)

    // If download requested, stream file directly
    if (download) {
      const downloadUrl = `/api/export/${exportId}`
      return res.redirect(302, downloadUrl)
    }

    // Otherwise return JSON
    const signedUrl = exportService.generateSignedUrl(exportId)
    res.json({
      success: true,
      exportId,
      recordingId,
      format,
      downloadUrl: signedUrl,
      mimeType
    })

  } catch (error) {
    console.error('Export error:', error)
    res.status(500).json({
      error: 'Failed to create export',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * GET /api/export/:id - Download an export file
 */
router.get('/:id', async (req, res) => {
  try {
    const { id: exportId } = req.params

    if (!exportId) {
      return res.status(400).json({ error: 'Missing export ID' })
    }

    // Get export info
    const exportInfo = await exportService.getExportInfo(exportId)
    if (!exportInfo) {
      return res.status(404).json({ error: 'Export not found or expired' })
    }

    // Check if expired
    if (new Date() > exportInfo.expiresAt) {
      return res.status(410).json({ error: 'Export has expired' })
    }

    // Read and serve file
    const buffer = await exportService.readExport(exportId)
    if (!buffer) {
      return res.status(404).json({ error: 'Export file not found' })
    }

    // Determine MIME type based on format
    const mimeTypes: Record<string, string> = {
      'md': 'text/markdown',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'pdf': 'application/pdf'
    }

    const mimeType = mimeTypes[exportInfo.format] || 'application/octet-stream'

    // Set headers for download
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition',
      `attachment; filename="whsp-export-${exportId}.${exportInfo.format}"`
    )
    res.setHeader('Content-Length', buffer.length)
    res.setHeader('X-Expires-At', exportInfo.expiresAt.toISOString())

    res.send(buffer)

  } catch (error) {
    console.error('Download export error:', error)
    res.status(500).json({
      error: 'Failed to download export',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * DELETE /api/export/:id - Delete an export
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id: exportId } = req.params

    if (!exportId) {
      return res.status(400).json({ error: 'Missing export ID' })
    }

    // Get export info to find the file
    const exportInfo = await exportService.getExportInfo(exportId)
    if (!exportInfo) {
      return res.status(404).json({ error: 'Export not found' })
    }

    // Delete the file
    const deleted = await exportService.deleteExport(
      exportInfo.recordingId,
      `${exportInfo.id}.${exportInfo.format}`
    )

    if (!deleted) {
      return res.status(404).json({ error: 'Export file not found' })
    }

    res.json({
      success: true,
      message: 'Export deleted successfully'
    })

  } catch (error) {
    console.error('Delete export error:', error)
    res.status(500).json({
      error: 'Failed to delete export',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * POST /api/export/cleanup - Clean up expired exports (admin/utility endpoint)
 */
router.post('/cleanup', async (req, res) => {
  try {
    const deletedCount = await exportService.cleanupExpiredExports()

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} expired export(s)`
    })

  } catch (error) {
    console.error('Cleanup exports error:', error)
    res.status(500).json({
      error: 'Failed to clean up exports',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

export default router
