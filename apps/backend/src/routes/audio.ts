import express from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import * as storage from '../storage/local'
import * as database from '../services/database'

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
    const { mode, duration } = req.body
    const audio = req.file

    if (!audio || !mode) {
      return res.status(400).json({
        error: 'Missing audio file or mode'
      })
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

    // Trigger async processing (in Phase 3, this will call the AI service)
    // For now, simulate async processing
    processAudioAsync(recordingId).catch(console.error)

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

// GET /api/audio/:id/results - Get processing results
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
      // In Phase 3, we would fetch actual transcript/summary from database
      // For now, return simulated results
      res.json({
        status: 'completed',
        transcript: {
          rawText: "This is a simulated transcription. In Phase 3, the AI service will provide real transcription.",
          cleanText: "This is a simulated transcription. In Phase 3, the AI service will provide real transcription.",
          confidenceScore: 0.85,
          processingAttempts: 1
        },
        summary: {
          title: "Simulated Audio Summary",
          keyPoints: [
            "Audio file uploaded and stored successfully",
            "File saved to local storage",
            "Metadata persisted to database"
          ],
          actionItems: [],
          shortSummary: "The audio has been uploaded and is ready for AI processing. In Phase 3, you will receive actual transcription and summary results."
        }
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
      recordings: recordings.map(r => ({
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
 * Simulate async audio processing
 * In Phase 3, this will be replaced with actual AI service calls
 */
async function processAudioAsync(recordingId: string): Promise<void> {
  try {
    // Update status to processing
    await database.updateRecordingStatus(recordingId, 'processing')
    
    // Simulate processing time (2-5 seconds)
    const processingTime = 2000 + Math.random() * 3000
    await new Promise(resolve => setTimeout(resolve, processingTime))
    
    // Update status to completed
    // In Phase 3, this would be done after actual AI processing
    await database.updateRecordingStatus(recordingId, 'completed')
    
    console.log(`Recording ${recordingId} processing complete`)
    
  } catch (error) {
    console.error(`Processing failed for ${recordingId}:`, error)
    await database.updateRecordingStatus(recordingId, 'failed')
  }
}

export default router
