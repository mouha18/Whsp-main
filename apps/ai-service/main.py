"""
AI Processing Service - FastAPI Application
Provides speech-to-text transcription using faster-whisper.
"""
import os
import sys
import time
import tempfile
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import numpy as np

# Add src to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.audio_utils import preprocess_audio
from src.processor import get_processor, TranscriptProcessor


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


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_size: str


# Background tasks storage
processing_tasks = {}


@app.get("/health")
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    """
    processor = get_processor()
    return HealthResponse(
        status="healthy",
        model_loaded=processor.model is not None,
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


if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8001"))
    
    print(f"Starting AI Processing Service on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
