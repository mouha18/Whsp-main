// Shared types between frontend and backend

export type RecordingMode = 'lecture' | 'meeting' | 'interview' | 'custom'

export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  isProcessing: boolean
  audioBlob: Blob | null
  duration: number
  pausedDuration: number
  error: string | null
  confidence: number | null
}

export interface Recording {
  id: string
  userId?: string
  format: string
  durationSeconds: number
  mode: RecordingMode
  status: 'uploaded' | 'processing' | 'completed' | 'failed'
  createdAt: string
  audioFile: string
  transcriptId?: string
}

export interface Transcript {
  id: string
  recordingId: string
  rawText: string
  cleanText: string
  confidenceScore: number
  processingAttempts: number
  createdAt: string
}

export interface Summary {
  id: string
  transcriptId: string
  mode: RecordingMode
  title: string
  keyPoints: string[]
  actionItems: string[]
  shortSummary: string
  createdAt: string
}

export interface Export {
  id: string
  recordingId: string
  format: 'pdf' | 'md' | 'docx'
  downloadUrl: string
  expiresAt: string
  createdAt: string
}

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
}

export interface RecordingRequest {
  mode: RecordingMode
  audio: File
}

export interface RecordingResponse {
  recordingId: string
  status: string
}

export interface ResultsResponse {
  status: 'completed' | 'processing' | 'failed'
  transcript?: Transcript
  summary?: Summary
  error?: string
  processingAttempts?: number
  partialResults?: {
    transcript: {
      rawText: string
      cleanText: string
      confidenceScore: number
    }
  }
}

export interface ExportRequest {
  format: 'pdf' | 'md' | 'docx'
}

export interface ExportResponse {
  exportId: string
  downloadUrl: string
  expiresAt: string
  format: 'pdf' | 'md' | 'docx'
}

export interface ProcessingCompleteResult {
  transcript: string
  summary: string
  confidence: number
}

export interface AudioProcessingError {
  stage: 'transcription' | 'cleanup' | 'summarization'
  message: string
  partialResults?: Partial<Transcript>
}