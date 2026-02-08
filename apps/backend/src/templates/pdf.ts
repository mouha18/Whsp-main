import PDFDocument from 'pdfkit'
import type { ExportData } from './markdown'

export function generatePdf(data: ExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks: Buffer[] = []

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Title
    doc.fontSize(24).font('Helvetica-Bold').text('Whisper Export', { align: 'center' })
    doc.moveDown(0.5)

    // Separator line
    doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke()
    doc.moveDown()

    // Metadata Section
    doc.fontSize(16).font('Helvetica-Bold').text('Metadata')
    doc.moveDown(0.5)
    doc.fontSize(11).font('Helvetica')

    const metadata = [
      `Recording ID: ${data.recordingId}`,
      `Mode: ${data.mode}`,
      `Created: ${data.createdAt}`,
      `Language: ${data.language}`,
      `Confidence: ${(data.transcript.confidenceScore * 100).toFixed(1)}%`,
    ]

    for (const meta of metadata) {
      doc.text(meta)
    }
    doc.moveDown()

    // Separator line
    doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke()
    doc.moveDown()

    // Summary Section (if available)
    if (data.summary && data.summary.text) {
      doc.fontSize(16).font('Helvetica-Bold').text('Summary')
      doc.moveDown(0.5)
      doc.fontSize(11).font('Helvetica')
      
      // Wrap long text - PDFKit handles wrapping automatically
      const summaryText = data.summary.text
      doc.text(summaryText, { align: 'justify', width: 495 })
      doc.moveDown()
      
      // Separator line
      doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke()
      doc.moveDown()
    }

    // Transcript Section
    doc.fontSize(16).font('Helvetica-Bold').text('Transcript')
    doc.moveDown(0.5)

    // Clean transcript
    doc.fontSize(12).font('Helvetica-Bold').text('Cleaned Transcript')
    doc.moveDown(0.3)
    doc.fontSize(10).font('Helvetica')
    
    const cleanText = data.transcript.cleanText || 'No transcript available'
    doc.text(cleanText, { align: 'justify' })
    doc.moveDown()

    // Raw transcript
    doc.fontSize(12).font('Helvetica-Bold').text('Raw Transcript')
    doc.moveDown(0.3)
    doc.fontSize(10).font('Helvetica')
    
    const rawText = data.transcript.rawText || 'No raw transcript available'
    doc.text(rawText, { align: 'justify' })
    doc.moveDown()

    // Footer
    doc.moveDown(2)
    doc.fontSize(8).font('Helvetica').fillColor('#666666')
    doc.text(`Exported from Whsp on ${new Date().toISOString()}`, { align: 'center' })

    doc.end()
  })
}
