'use client'

import { useState, useCallback, useEffect } from 'react'
import { Mic, Square, Loader2, AlertCircle, CheckCircle2, Wifi, WifiOff, Pause, Play, Download, FileAudio, Trash2, X, RefreshCw, FileText, Clock, ChevronDown, Copy, File } from 'lucide-react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import type { RecordingMode } from '@shared/types'

// Recording interface
interface Recording {
  id: string
  format: string
  durationSeconds: number
  mode: RecordingMode
  status: 'uploaded' | 'processing' | 'completed' | 'failed'
  createdAt: string
}

// Segment interface for timestamped transcription
interface Segment {
  start: number
  end: number
  text: string
}

// Transcription result interface
interface TranscriptionResult {
  rawText: string
  cleanText: string
  confidenceScore: number
  language: string
  processingTime: string
  segments?: Segment[]
}

// Selected recording with results
interface RecordingWithResults extends Recording {
  transcript?: TranscriptionResult
  summary?: {
    text: string
    mode: string
    tokens: number
    confidence: number
  }
  isLoadingResults?: boolean
  resultsError?: string
}

export default function HomePage() {
  const [mode, setMode] = useState<RecordingMode>('lecture')
  const [customPrompt, setCustomPrompt] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [recordings, setRecordings] = useState<RecordingWithResults[]>([])
  const [selectedRecording, setSelectedRecording] = useState<RecordingWithResults | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState<string | null>(null) // format being exported

  // Fetch recordings on mount
  useEffect(() => {
    fetchRecordings()
  }, [])

  // Fetch recordings from API
  const fetchRecordings = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/audio')
      if (response.ok) {
        const data = await response.json()
        setRecordings(data.recordings || [])
      }
    } catch (error) {
      console.error('Failed to fetch recordings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Delete recording
  const deleteRecording = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!confirm('Are you sure you want to delete this recording?')) return
    
    try {
      const response = await fetch(`/api/audio/${id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        setRecordings(prev => prev.filter(r => r.id !== id))
        if (selectedRecording?.id === id) {
          setSelectedRecording(null)
        }
      }
    } catch (error) {
      console.error('Failed to delete recording:', error)
    }
  }

  // Download recording
  const downloadRecording = async (recording: Recording, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      const response = await fetch(`/api/audio/${recording.id}/download`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `recording-${recording.id}.${recording.format}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Failed to download recording:', error)
    }
  }

  const {
    isRecording,
    isPaused,
    isProcessing,
    duration,
    error,
    confidence,
    audioBlob,
    recordingId,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    downloadLocalAudio,
  } = useAudioRecorder({
    onError: (errorMessage: string) => {
      console.error('Recording error:', errorMessage)
    },
    onProcessingComplete: (result: { transcript: string; summary: string; confidence: number }) => {
      console.log('Processing complete:', result)
    },
    onUploadComplete: () => {
      // Refresh recordings list after upload
      fetchRecordings()
    },
    customPrompt: customPrompt,
  })

  // Handle online/offline status
  const handleOnline = useCallback(() => setIsOnline(true), [])
  const handleOffline = useCallback(() => setIsOnline(false), [])

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  }

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }

  const getConfidenceColor = (score: number | null) => {
    if (score === null) return 'text-gray-400'
    if (score >= 0.8) return 'text-green-600'
    if (score >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getConfidenceText = (score: number | null) => {
    if (score === null) return 'Waiting...'
    if (score >= 0.8) return 'High Quality'
    if (score >= 0.6) return 'Medium Quality'
    return 'Low Quality'
  }

  // Fetch transcription results for a recording
  const fetchTranscriptionResults = async (recording: RecordingWithResults) => {
    try {
      setResultsLoading(true)
      // Update the selected recording to show loading
      setSelectedRecording(prev => prev?.id === recording.id ? { ...prev, isLoadingResults: true } : prev)
      
      const response = await fetch(`/api/audio/${recording.id}/results`)
      if (response.ok) {
        const data = await response.json()
        
        if (data.status === 'completed' && data.transcript) {
          setSelectedRecording(prev => 
            prev?.id === recording.id ? { 
              ...prev, 
              status: 'completed',
              transcript: data.transcript,
              summary: data.summary,
              isLoadingResults: false,
              resultsError: undefined
            } : prev
          )
        } else if (data.status === 'processing') {
          // Keep polling for results
          setTimeout(() => fetchTranscriptionResults(recording), 2000)
        } else if (data.status === 'failed') {
          setSelectedRecording(prev => 
            prev?.id === recording.id ? { 
              ...prev, 
              status: 'failed',
              isLoadingResults: false,
              resultsError: 'Processing failed'
            } : prev
          )
        }
      }
    } catch (error) {
      setSelectedRecording(prev => 
        prev?.id === recording.id ? { 
          ...prev, 
          isLoadingResults: false,
          resultsError: 'Failed to fetch results'
        } : prev
      )
    } finally {
      setResultsLoading(false)
    }
  }

  // Handle recording click
  const handleRecordingClick = async (recording: RecordingWithResults) => {
    setSelectedRecording(recording)
    
    // Only fetch results if not already loaded and not failed
    if (recording.status === 'completed' && !recording.transcript) {
      await fetchTranscriptionResults(recording)
    } else if (recording.status === 'processing') {
      // Start polling for results
      fetchTranscriptionResults(recording)
    }
  }

  // Retry transcription
  const retryTranscription = async () => {
    if (!selectedRecording) return
    
    try {
      setSelectedRecording(prev => prev ? { ...prev, isLoadingResults: true, resultsError: undefined } : null)
      
      // Trigger reprocessing by updating the recording
      const response = await fetch(`/api/audio/${selectedRecording.id}`, {
        method: 'GET'
      })
      
      if (response.ok) {
        // Start polling
        fetchTranscriptionResults(selectedRecording)
      }
    } catch (error) {
      setSelectedRecording(prev => prev ? { ...prev, resultsError: 'Retry failed' } : null)
    }
  }

  // Close results panel
  const closeResults = () => {
    setSelectedRecording(null)
  }

  // Export recording to file - uses GET with query params for direct download
  const exportRecording = (format: 'md' | 'docx' | 'pdf') => {
    if (!selectedRecording) return
    
    setExportLoading(format)
    
    // Build URL with query params
    const url = `/api/export?recordingId=${encodeURIComponent(selectedRecording.id)}&format=${encodeURIComponent(format)}`
    
    // Open in new tab/window which triggers download
    window.open(url, '_blank')
    
    // Reset loading after a short delay
    setTimeout(() => {
      setExportLoading(null)
    }, 2000)
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Status Bar */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isOnline ? (
              <Wifi className="w-4 h-4 text-green-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-600" />
            )}
            <span className="text-sm text-gray-600">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="text-sm font-medium text-primary-600">
            Whsp
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2 ">
              Audio Transcription
            </h1>
            <p className="text-gray-600 text-sm">
              Record audio and get AI-powered summaries
            </p>
          </div>

          {/* Custom Prompt Input - visible only when Custom mode is selected */}
          {mode === 'custom' && (
            <div className="card">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Instructions
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g., Extract all names and dates mentioned, Summarize in bullet points, Focus on technical terms..."
                className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                rows={3}
                disabled={isRecording}
              />
              <p className="text-xs text-gray-500 mt-1">
                Describe how you want the summary to be formatted
              </p>
            </div>
          )}

          {/* Mode Selection */}
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Recording Mode
              {isRecording && (
                <span className="ml-2 text-xs text-gray-500">(Locked during recording)</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'lecture', label: 'Lecture', desc: 'Structured notes' },
                { value: 'meeting', label: 'Meeting', desc: 'Action items' },
                { value: 'interview', label: 'Interview', desc: 'Q/A extraction' },
                { value: 'custom', label: 'Custom', desc: 'User-defined' },
              ].map((option) => {
                const isSelected = mode === option.value
                const isLocked = isRecording && !isSelected
                
                return (
                  <button
                    key={option.value}
                    onClick={() => !isRecording && setMode(option.value as RecordingMode)}
                    disabled={isLocked}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      isSelected
                        ? isRecording
                          ? 'border-primary-500 bg-primary-100 text-primary-800 cursor-not-allowed'
                          : 'border-primary-500 bg-primary-50 text-primary-700'
                        : isLocked
                        ? 'border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`font-medium ${isSelected ? 'font-semibold' : ''}`}>
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Recording Controls */}
          <div className="card">
            {/* Status Display */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                {error ? (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                ) : isProcessing ? (
                  <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                ) : isRecording ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-gray-700">Recording</span>
                  </div>
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                )}
                <span className="text-sm font-medium text-gray-700">
                  {error ? 'Error' : isProcessing ? 'Processing' : isRecording ? 'Recording' : 'Ready'}
                </span>
              </div>
              
              {confidence !== null && (
                <div className={`text-sm font-medium ${getConfidenceColor(confidence)}`}>
                  {getConfidenceText(confidence)}
                </div>
              )}
            </div>

            {/* Duration */}
            {duration > 0 && (
              <div className="text-center mb-4">
                <span className="text-2xl font-mono font-bold text-gray-900">
                  {formatDuration(duration)}
                </span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Control Buttons */}
            <div className="flex justify-center gap-3">
              {isRecording ? (
                <>
                  {isPaused ? (
                    <button
                      onClick={resumeRecording}
                      className="btn-primary flex items-center space-x-2"
                      disabled={isProcessing}
                    >
                      <Play className="w-5 h-5" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      onClick={pauseRecording}
                      className="btn-secondary flex items-center space-x-2"
                      disabled={isProcessing}
                    >
                      <Pause className="w-5 h-5" />
                      <span>Pause</span>
                    </button>
                  )}
                  <button
                    onClick={stopRecording}
                    className="btn-danger flex items-center space-x-2"
                    disabled={isProcessing}
                  >
                    <Square className="w-5 h-5" />
                    <span>Stop</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => startRecording(mode, mode === 'custom' ? customPrompt : undefined)}
                  className="btn-primary flex items-center space-x-2"
                  disabled={isProcessing || (mode === 'custom' && !customPrompt.trim())}
                >
                  <Mic className="w-5 h-5" />
                  <span>Start Recording</span>
                </button>
              )}
            </div>

            {/* Processing Indicator */}
            {isProcessing && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">
                  Processing your audio...
                </p>
                <div className="mt-2 flex justify-center">
                  <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                </div>
              </div>
            )}

            {/* Download Audio Button - Phase 1 Exit Criteria */}
            {audioBlob && (
              <div className="mt-4 text-center">
                <button
                  onClick={downloadLocalAudio}
                  className="btn-secondary flex items-center justify-center space-x-2 mx-auto"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Audio</span>
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  Save the clean audio file locally
                </p>
              </div>
            )}
          </div>

          {/* Past Recordings - Phase 2 Exit Criteria */}
          {recordings.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Past Recordings
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recordings.map((recording) => (
                  <div
                    key={recording.id}
                    onClick={() => handleRecordingClick(recording)}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedRecording?.id === recording.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <FileAudio className="w-5 h-5 text-gray-500" />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {recording.id.slice(0, 20)}...
                          </p>
                          <p className="text-xs text-gray-500">
                            {recording.mode} • {formatDuration(recording.durationSeconds * 1000)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          recording.status === 'completed' ? 'bg-green-100 text-green-700' :
                          recording.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                          recording.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {recording.status}
                        </span>
                        <button
                          onClick={(e) => downloadRecording(recording, e)}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="Download"
                        >
                          <Download className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={(e) => deleteRecording(recording.id, e)}
                          className="p-1 hover:bg-red-100 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {isLoading && (
                <div className="text-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto text-gray-400" />
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="text-center text-xs text-gray-500 space-y-1">
            <p>• Tap to start recording</p>
            <p>• Tap stop when finished</p>
            <p>• Processing may take a moment</p>
          </div>
        </div>
      </main>

      {/* Transcription Results Modal */}
      {selectedRecording && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-primary-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">Transcription</h3>
                  <p className="text-xs text-gray-500">
                    {selectedRecording.mode} • {formatDuration(selectedRecording.durationSeconds * 1000)}
                  </p>
                </div>
              </div>
              <button
                onClick={closeResults}
                className="p-2 hover:bg-gray-200 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Status badges */}
              <div className="flex items-center space-x-2 mb-4">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  selectedRecording.status === 'completed' ? 'bg-green-100 text-green-700' :
                  selectedRecording.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                  selectedRecording.status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {selectedRecording.status}
                </span>
                {selectedRecording.status === 'completed' && selectedRecording.transcript && (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    getConfidenceColor(selectedRecording.transcript.confidenceScore)
                  }`}>
                    {(selectedRecording.transcript.confidenceScore * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>

              {/* Loading state */}
              {selectedRecording.isLoadingResults && (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
                  <p className="text-gray-600 mt-2">Loading transcription...</p>
                </div>
              )}

              {/* Error state */}
              {!selectedRecording.isLoadingResults && selectedRecording.resultsError && (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
                  <p className="text-gray-600 mt-2">{selectedRecording.resultsError}</p>
                  <button
                    onClick={retryTranscription}
                    className="mt-4 btn-secondary flex items-center justify-center space-x-2 mx-auto"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Retry</span>
                  </button>
                </div>
              )}

              {/* Processing state */}
              {!selectedRecording.isLoadingResults && 
               !selectedRecording.resultsError && 
               selectedRecording.status === 'processing' && (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-yellow-500" />
                  <p className="text-gray-600 mt-2">Transcription in progress...</p>
                  <p className="text-xs text-gray-400 mt-1">This may take a few minutes</p>
                </div>
              )}

              {/* Uploaded/queued state */}
              {!selectedRecording.isLoadingResults && 
               !selectedRecording.resultsError && 
               selectedRecording.status === 'uploaded' && (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 mx-auto text-gray-400" />
                  <p className="text-gray-600 mt-2">Waiting in queue...</p>
                  <p className="text-xs text-gray-400 mt-1">Transcription will start shortly</p>
                </div>
              )}

              {/* Completed with transcript */}
              {!selectedRecording.isLoadingResults && 
               !selectedRecording.resultsError && 
               selectedRecording.status === 'completed' && 
               selectedRecording.transcript && (
                <div className="space-y-4">
                  {/* Mode-aware Summary */}
                  {selectedRecording.summary && (
                    <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-primary-800 flex items-center space-x-2">
                          <FileText className="w-4 h-4" />
                          <span>AI Summary ({selectedRecording.summary.mode})</span>
                        </h4>
                        <span className="text-xs text-primary-600">
                          {selectedRecording.summary.tokens} tokens
                        </span>
                      </div>
                      <div className="text-sm text-primary-900 whitespace-pre-wrap">
                        {selectedRecording.summary.text}
                      </div>
                    </div>
                  )}

                  {/* Clean transcript */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Clean Transcript</h4>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {selectedRecording.transcript.cleanText || 'No transcript available'}
                    </div>
                  </div>

                  {/* Segments with timestamps (collapsible) */}
                  {selectedRecording.transcript.segments && selectedRecording.transcript.segments.length > 0 && (
                    <details className="group">
                      <summary className="text-sm font-medium text-gray-700 cursor-pointer flex items-center space-x-2">
                        <span>Segments ({selectedRecording.transcript.segments.length})</span>
                        <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="mt-2 bg-gray-50 rounded-lg p-3 text-sm max-h-48 overflow-y-auto space-y-2">
                        {selectedRecording.transcript.segments.map((segment, index) => (
                          <div key={index} className="flex space-x-2">
                            <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                              [{formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}]
                            </span>
                            <span className="text-gray-700">{segment.text}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Raw transcript (collapsible) */}
                  <details className="group">
                    <summary className="text-sm font-medium text-gray-700 cursor-pointer flex items-center space-x-2">
                      <span>Raw Transcript</span>
                      <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="mt-2 bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {selectedRecording.transcript.rawText || 'No raw transcript available'}
                    </div>
                  </details>

                  {/* Processing info */}
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-200">
                    <span>Language: {selectedRecording.transcript.language}</span>
                    <span>Time: {selectedRecording.transcript.processingTime}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {selectedRecording.status === 'completed' && selectedRecording.transcript && (
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 space-y-3">
                {/* Export buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => exportRecording('md')}
                    disabled={exportLoading !== null}
                    className="btn-secondary flex items-center justify-center space-x-1 text-sm"
                  >
                    {exportLoading === 'md' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                    <span>Markdown</span>
                  </button>
                  <button
                    onClick={() => exportRecording('docx')}
                    disabled={exportLoading !== null}
                    className="btn-secondary flex items-center justify-center space-x-1 text-sm"
                  >
                    {exportLoading === 'docx' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <File className="w-4 h-4" />
                    )}
                    <span>DOCX</span>
                  </button>
                  <button
                    onClick={() => exportRecording('pdf')}
                    disabled={exportLoading !== null}
                    className="btn-secondary flex items-center justify-center space-x-1 text-sm"
                  >
                    {exportLoading === 'pdf' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <File className="w-4 h-4" />
                    )}
                    <span>PDF</span>
                  </button>
                </div>
                
                {selectedRecording.summary && (
                  <button
                    onClick={() => {
                      const text = selectedRecording.summary?.text || ''
                      navigator.clipboard.writeText(text)
                      alert('Summary copied to clipboard!')
                    }}
                    className="btn-primary w-full flex items-center justify-center space-x-2"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Copy Summary ({selectedRecording.summary.mode})</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    const text = selectedRecording.transcript?.cleanText || ''
                    navigator.clipboard.writeText(text)
                    alert('Transcript copied to clipboard!')
                  }}
                  className="btn-secondary w-full flex items-center justify-center space-x-2"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy Transcript</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
