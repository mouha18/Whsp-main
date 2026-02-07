"""
AI Service - Speech-to-text processing with faster-whisper.
"""
from src.processor import get_processor, transcribe_audio, TranscriptProcessor
from src.audio_utils import preprocess_audio

__all__ = [
    "get_processor",
    "transcribe_audio", 
    "TranscriptProcessor",
    "preprocess_audio",
]
