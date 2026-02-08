# System Architecture Overview

## High-Level Architecture
The application is a client–server system with an AI processing pipeline optimized for speech-to-text, cleanup, and summarization. Two deployment versions are supported:

**Local Version:**
Frontend (Web) → Backend API → MySQL → AI Processing Service → Document Export Service

**Deployable Version:**
Frontend (Web) → Backend API → Supabase (Auth + Storage) → AI Processing Service → Document Export Service

## Dual Version Strategy
- **Local Version**: Self-contained with MySQL, no authentication required
- **Deployable Version**: Cloud-ready with Supabase for auth/storage, Google Auth integration

---

## Folder Structure

project-root/
├─ apps/
│  ├─ frontend/
│  │  ├─ app/                     # (or pages/ if using Pages Router)
│  │  │  ├─ record/
│  │  │  ├─ transcripts/
│  │  │  └─ settings/
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ utils/
│  │  ├─ tsconfig.json
│  │  └─ package.json
│  │
│  ├─ backend/
│  │  ├─ src/
│  │  │  ├─ api/
│  │  │  │  ├─ audio/
│  │  │  │  ├─ transcripts/
│  │  │  │  └─ exports/
│  │  │  ├─ services/
│  │  │  ├─ middleware/
│  │  │  ├─ storage/
│  │  │  └─ index.ts
│  │  ├─ tsconfig.json
│  │  └─ package.json
│
├─ apps/
│  └─ ai-service/
│     ├─ src/
│     │  ├─ audio_cleaner.py
│     │  ├─ transcriber.py
│     │  ├─ summarizer.py
│     │  └─ pipeline.py
│     ├─ pyproject.toml (or requirements.txt)
│     └─ README.md
│
├─ packages/
│  └─ shared/
│     ├─ src/
│     │  ├─ types/
│     │  └─ constants/
│     ├─ tsconfig.json
│     └─ package.json
│
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ API_FLOW.md
│  └─ .cursorrules
│
├─ tsconfig.base.json
├─ package.json
└─ README.md


---

## Data Flow Explanation

### 1. Audio Capture
- User grants microphone permission.
- Audio recorded in chunks (WAV/FLAC).
- Chunks streamed or uploaded to backend.

### 2. Audio Preprocessing Pipeline
1. **Convert to mono WAV (16kHz)**
2. **Noise reduction using spectral gating**
3. **Silence trimming via RMS threshold**
4. **Chunk audio into 30–60s segments**
5. **Fallback**: If preprocessing fails, raw audio proceeds to transcription

### 3. Backend Orchestration
- Backend stores raw audio.
- Sends audio to AI service.
- Tracks processing state.

### 4. AI Processing Pipeline
1. **Speech-to-text transcription** (faster-whisper only)
2. **Transcript cleanup** (Qwen 2.5 1.5B):
   - Remove filler words (e.g., "um", "uh")
   - Collapse repeated phrases
   - Prioritize intent preservation over grammatical perfection
3. **Mode-based summarization** (Qwen 2.5 1.5B):
   - Lecture: structured notes with concepts and definitions
   - Meeting: decisions and action items extraction
   - Interview: Q/A extraction and speaker intent
   - Custom: structured options only (tone, format, focus areas)
4. **Confidence scoring** (average token probability, informational only)

### 5. Storage
- Store:
  - Raw transcript (always preserved)
  - Clean transcript
  - Summary
- Metadata: duration, mode, confidence score
- **Storage Strategy**:
  - Local: filesystem storage (`/data/{recording_uuid}/`)
  - Cloud: Supabase Storage buckets
  - Database stores file references only

### 6. Export
- User selects format (.docx / .md / .pdf)
- Backend generates file
- File available for download via signed URLs

---

## Performance Considerations
- Audio chunking for memory efficiency (30–60s segments)
- Sequential processing pipeline (no parallel inference)
- Summarization length capped per mode:
  - Lecture: 400 tokens
  - Meeting: 300 tokens
  - Interview: 350 tokens
  - Custom: 500 tokens
- Async job processing for AI tasks
- Dual database support (MySQL for local, Supabase for deployable)
- Google Auth integration for deployable version
- **Error Recovery**: Each pipeline stage retryable independently, maximum 2 retries per stage
- **Fallback Handling**: Partial results returned with warnings if failure persists

## Model Responsibilities
- **faster-whisper**: Speech-to-text transcription only
- **Qwen 2.5 1.5B**: Transcript cleanup and summarization only
- **Sequential Processing**: No parallel inference, strict order maintained
- **Input/Output Constraints**: Explicitly defined inputs and outputs per model

## Data Model
### Core Entities
- **User**: Authentication and ownership
- **Recording**: Audio metadata and processing status
- **Transcript**: Raw and cleaned text with confidence scores
- **Summary**: Generated AI summary with mode
- **Export**: Generated documents and download references

### Recording Status States
- **uploaded**: Audio file received, processing will start
- **processing**: AI pipeline active
- **completed**: All processing stages successful
- **failed**: Processing failed after retries

### Constraints
- Raw and cleaned transcripts are always preserved
- Exports are regenerated on demand
- No AI training on user data
- Audio encrypted at rest using AES-256
- **Database**: MySQL for local version with optimized schema design





