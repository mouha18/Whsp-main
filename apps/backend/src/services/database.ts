import mysql, { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'

// Database configuration
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'whsp',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0
})

// Define RecordingMode locally to avoid import issues
type RecordingMode = 'lecture' | 'meeting' | 'interview' | 'custom'

/**
 * Recording interface matching database schema
 */
export interface Recording {
  id: string
  user_id?: string
  format: string
  duration_seconds: number
  mode: RecordingMode
  status: 'uploaded' | 'processing' | 'completed' | 'failed'
  file_path: string
  raw_transcript?: string
  clean_transcript?: string
  confidence_score?: number
  language?: string
  processing_time?: string
  segments?: Segment[]
  created_at: Date
  updated_at: Date
}

// Snake case interface for database operations
export interface RecordingInsert {
  id: string
  user_id?: string
  format: string
  duration_seconds: number
  mode: RecordingMode
  file_path: string
}

/**
 * Segment interface for timestamped transcription
 */
export interface Segment {
  start: number
  end: number
  text: string
}

/**
 * Transcription result interface
 */
export interface TranscriptionResult {
  raw_transcript: string
  clean_transcript: string
  confidence: number
  language: string
  processing_time: string
  segments?: Segment[]
}

/**
 * Initialize database tables
 */
export async function initDatabase(): Promise<void> {
  const connection = await pool.getConnection()
  
  try {
    // Create table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS recordings (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        format VARCHAR(50) NOT NULL,
        duration_seconds INT DEFAULT 0,
        mode VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'uploaded',
        file_path VARCHAR(500) NOT NULL,
        raw_transcript TEXT,
        clean_transcript TEXT,
        confidence_score DECIMAL(5,4),
        language VARCHAR(10),
        processing_time VARCHAR(50),
        segments JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    
    // Add missing columns to existing table (migration)
    const columnsToAdd = [
      'raw_transcript TEXT',
      'clean_transcript TEXT',
      'confidence_score DECIMAL(5,4)',
      'language VARCHAR(10)',
      'processing_time VARCHAR(50)',
      'segments JSON'
    ]
    
    for (const column of columnsToAdd) {
      const columnName = column.split(' ')[0]
      try {
        await connection.query(`ALTER TABLE recordings ADD COLUMN ${column}`)
        console.log(`Added column: ${columnName}`)
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`Column already exists: ${columnName}`)
        } else {
          throw e
        }
      }
    }
    
    // Create indexes for faster lookups (ignore if already exists)
    try {
      await connection.query(`CREATE INDEX idx_recordings_user_id ON recordings(user_id)`)
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e
    }
    try {
      await connection.query(`CREATE INDEX idx_recordings_status ON recordings(status)`)
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e
    }
    
    console.log('Database initialized successfully')
  } finally {
    connection.release()
  }
}

/**
 * Create a new recording
 */
export async function createRecording(recording: RecordingInsert): Promise<Recording> {
  const query = `
    INSERT INTO recordings (id, user_id, format, duration_seconds, mode, status, file_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'uploaded', ?, NOW(), NOW())
  `
  
  const values = [
    recording.id,
    recording.user_id || null,
    recording.format,
    recording.duration_seconds,
    recording.mode,
    recording.file_path,
  ]
  
  console.log('Creating recording in database:', recording.id)
  
  const [result] = await pool.query(query, values)
  console.log('Insert result:', result)
  
  // Return the recording data directly (don't rely on getRecording)
  return {
    id: recording.id,
    user_id: recording.user_id,
    format: recording.format,
    duration_seconds: recording.duration_seconds,
    mode: recording.mode,
    status: 'uploaded' as const,
    file_path: recording.file_path,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

/**
 * Get recording by ID
 */
export async function getRecording(id: string): Promise<Recording | null> {
  const query = 'SELECT * FROM recordings WHERE id = ?'
  const [rows] = await pool.query<RowDataPacket[]>(query, [id])
  
  if (rows.length === 0) {
    return null
  }
  
  const row = rows[0]
  if (!row) return null
  
  return mapRowToRecording(row)
}

/**
 * Update recording status
 */
export async function updateRecordingStatus(
  id: string,
  status: 'uploaded' | 'processing' | 'completed' | 'failed'
): Promise<Recording | null> {
  const query = `
    UPDATE recordings 
    SET status = ?, updated_at = NOW()
    WHERE id = ?
  `
  
  await pool.query(query, [status, id])
  return getRecording(id)
}

/**
 * List all recordings for a user
 */
export async function listRecordings(userId?: string): Promise<Recording[]> {
  let query = 'SELECT * FROM recordings ORDER BY created_at DESC'
  const values: string[] = []
  
  if (userId) {
    query = 'SELECT * FROM recordings WHERE user_id = ? ORDER BY created_at DESC'
    values.push(userId)
  }
  
  const [rows] = await pool.query<RowDataPacket[]>(query, values)
  return rows.map(mapRowToRecording)
}

/**
 * Delete recording
 */
export async function deleteRecording(id: string): Promise<boolean> {
  const query = 'DELETE FROM recordings WHERE id = ?'
  const [result] = await pool.query(query, [id])
  return (result as any).affectedRows > 0
}

/**
 * Map database row to Recording interface
 */
function mapRowToRecording(row: RowDataPacket): Recording {
  // Parse segments from JSON
  let segments: Segment[] | undefined
  if (row.segments) {
    try {
      segments = typeof row.segments === 'string' 
        ? JSON.parse(row.segments) 
        : row.segments
    } catch (e) {
      segments = undefined
    }
  }
  
  return {
    id: row.id,
    user_id: row.user_id || undefined,
    format: row.format,
    duration_seconds: row.duration_seconds,
    mode: row.mode,
    status: row.status,
    file_path: row.file_path,
    raw_transcript: row.raw_transcript || undefined,
    clean_transcript: row.clean_transcript || undefined,
    confidence_score: row.confidence_score ? Number(row.confidence_score) : undefined,
    language: row.language || undefined,
    processing_time: row.processing_time || undefined,
    segments: segments,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Save transcription result to database
 */
export async function saveTranscriptionResult(
  id: string,
  result: TranscriptionResult
): Promise<Recording | null> {
  const segmentsJson = result.segments ? JSON.stringify(result.segments) : null
  
  const query = `
    UPDATE recordings 
    SET raw_transcript = ?, clean_transcript = ?, 
        confidence_score = ?, language = ?, 
        processing_time = ?, segments = ?,
        status = 'completed',
        updated_at = NOW()
    WHERE id = ?
  `
  
  await pool.query(query, [
    result.raw_transcript,
    result.clean_transcript,
    result.confidence,
    result.language,
    result.processing_time,
    segmentsJson,
    id
  ])
  
  return getRecording(id)
}

/**
 * Close database pool
 */
export async function closeDatabase(): Promise<void> {
  await pool.end()
}
