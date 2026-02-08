/**
 * Markdown Export Template
 */

export interface ExportData {
  recordingId: string
  mode: string
  createdAt: string
  language: string
  transcript: {
    rawText: string
    cleanText: string
    confidenceScore: number
    segments: Array<{ start: number; end: number; text: string }>
  }
  summary?: {
    text: string
    mode: string
    tokens: number
    confidence: number
  }
}

export function generateMarkdown(data: ExportData): string {
  const lines: string[] = []

  // Header
  lines.push('# Whisper Export')
  lines.push('')
  lines.push('---')
  lines.push('')

  // Metadata
  lines.push('## Metadata')
  lines.push('')
  lines.push(`- **Recording ID**: ${data.recordingId}`)
  lines.push(`- **Mode**: ${data.mode}`)
  lines.push(`- **Created**: ${data.createdAt}`)
  lines.push(`- **Language**: ${data.language}`)
  lines.push(`- **Confidence**: ${(data.transcript.confidenceScore * 100).toFixed(1)}%`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Summary (if available)
  if (data.summary && data.summary.text) {
    lines.push('## Summary')
    lines.push('')
    lines.push(data.summary.text)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // Clean Transcript
  lines.push('## Transcript')
  lines.push('')
  lines.push(data.transcript.cleanText || 'No transcript available')
  lines.push('')
  lines.push('---')
  lines.push('')

  // Raw Transcript (collapsed by default in many viewers)
  lines.push('## Raw Transcript')
  lines.push('')
  lines.push(data.transcript.rawText || 'No raw transcript available')
  lines.push('')

  // Footer
  lines.push('---')
  lines.push(`*Exported from Whsp on ${new Date().toISOString()}*`)

  return lines.join('\n')
}
