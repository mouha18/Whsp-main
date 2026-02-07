"""
AI Processing Service - FastAPI Application
Provides speech-to-text transcription using faster-whisper.
"""
import os
import sys
import time
import tempfile
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import numpy as np

# Add src to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.audio_utils import preprocess_audio
from src.processor import get_processor, TranscriptProcessor
from src.summarizer import summarize_transcript, RecordingMode, get_summarizer


# Initialize FastAPI app
app = FastAPI(
    title="Whsp AI Processing Service",
    description="Speech-to-text transcription using faster-whisper",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class ProcessRequest(BaseModel):
    language: Optional[str] = None
    model_size: str = "base"
    apply_noise_reduction: bool = True
    apply_silence_trimming: bool = True


class TranscriptionResponse(BaseModel):
    raw_transcript: str
    clean_transcript: str
    confidence_score: float
    language: str
    processing_time: str
    segments: Optional[list] = None


class SummarizeRequest(BaseModel):
    """Request for standalone summarization."""
    transcript: str
    mode: str = "lecture"
    custom_prompt: Optional[str] = None


class FullProcessRequest(BaseModel):
    """Request for full pipeline (transcribe + summarize)."""
    language: Optional[str] = None
    model_size: str = "base"
    apply_noise_reduction: bool = True
    apply_silence_trimming: bool = True
    mode: str = "lecture"
    custom_prompt: Optional[str] = None


class SummarizationResponse(BaseModel):
    """Response from summarization."""
    summary: str
    mode: str
    tokens_used: int
    confidence: float
    processing_time: str


class FullProcessResponse(BaseModel):
    """Response from full pipeline (transcribe + summarize)."""
    raw_transcript: str
    clean_transcript: str
    summary: Optional[str] = None
    summary_mode: Optional[str] = None
    summary_tokens: Optional[int] = None
    transcription_confidence: float
    language: str
    processing_time: str
    segments: Optional[list] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    summarizer_loaded: bool = False
    model_size: str


# Background tasks storage
processing_tasks = {}


@app.get("/health")
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    """
    processor = get_processor()
    summarizer_loaded = False
    try:
        from src.summarizer import _summarizer
        summarizer_loaded = _summarizer is not None
    except ImportError:
        pass
    
    return HealthResponse(
        status="healthy",
        model_loaded=processor.model is not None,
        summarizer_loaded=summarizer_loaded,
        model_size=processor.model_size
    )


@app.post("/process")
async def process_audio(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    model_size: str = "base",
    apply_noise_reduction: bool = True,
    apply_silence_trimming: bool = True
) -> TranscriptionResponse:
    """
    Process audio file and return transcription.
    
    Args:
        file: Audio file (wav, webm, mp3, etc.)
        language: Optional language hint (e.g., "en", "fr", "es")
        model_size: Whisper model size (tiny, base, small, medium, large)
        apply_noise_reduction: Whether to apply noise reduction
        apply_silence_trimming: Whether to trim silence
    
    Returns:
        TranscriptionResponse with raw and clean transcripts
    """
    start_time = time.time()
    
    # Validate file type
    allowed_types = ["audio/wav", "audio/webm", "audio/mp3", "audio/mpeg", 
                    "audio/mp4", "audio/ogg", "audio/flac", "audio/aac",
                    "audio/x-m4a", "audio/m4a"]
    
    file_type = file.content_type or ""
    filename = file.filename or ""
    if file_type not in allowed_types and not any(
        filename.lower().endswith(ext) for ext in [".wav", ".webm", ".mp3", 
                                                     ".mp4", ".ogg", ".flac", 
                                                     ".m4a", ".aac"]
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {file_type}"
        )
    
    try:
        # Read file data first, then close the file handle
        audio_data = await file.read()
        await file.close()
        
        # Determine format from filename
        format = "webm"  # Default for browser recordings
        filename = file.filename or ""
        if filename:
            ext = filename.split(".")[-1].lower() if "." in filename else ""
            if ext in ["wav", "webm", "mp3", "mp4", "ogg", "flac", "m4a", "aac"]:
                format = ext
        
        # Preprocess audio
        print(f"Preprocessing audio ({len(audio_data)} bytes)...")
        audio_array, sample_rate = preprocess_audio(
            audio_data,
            format=format,
            apply_noise_reduction=apply_noise_reduction,
            apply_silence_trimming=apply_silence_trimming
        )
        
        # Transcribe
        print(f"Transcribing with model: {model_size}...")
        processor = get_processor(model_size=model_size)
        result = processor.transcribe(
            audio_array,
            sample_rate,
            language=language
        )
        
        processing_time = time.time() - start_time
        
        return TranscriptionResponse(
            raw_transcript=result.raw_text,
            clean_transcript=result.clean_text,
            confidence_score=result.confidence,
            language=result.language or language or "unknown",
            processing_time=f"{processing_time:.2f}s",
            segments=result.segments
        )
        
    except Exception as e:
        print(f"Error processing audio: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )


@app.post("/process/sync")
async def process_audio_sync(
    request: ProcessRequest,
    file: UploadFile = File(...)
) -> TranscriptionResponse:
    """
    Synchronous audio processing with JSON parameters.
    """
    return await process_audio(
        file=file,
        language=request.language,
        model_size=request.model_size,
        apply_noise_reduction=request.apply_noise_reduction,
        apply_silence_trimming=request.apply_silence_trimming
    )


@app.get("/models")
async def list_models():
    """
    List available model sizes.
    """
    return {
        "models": ["tiny", "base", "small", "medium", "large"],
        "recommended": {
            "fastest": "tiny",
            "balanced": "base",
            "accurate": "small"
        }
    }


@app.get("/modes")
async def list_modes():
    """
    List available recording modes.
    """
    return {
        "modes": [
            {
                "id": "lecture",
                "name": "Lecture",
                "description": "Structured notes with concepts and definitions",
                "token_limit": 400
            },
            {
                "id": "meeting",
                "name": "Meeting",
                "description": "Decisions and action items extraction",
                "token_limit": 300
            },
            {
                "id": "interview",
                "name": "Interview",
                "description": "Q/A extraction and speaker intent analysis",
                "token_limit": 350
            },
            {
                "id": "custom",
                "name": "Custom",
                "description": "User-defined instructions",
                "token_limit": 500
            }
        ]
    }


@app.post("/summarize")
async def summarize_transcript_endpoint(
    request: SummarizeRequest
) -> SummarizationResponse:
    """
    Summarize an existing transcript with mode-aware summarization.
    
    Args:
        request: SummarizeRequest with transcript, mode, and optional custom_prompt
    
    Returns:
        SummarizationResponse with summary and metadata
    """
    start_time = time.time()
    
    # Validate mode
    valid_modes = ["lecture", "meeting", "interview", "custom"]
    mode = request.mode.lower() if request.mode.lower() in valid_modes else "lecture"
    
    try:
        result = summarize_transcript(
            transcript=request.transcript,
            mode=mode,
            custom_prompt=request.custom_prompt
        )
        
        processing_time = time.time() - start_time
        
        return SummarizationResponse(
            summary=result.summary,
            mode=result.mode,
            tokens_used=result.tokens_used,
            confidence=result.confidence,
            processing_time=f"{processing_time:.2f}s"
        )
    except Exception as e:
        print(f"Summarization error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Summarization failed: {str(e)}"
        )


@app.post("/process/full")
async def process_audio_full(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    model_size: str = Form("base"),
    apply_noise_reduction: bool = Form(True),
    apply_silence_trimming: bool = Form(True),
    mode: str = Form("lecture"),
    custom_prompt: Optional[str] = Form(None)
) -> FullProcessResponse:
    """
    Full pipeline: Transcribe audio and generate mode-aware summary.
    
    Args:
        file: Audio file (wav, webm, mp3, etc.)
        language: Optional language hint (e.g., "en", "fr", "es")
        model_size: Whisper model size
        apply_noise_reduction: Whether to apply noise reduction
        apply_silence_trimming: Whether to trim silence
        mode: Recording mode for summarization (lecture, meeting, interview, custom)
        custom_prompt: Custom instructions for custom mode
    
    Returns:
        FullProcessResponse with transcription and summary
    """
    start_time = time.time()
    
    print(f"[AI Service] Form params received - mode: \"{mode}\", language: {language}, model_size: {model_size}")
    
    # Validate file type
    allowed_types = ["audio/wav", "audio/webm", "audio/mp3", "audio/mpeg", 
                    "audio/mp4", "audio/ogg", "audio/flac", "audio/aac",
                    "audio/x-m4a", "audio/m4a"]
    
    file_type = file.content_type or ""
    filename = file.filename or ""
    if file_type not in allowed_types and not any(
        filename.lower().endswith(ext) for ext in [".wav", ".webm", ".mp3", 
                                                     ".mp4", ".ogg", ".flac", 
                                                     ".m4a", ".aac"]
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {file_type}"
        )
    
    # Validate mode
    valid_modes = ["lecture", "meeting", "interview", "custom"]
    original_mode = mode
    mode = mode.lower() if mode.lower() in valid_modes else "lecture"
    
    print(f"[AI Service] Received mode: \"{original_mode}\" -> using: \"{mode}\"")
    
    try:
        # Read file data
        audio_data = await file.read()
        await file.close()
        
        # Determine format from filename
        format = "webm"
        if filename:
            ext = filename.split(".")[-1].lower() if "." in filename else ""
            if ext in ["wav", "webm", "mp3", "mp4", "ogg", "flac", "m4a", "aac"]:
                format = ext
        
        # Preprocess audio
        print(f"Preprocessing audio ({len(audio_data)} bytes)...")
        audio_array, sample_rate = preprocess_audio(
            audio_data,
            format=format,
            apply_noise_reduction=apply_noise_reduction,
            apply_silence_trimming=apply_silence_trimming
        )
        
        # Import and run full pipeline
        from src.processor import process_and_summarize
        
        print(f"Processing with mode: {mode}...")
        result = process_and_summarize(
            audio_data=audio_array,
            sample_rate=sample_rate,
            mode=mode,
            custom_prompt=custom_prompt,
            model_size=model_size,
            language=language
        )
        
        processing_time = time.time() - start_time
        
        return FullProcessResponse(
            raw_transcript=result.raw_text,
            clean_transcript=result.clean_text,
            summary=result.summary,
            summary_mode=result.summary_mode,
            summary_tokens=result.summary_tokens,
            transcription_confidence=result.transcription_confidence,
            language=result.language,
            processing_time=f"{processing_time:.2f}s",
            segments=result.segments
        )
        
    except Exception as e:
        print(f"Error in full processing: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8001"))
    
    print(f"Starting AI Processing Service on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
