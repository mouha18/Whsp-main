'use client'

import { useState, useCallback } from 'react'
import { Mic, Square, Loader2, AlertCircle, CheckCircle2, Wifi, WifiOff, Pause, Play, Download } from 'lucide-react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import type { RecordingMode } from '@shared/types'

export default function HomePage() {
  const [mode, setMode] = useState<RecordingMode>('lecture')
  const [isOnline, setIsOnline] = useState(navigator.onLine)

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
    }
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2 bg-red-500">
              Audio Transcription
            </h1>
            <p className="text-gray-600 text-sm">
              Record audio and get AI-powered summaries
            </p>
          </div>

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
                  onClick={() => startRecording(mode)}
                  className="btn-primary flex items-center space-x-2"
                  disabled={isProcessing}
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

          {/* Instructions */}
          <div className="text-center text-xs text-gray-500 space-y-1">
            <p>• Tap to start recording</p>
            <p>• Tap stop when finished</p>
            <p>• Processing may take a moment</p>
          </div>
        </div>
      </main>
    </div>
  )
}