# Whsp - Audio Transcription & Summarization App

A complete, production-ready audio transcription and summarization application. Record audio, get AI-powered transcriptions with mode-aware summaries, and export to multiple formats.

## 🎯 Features

- **Audio Recording** - Record audio directly in the browser with real-time status indicators
- **AI Transcription** - Speech-to-text using faster-whisper (local C++ implementation)
- **Mode-Aware Summarization** - Four modes: Lecture, Meeting, Interview, Custom
- **Export Options** - Export to Markdown, DOCX, or PDF formats
- **Security** - AES-256 encryption for stored audio
- **Dual Deployment** - Local (MySQL) or Cloud (Supabase) versions

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│                  apps/frontend (Port 3000)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Express.js)                    │
│                   apps/backend (Port 3001)                   │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│   │  /api/audio │  │ /api/export │  │  MySQL Database    │  │
│   └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI Service (FastAPI)                      │
│                apps/ai-service (Port 8001)                   │
│   ┌────────────────┐  ┌──────────────────────────────────┐  │
│   │ faster-whisper  │  │ Qwen 2.5 1.5B (Summarization)    │  │
│   │ (Transcription) │  │                                  │  │
│   └────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
whsp-main/
├── apps/
│   ├── frontend/          # Next.js web application
│   ├── backend/          # Express.js API server
│   └── ai-service/       # FastAPI AI processing service
├── packages/
│   └── shared/           # Shared types and constants
├── docs/                 # Documentation
│   ├── Architecture.md
│   ├── API_Flow.md
│   ├── Roadmap.md
│   └── Architecture_Validation.md
└── package.json          # Workspace root
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- MySQL (for local deployment)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/mouha18/Whsp-main.git
cd Whsp-main
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
# Backend
cp apps/backend/.env.example apps/backend/.env
# Edit .env with your database credentials

# AI Service
# No extra config needed for local AI service
```

4. Initialize database:
```bash
# Create MySQL database and run migrations
mysql -u root -p < apps/backend/schema.sql
```

5. Start services:

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - Backend:**
```bash
cd apps/backend
npm run dev
```

**Terminal 3 - AI Service:**
```bash
cd apps/ai-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

6. Open http://localhost:3000

## 📖 Documentation

- [Architecture](docs/Architecture.md) - System design overview
- [API Flow](docs/API_Flow.md) - API specifications
- [Roadmap](docs/Roadmap.md) - Project phases
- [Architecture Validation](docs/Architecture_Validation.md) - Team sign-off

## 🎛️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | MySQL host | localhost |
| `DB_USER` | MySQL user | root |
| `DB_PASSWORD` | MySQL password | - |
| `DB_NAME` | Database name | whsp |
| `PORT` | Backend port | 3001 |
| `AI_SERVICE_URL` | AI service URL | http://localhost:8001 |
| `DELETE_AUDIO_AFTER_EXPORT` | Auto-delete audio after export | false |
| `AUDIO_ENCRYPTION_KEY` | AES-256 encryption key | - |

## 📝 API Endpoints

### Audio
- `POST /api/audio` - Upload audio file
- `GET /api/audio/:id` - Get recording info
- `GET /api/audio/:id/results` - Get transcription results
- `DELETE /api/audio/:id` - Delete recording
- `GET /api/audio/:id/download` - Download audio file

### Export
- `GET /api/export?recordingId=xxx&format=md|docx|pdf` - Download export
- `POST /api/export` - Create export

## 🔒 Security

- AES-256-GCM encryption for stored audio
- Structured JSON logging
- Input sanitization
- JWT validation (Supabase version)

## 📄 License

MIT License - see LICENSE file for details.
