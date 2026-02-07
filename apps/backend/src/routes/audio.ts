import express from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import * as storage from '../storage/local'
import * as database from '../services/database'

// AI Service Configuration
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001'
const AI_PROCESS_TIMEOUT = 300000 // 5 minutes

// Define RecordingMode locally to avoid import issues
type RecordingMode = 'lecture' | 'meeting' | 'interview' | 'custom'

const router = express.Router()

// Configure multer for audio uploads
const storageEngine = multer.memoryStorage()
const upload = multer({ 
  storage: storageEngine,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files by MIME type
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true)
    }
    // Also accept files by extension (WAV, WEBM, etc.)
    else if (/\.(wav|webm|mp3|mp4|m4a|ogg|flac|aac)$/i.test(file.originalname)) {
      cb(null, true)
    } else {
      cb(new Error('Only audio files are allowed') as any, false)
    }
  }
})

// POST /api/audio - Upload audio file
router.post('/', upload.single('audio'), async (req, res) => {
  try {
    const { mode, duration, custom_prompt } = req.body
    const audio = req.file

    console.log(`[Backend] Received upload request with mode: "${mode}"`)
    if (custom_prompt) {
      console.log(`[Backend] Custom prompt: "${custom_prompt}"`)
    }

    if (!audio) {
      return res.status(400).json({
        error: 'Missing audio file'
      })
    }

    if (!mode) {
      console.warn('[Backend] Mode not provided, defaulting to "lecture"')
      // Default to lecture if mode not provided
    }

    // Validate mode
    const validModes: RecordingMode[] = ['lecture', 'meeting', 'interview', 'custom']
    if (!validModes.includes(mode as RecordingMode)) {
      return res.status(400).json({
        error: 'Invalid mode. Must be one of: lecture, meeting, interview, custom'
      })
    }

    // Generate unique recording ID
    const recordingId = `rec_${Date.now()}_${uuidv4().slice(0, 8)}`
    
    // Determine file extension - prefer original filename extension, fallback to mimetype
    const originalExt = audio.originalname.split('.').pop()?.toLowerCase()
    const mimeExt = audio.mimetype.split('/')[1]?.toLowerCase()
    // Map common mimetype extensions to proper ones
    const extMap: Record<string, string> = {
      'octet-stream': 'wav',
      'plain': 'wav',
    }
    const extension = extMap[mimeExt || ''] || mimeExt || originalExt || 'wav'

    // Save audio to filesystem
    const filePath = await storage.saveAudio(recordingId, audio.buffer, extension)

    // Get duration (from form data or estimate)
    const durationSeconds = parseInt(duration) || Math.ceil(audio.size / 16000) // Rough estimate

    // Save metadata to database
    await database.createRecording({
      id: recordingId,
      format: extension,
      duration_seconds: durationSeconds,
      mode: mode as RecordingMode,
      file_path: filePath,
    })

    // Trigger async processing with custom_prompt for custom mode
    processAudioAsync(recordingId, custom_prompt).catch(console.error)

    res.json({
      recordingId,
      status: 'uploaded',
      message: 'Audio uploaded successfully. Processing has started.'
    })

  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({
      error: 'Failed to upload audio',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

// GET /api/audio/:id - Get recording info
router.get('/:id', async (req, res) => {
  try {
    const { id: recordingId } = req.params

    if (!recordingId) {
      return res.status(400).json({
        error: 'Missing recording ID'
      })
    }

    const recording = await database.getRecording(recordingId)

    if (!recording) {
      return res.status(404).json({
        error: 'Recording not found'
      })
    }

    res.json({
      id: recording.id,
      format: recording.format,
      durationSeconds: recording.duration_seconds,
      mode: recording.mode,
      status: recording.status,
      createdAt: recording.created_at,
    })

  } catch (error) {
    console.error('Get recording error:', error)
    res.status(500).json({
      error: 'Failed to get recording'
    })
  }
})

// GET /api/audio/:id/results - Get processing results (Phase 4 with summary)
router.get('/:id/results', async (req, res) => {
  try {
    const { id: recordingId } = req.params

    if (!recordingId) {
      return res.status(400).json({
        error: 'Missing recording ID'
      })
    }

    const recording = await database.getRecording(recordingId)

    if (!recording) {
      return res.status(404).json({
        error: 'Recording not found'
      })
    }

    // Return based on status
    if (recording.status === 'processing') {
      res.json({
        status: 'processing',
        message: 'Audio is still being processed'
      })
    } else if (recording.status === 'failed') {
      res.json({
        status: 'failed',
        error: 'Processing failed'
      })
    } else if (recording.status === 'completed') {
      // Fetch summary if available - Phase 4
      const summaryResult = await database.getSummary(recordingId)
      
      res.json({
        status: 'completed',
        transcript: {
          rawText: recording.raw_transcript || '',
          cleanText: recording.clean_transcript || '',
          confidenceScore: recording.confidence_score || 0,
          language: recording.language || 'unknown',
          processingTime: recording.processing_time || '0s',
          segments: recording.segments || []
        },
        summary: summaryResult ? {
          text: summaryResult.summary,
          mode: summaryResult.mode,
          tokens: summaryResult.tokens,
          confidence: summaryResult.confidence
        } : undefined
      })
    } else {
      // 'uploaded' status
      res.json({
        status: 'uploaded',
        message: 'Audio is queued for processing'
      })
    }

  } catch (error) {
    console.error('Results error:', error)
    res.status(500).json({
      error: 'Failed to get results'
    })
  }
})

// DELETE /api/audio/:id - Delete recording
router.delete('/:id', async (req, res) => {
  try {
    const { id: recordingId } = req.params

    if (!recordingId) {
      return res.status(400).json({
        error: 'Missing recording ID'
      })
    }

    // Delete from database
    const dbDeleted = await database.deleteRecording(recordingId)
    
    // Delete files from storage
    const filesDeleted = await storage.deleteRecording(recordingId)

    if (!dbDeleted) {
      return res.status(404).json({
        error: 'Recording not found'
      })
    }

    res.json({
      success: true,
      message: 'Recording deleted successfully'
    })

  } catch (error) {
    console.error('Delete error:', error)
    res.status(500).json({
      error: 'Failed to delete recording'
    })
  }
})

// GET /api/audio/:id/download - Download audio file
router.get('/:id/download', async (req, res) => {
  try {
    const { id: recordingId } = req.params

    if (!recordingId) {
      return res.status(400).json({
        error: 'Missing recording ID'
      })
    }

    const recording = await database.getRecording(recordingId)

    if (!recording) {
      return res.status(404).json({
        error: 'Recording not found'
      })
    }

    // Get audio from storage
    const audioBuffer = await storage.readAudio(recordingId, recording.format)

    if (!audioBuffer) {
      return res.status(404).json({
        error: 'Audio file not found'
      })
    }

    // Set headers for file download
    res.setHeader('Content-Type', `audio/${recording.format}`)
    res.setHeader('Content-Disposition', `attachment; filename="recording-${recordingId}.${recording.format}"`)
    
    res.send(audioBuffer)

  } catch (error) {
    console.error('Download error:', error)
    res.status(500).json({
      error: 'Failed to download audio'
    })
  }
})

// GET /api/audio - List all recordings
router.get('/', async (req, res) => {
  try {
    console.log('Fetching recordings from database...')
    const recordings = await database.listRecordings()
    console.log(`Found ${recordings.length} recordings`)
    
    res.json({
      recordings: recordings.map((r: any) => ({
        id: r.id,
        format: r.format,
        durationSeconds: r.duration_seconds,
        mode: r.mode,
        status: r.status,
        createdAt: r.created_at,
      }))
    })

  } catch (error) {
    console.error('List recordings error:', error)
    res.status(500).json({
      error: 'Failed to list recordings',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * Process audio using the AI service (Phase 3 + Phase 4 implementation)
 */
async function processAudioAsync(recordingId: string, customPrompt?: string): Promise<void> {
  try {
    // Update status to processing
    await database.updateRecordingStatus(recordingId, 'processing')
    
    // Get recording from database
    const recording = await database.getRecording(recordingId)
    if (!recording) {
      throw new Error('Recording not found')
    }
    
    // Read audio file
    const audioBuffer = await storage.readAudio(recordingId, recording.format)
    if (!audioBuffer) {
      throw new Error('Audio file not found')
    }
    
    console.log(`Processing ${recordingId} with AI service (mode: ${recording.mode})...`)
    
    // Call AI service with mode and custom_prompt - Phase 4
    const result = await callAIService(audioBuffer, recording.format, recording.mode, customPrompt)
    
    // Save transcript and summary to database - Phase 4
    await database.saveTranscriptionResult(recordingId, {
      raw_transcript: result.rawTranscript,
      clean_transcript: result.cleanTranscript,
      confidence: result.confidence,
      language: result.language,
      processing_time: result.processingTime,
      segments: result.segments
    }, result.summary ? {
      summary: result.summary,
      mode: result.summaryMode || recording.mode,
      tokens: result.summaryTokens || 0,
      confidence: result.confidence
    } : undefined)
    
    console.log(`Recording ${recordingId} processing complete`)
    
  } catch (error) {
    console.error(`Processing failed for ${recordingId}:`, error)
    await database.updateRecordingStatus(recordingId, 'failed')
  }
}

/**
 * Call the AI service to process audio with mode-aware summarization
 */
// @ts-ignore - FormData and Blob are available at runtime
async function callAIService(audioBuffer: Buffer, format: string, mode: RecordingMode = 'lecture', customPrompt?: string): Promise<{
  rawTranscript: string
  cleanTranscript: string
  confidence: number
  language: string
  processingTime: string
  segments: Array<{start: number, end: number, text: string}>
  summary?: string
  summaryMode?: string
  summaryTokens?: number
}> {
  const form = new FormData()
  
  // Determine file extension and MIME type
  const ext = format || 'webm'
  const mimeType = format === 'wav' ? 'audio/wav' : 'audio/webm'
  const filename = `audio.${ext}`
  
  // Convert Buffer to Blob (required by FormData)
  // @ts-ignore - Buffer is compatible with BlobPart at runtime
  const audioBlob = new Blob([audioBuffer], { type: mimeType })
  
  form.append('file', audioBlob, filename)
  form.append('model_size', 'base')
  form.append('apply_noise_reduction', 'true')
  form.append('apply_silence_trimming', 'true')
  form.append('mode', mode)
  if (customPrompt) {
    form.append('custom_prompt', customPrompt)
  }
  
  // Use the full pipeline endpoint for mode-aware summarization
  const response = await fetch(`${AI_SERVICE_URL}/process/full`, {
    method: 'POST',
    body: form
    // Note: fetch handles Content-Type automatically with FormData
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AI service error: ${error}`)
  }
  
  const data = await response.json()
  
  return {
    rawTranscript: data.raw_transcript || '',
    cleanTranscript: data.clean_transcript || '',
    confidence: data.transcription_confidence || data.confidence_score || 0,
    language: data.language || 'unknown',
    processingTime: data.processing_time || '0s',
    segments: data.segments || [],
    summary: data.summary,
    summaryMode: data.summary_mode,
    summaryTokens: data.summary_tokens
  }
}

/**
 * Store processing result in database
 */
async function storeProcessingResult(recordingId: string, result: {
  rawTranscript: string
  cleanTranscript: string
  confidence: number
  language: string
  processingTime: string
}): Promise<void> {
  // For now, we'll store the transcript as a JSON string in the file_path field
  // In a production system, you'd want a dedicated results table
  const resultData = JSON.stringify(result)
  
  // Update the recording with transcript data
  // This is a simple approach - ideally you'd have a separate results table
  console.log(`Stored result for ${recordingId}: ${result.cleanTranscript.substring(0, 100)}...`)
}

export default router
