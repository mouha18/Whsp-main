import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import type { ExportData } from './markdown'

export async function generateDocx(data: ExportData): Promise<Buffer> {
  const paragraphs: Paragraph[] = []

  // Title
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Whisper Export',
          bold: true,
          size: 32,
        }),
      ],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    })
  )

  // Separator
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: '—'.repeat(30), color: '666666' })],
      alignment: AlignmentType.CENTER,
    })
  )

  // Metadata Section
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Metadata', bold: true, size: 28 })],
      heading: HeadingLevel.HEADING_1,
    })
  )

  const metadata = [
    `Recording ID: ${data.recordingId}`,
    `Mode: ${data.mode}`,
    `Created: ${data.createdAt}`,
    `Language: ${data.language}`,
    `Confidence: ${(data.transcript.confidenceScore * 100).toFixed(1)}%`,
  ]

  for (const meta of metadata) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: meta, size: 24 })],
      })
    )
  }

  // Summary Section (if available)
  if (data.summary && data.summary.text) {
    paragraphs.push(
      new Paragraph({ children: [] }) // Empty line
    )
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: 'Summary', bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
      })
    )
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: data.summary.text, size: 24 })],
      })
    )
  }

  // Transcript Section
  paragraphs.push(
    new Paragraph({ children: [] }) // Empty line
  )
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Transcript', bold: true, size: 28 })],
      heading: HeadingLevel.HEADING_1,
    })
  )

  // Clean transcript
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Cleaned Transcript', bold: true, size: 24 })],
    })
  )
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: data.transcript.cleanText || 'No transcript available', size: 22 })],
    })
  )

  // Raw transcript
  paragraphs.push(
    new Paragraph({ children: [] }) // Empty line
  )
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: 'Raw Transcript', bold: true, size: 24 })],
    })
  )
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: data.transcript.rawText || 'No raw transcript available', size: 22 })],
    })
  )

  // Footer
  paragraphs.push(
    new Paragraph({ children: [] }) // Empty line
  )
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Exported from Whsp on ${new Date().toISOString()}`,
          size: 18,
          color: '666666',
        }),
      ],
    })
  )

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}
