# API Flow – Audio Transcription & Summarization App

This document defines:
- Exact API responsibilities
- Clear request / response contracts
- The full lifecycle of an audio recording
- AI pipeline boundaries (what runs where)
- Dual deployment support (Local vs Deployable versions)

---

## 1. Core Concepts

### Processing Modes
| Mode       | Output Focus                                  |
|------------|-----------------------------------------------|
| Lecture    | Structured notes, concepts, key definitions   |
| Meeting    | Decisions, action items, participants         |
| Interview  | Q/A extraction, speaker intent                |
| Custom     | User-defined summary instructions             |

---

## 2. Primary Data Objects

### User
Represents authenticated user (deployable version only).

```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "User Name",
  "createdAt": "ISO-8601"
}
```

### Recording
Represents audio recording and processing metadata.

```json
{
  "id": "recording_123",
  "userId": "user_123", // Optional for local version
  "format": "wav",
  "durationSeconds": 1820,
  "mode": "lecture",
  "status": "uploaded | processing | completed | failed",
  "createdAt": "ISO-8601",
  "audioFile": "/data/recording_123/audio.wav",
  "transcriptId": "transcript_123"
}
```

### Transcript
Represents speech-to-text output with cleanup.

```json
{
  "id": "transcript_123",
  "recordingId": "recording_123",
  "rawText": "uh today we will talk about...",
  "cleanText": "Today we will discuss...",
  "confidenceScore": 0.92,
  "processingAttempts": 1,
  "createdAt": "ISO-8601"
}
```

### Summary
Represents the final AI summary.

```json
{
  "id": "summary_123",
  "transcriptId": "transcript_123",
  "mode": "lecture",
  "title": "Introduction to Neural Networks",
  "keyPoints": [
    "Definition of neural networks",
    "Historical background"
  ],
  "actionItems": [],
  "shortSummary": "This lecture introduces neural networks...",
  "createdAt": "ISO-8601"
}
```

### Export
Represents generated documents.

```json
{
  "id": "export_123",
  "recordingId": "recording_123",
  "format": "pdf | md | docx",
  "downloadUrl": "signed-url",
  "expiresAt": "ISO-8601",
  "createdAt": "ISO-8601"
}
```

## 3. API Endpoints (Lifecycle Order)

### Authentication (Deployable Version Only)
POST /api/auth/google
Purpose
- Google OAuth integration for deployable version
- Returns JWT token for subsequent requests
- Supabase-issued JWTs with ownership validation

Request
```json
{
  "code": "oauth_authorization_code"
}
```

