import { useState, useRef, useCallback } from 'react'
import type { RecordingMode, ProcessingCompleteResult } from '@shared/types'

// Extended state to include recordingId after upload
export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  isProcessing: boolean
  audioBlob: Blob | null
  recordingId: string | null
  duration: number
  pausedDuration: number
  error: string | null
  confidence: number | null
}

export interface UseAudioRecorderProps {
  onProcessingComplete?: (result: {
    transcript: string
    summary: string
    confidence: number
  }) => void
  onUploadComplete?: (recordingId: string) => void
  onError?: (error: string) => void
}

export const useAudioRecorder = ({
  onProcessingComplete,
  onUploadComplete,
  onError,
}: UseAudioRecorderProps = {}) => {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    isProcessing: false,
    audioBlob: null,
    recordingId: null,
    duration: 0,
    pausedDuration: 0,
    error: null,
    confidence: null,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const startRecording = useCallback(async (mode: RecordingMode = 'lecture') => {
    try {
      setState(prev => ({ ...prev, error: null, isProcessing: false }))

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })

      // Create MediaRecorder with WAV format preference
      const mimeType = MediaRecorder.isTypeSupported('audio/wav') 
        ? 'audio/wav' 
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''

      if (!mimeType) {
        throw new Error('No supported audio format available')
      }

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        setState(prev => ({ 
          ...prev, 
          audioBlob, 
          isRecording: false,
          duration: Date.now() - startTimeRef.current 
        }))

        // Auto-upload after recording
        await uploadAudio(audioBlob, mode)
      }

      mediaRecorderRef.current.start(1000) // Collect data every second
      startTimeRef.current = Date.now()
      setState(prev => ({ ...prev, isRecording: true, duration: 0 }))

      // Start timer for duration display
      timerRef.current = setInterval(() => {
        setState(prev => ({ 
          ...prev, 
          duration: Date.now() - startTimeRef.current 
        }))
      }, 1000)

    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to start recording'
      
      setState(prev => ({ ...prev, error: errorMessage, isRecording: false }))
      onError?.(errorMessage)
    }
  }, [onError])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      mediaRecorderRef.current.pause()
      setState(prev => ({ ...prev, isPaused: true }))
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state.isRecording, state.isPaused])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isPaused) {
      mediaRecorderRef.current.resume()
      setState(prev => ({ ...prev, isPaused: false }))
      
      // Restart timer for duration display
      timerRef.current = setInterval(() => {
        setState(prev => ({ 
          ...prev, 
          duration: Date.now() - startTimeRef.current 
        }))
      }, 1000)
    }
  }, [state.isPaused])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop()
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state.isRecording])

  const uploadAudio = useCallback(async (audioBlob: Blob, mode: RecordingMode) => {
    if (!audioBlob) return

    setState(prev => ({ ...prev, isProcessing: true, error: null }))

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, `recording-${Date.now()}.wav`)
      formData.append('mode', mode)

      const response = await fetch('/api/audio', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`)
      }

      const { recordingId } = await response.json()
      
      // Store recordingId in state
      setState(prev => ({ ...prev, recordingId }))
      
      // Persist to localStorage for persistence across refreshes
      try {
        const existingIds = JSON.parse(localStorage.getItem('recordingIds') || '[]')
        if (!existingIds.includes(recordingId)) {
          localStorage.setItem('recordingIds', JSON.stringify([recordingId, ...existingIds]))
        }
      } catch (e) {
        console.error('Failed to persist recording ID:', e)
      }
      
      // Notify parent component
      onUploadComplete?.(recordingId)
      
      // Poll for results
      await pollForResults(recordingId)

    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Upload failed'
      
      setState(prev => ({ ...prev, error: errorMessage, isProcessing: false }))
      onError?.(errorMessage)
    }
  }, [onError, onUploadComplete])

  const pollForResults = useCallback(async (recordingId: string) => {
    const maxAttempts = 60 // 5 minutes max
    let attempts = 0

    const poll = async () => {
      try {
        attempts++
      const response = await fetch(`/api/audio/${recordingId}/results`)
        
        if (!response.ok) {
          throw new Error(`Failed to get results: ${response.statusText}`)
        }

        const data = await response.json()

        if (data.status === 'completed') {
          setState(prev => ({ 
            ...prev, 
            isProcessing: false,
            confidence: data.transcript?.confidenceScore || null
          }))
          
          onProcessingComplete?.({
            transcript: data.transcript.cleanText || data.transcript.rawText || '',
            summary: data.summary?.shortSummary || '',
            confidence: data.transcript?.confidenceScore || 0
          })
        } else if (data.status === 'failed') {
          setState(prev => ({ 
            ...prev, 
            isProcessing: false,
            error: data.error || 'Processing failed'
          }))
          onError?.(data.error || 'Processing failed')
        } else if (attempts >= maxAttempts) {
          setState(prev => ({ 
            ...prev, 
            isProcessing: false,
            error: 'Processing timed out'
          }))
          onError?.('Processing timed out')
        } else {
          // Continue polling
          setTimeout(poll, 5000) // Check every 5 seconds
        }
      } catch (error) {
        setState(prev => ({ 
          ...prev, 
          isProcessing: false,
          error: error instanceof Error ? error.message : 'Polling failed'
        }))
        onError?.(error instanceof Error ? error.message : 'Polling failed')
      }
    }

    poll()
  }, [onProcessingComplete, onError])

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setState({
      isRecording: false,
      isPaused: false,
      isProcessing: false,
      audioBlob: null,
      recordingId: null,
      duration: 0,
      pausedDuration: 0,
      error: null,
      confidence: null,
    })
  }, [])

  const downloadLocalAudio = useCallback(async () => {
    // Option 1: Download from server using recordingId
    if (state.recordingId) {
      try {
        const response = await fetch(`/api/audio/${state.recordingId}/download`)
        if (!response.ok) {
          throw new Error('Download failed')
        }
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `recording-${state.recordingId}.wav`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } catch (error) {
        console.error('Server download failed:', error)
      }
    }
    
    // Option 2: Download directly from blob (immediate download)
    if (state.audioBlob) {
      const url = window.URL.createObjectURL(state.audioBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recording-${Date.now()}.wav`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    }
  }, [state.recordingId, state.audioBlob])

  return {
    ...state,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset,
    downloadLocalAudio,
  }
}