Response
```json
{
  "token": "jwt_token",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

### Authentication Middleware
All API endpoints (except auth) require JWT validation:
- Deployable version: Validate Supabase JWT and ownership
- Local version: Bypass authentication entirely
- Ownership checks ensure users can only access their own data

### STEP 1: Upload Audio
POST /api/recordings
Purpose
- Upload microphone recording
- Create a Recording entity

Request
```json
Content-Type: multipart/form-data
{
  "mode": "lecture",
  "audio": "<binary>"
}
```

Response
```json
{
  "recordingId": "recording_123",
  "status": "uploaded"
}
```

### STEP 2: Start AI Processing
POST /api/recordings/{recordingId}/process
Purpose
- Trigger AI pipeline asynchronously

Backend Actions
- Validate recording
- Send audio to AI service
- Update status → processing
- Track processing attempts

Response
```json
{
  "recordingId": "recording_123",
  "status": "processing"
}
```

### STEP 3: AI Pipeline (Internal)
This step is not user-facing.

AI Pipeline Order (STRICT)
1. **Audio Preprocessing**:
   - Convert to mono WAV (16kHz)
   - Noise reduction using spectral gating
   - Silence trimming via RMS threshold
   - Chunk audio into 30–60s segments
   - **Fallback**: If preprocessing fails, raw audio proceeds to transcription
2. **Speech-to-text transcription** (faster-whisper only)
3. **Transcript cleanup** (Qwen 2.5 1.5B):
   - Remove filler words (e.g., "um", "uh")
   - Collapse repeated phrases
   - Prioritize intent preservation over grammatical perfection
4. **Mode-aware summarization** (Qwen 2.5 1.5B):
   - Lecture: structured notes with concepts and definitions
   - Meeting: decisions and action items extraction
   - Interview: Q/A extraction and speaker intent
   - Custom: structured options only (tone, format, focus areas)
5. **Confidence scoring** (average token probability, informational only)

**Error Recovery**: Each pipeline stage retryable independently, maximum 2 retries per stage
**Fallback Handling**: Partial results returned with warnings if failure persists

Output stored in database.

### STEP 4: Fetch Results
GET /api/recordings/{recordingId}/results
Purpose
- Retrieve transcript + summary

Response
```json
{
  "status": "completed",
  "transcript": {
    "rawText": "...",
    "cleanText": "...",
    "confidenceScore": 0.92,
    "processingAttempts": 1
  },
  "summary": {
    "title": "Lecture Summary",
    "keyPoints": [],
    "actionItems": [],
    "shortSummary": "..."
  }
}
```

### STEP 5: Export Document
POST /api/recordings/{recordingId}/export
Purpose
- Generate downloadable document

Request
```json
{
  "format": "pdf | md | docx"
}
```

Backend Actions
- Render content from transcript and summary
- Apply formatting template
- Generate file
- Store in appropriate storage (local filesystem or Supabase)
- Create signed URL for download

Response
```json
{
  "exportId": "export_123",
  "downloadUrl": "signed-url",
  "expiresAt": "ISO-8601",
  "format": "pdf"
}
```

## 4. Error Handling

### Processing Failure
```json
{
  "status": "failed",
  "error": "Transcription failed due to low audio quality",
  "processingAttempts": 2,
  "partialResults": {
    "transcript": {
      "rawText": "...",
      "cleanText": "...",
      "confidenceScore": 0.55
    }
  }
}
```

### Authentication Errors (Deployable Version)
```json
{
  "error": "unauthorized",
  "message": "Invalid or missing authentication token"
}
```

### Database Errors
```json
{
  "error": "database_error",
  "message": "Failed to save recording metadata"
}
```

### Confidence Threshold Warning
```json
{
  "warning": "Low confidence transcript",
  "confidenceScore": 0.55,
  "threshold": 0.75,
  "message": "Transcript quality may be poor due to audio issues"
}
```

### Storage Errors
```json
{
  "error": "storage_error",
  "message": "Failed to save audio file to storage"
}
```

### AI Service Errors
```json
{
  "error": "ai_service_error",
  "stage": "transcription | cleanup | summarization",
  "message": "AI processing failed at transcription stage"
}
```

## 5. AI Constraints (Qwen 2.5 1.5B Optimized)
Audio chunks 30–60s

Summaries capped at:
- Lecture: 400 tokens
- Meeting: 300 tokens
- Interview: 350 tokens
- Custom: 500 tokens

Cleanup uses rules first, LLM second

No hallucination of missing speech

Models:
- Speech-to-Text: faster-whisper (transcription only)
- Cleanup & Summarization: Qwen 2.5 1.5B (cleanup and summarization only)

**Sequential Processing**: No parallel inference, strict order maintained
**Input/Output Constraints**: Explicitly defined inputs and outputs per model

## 6. Security & Privacy

### Local Version
- Audio encrypted at rest using AES-256
- MySQL database with local encryption
- No authentication required
- Auto-delete raw audio after export (configurable)
- No AI training on user data
- Signed URLs only for file downloads
- Filesystem storage: `/data/{recording_uuid}/`

### Deployable Version
- Audio encrypted at rest using AES-256
- Supabase storage with encryption
- Google Auth integration via Supabase
- JWT token-based authentication with ownership validation
- Auto-delete raw audio after export (configurable)
- No AI training on user data
- Signed URLs only for file downloads
- User isolation in database
- Supabase Storage buckets for file management

### Security Measures
- JWT validation per request
- Ownership checks for all user data access
- AES-256 encryption for all stored audio
- No secrets committed to repository
- Environment variable management for local and cloud

## 7. Status State Machine

```
uploaded → processing → completed
                 ↘ failed
```

### Processing States
- **uploaded**: Audio file received, ready for processing
- **processing**: AI pipeline active, may have multiple attempts
- **completed**: All processing stages successful
- **failed**: Processing failed after maximum retries, partial results may exist

### Export States
- **pending**: Export request received, file generation in progress
- **ready**: File generated, signed URL available
- **expired**: Signed URL has expired, new export required