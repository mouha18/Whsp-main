"""
Speech-to-text processor using faster-whisper.
Handles transcription and transcript cleanup.

Note: faster-whisper is a C++ implementation of OpenAI Whisper model
that runs locally. It's NOT the OpenAI API - it's a local inference engine.
"""
import io
import time
import numpy as np
from faster_whisper import WhisperModel
from pydantic import BaseModel
from typing import Optional

# Import summarizer for integrated pipeline
try:
    from .summarizer import summarize_transcript, RecordingMode
    SUMMARIZER_AVAILABLE = True
except ImportError:
    SUMMARIZER_AVAILABLE = False


class TranscriptionResult(BaseModel):
    """Result from transcription."""
    raw_text: str
    clean_text: str
    confidence: float
    language: Optional[str] = None
    segments: Optional[list] = None


class SummarizationResult(BaseModel):
    """Result from summarization."""
    summary: str
    mode: str
    tokens_used: int
    confidence: float


class FullProcessingResult(BaseModel):
    """Complete result from transcription + summarization pipeline."""
    raw_text: str
    clean_text: str
    summary: Optional[str] = None
    summary_mode: Optional[str] = None
    summary_tokens: Optional[int] = None
    summary_confidence: Optional[float] = None
    transcription_confidence: float
    language: str
    segments: Optional[list] = None


class TranscriptProcessor:
    """
    Speech-to-text processor using faster-whisper (local C++ implementation).
    NOT using OpenAI API - runs models locally.
    """
    
    def __init__(self, model_size: str = "base", device: str = "cpu", 
                 compute_type: str = "int8"):
        """
        Initialize the processor.
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large)
            device: Device to use (cpu only - GPU/CUDA disabled)
            compute_type: Compute type (int8 for CPU performance)
        """
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Load the faster-whisper model (C++ implementation) on CPU."""
        try:
            print(f"Loading faster-whisper model: {self.model_size} on CPU")
            # Force CPU device - CUDA/GPU disabled
            self.model = WhisperModel(
                model_size_or_path=self.model_size,
                device="cpu",
                compute_type="int8"
            )
            print(f"Model loaded successfully on CPU")
        except Exception as e:
            print(f"Error loading model: {e}")
            # Try with float16 as fallback
            try:
                self.model = WhisperModel(
                    model_size_or_path=self.model_size,
                    device="cpu",
                    compute_type="int8_float16"
                )
                print(f"Model loaded with int8_float16 fallback")
            except Exception as e2:
                print(f"Final error loading model: {e2}")
                raise
    
    def transcribe(self, audio_data: np.ndarray, sample_rate: int,
                   language: Optional[str] = None,
                   beam_size: int = 5) -> TranscriptionResult:
        """
        Transcribe audio data.
        
        Args:
            audio_data: Audio data as numpy array
            sample_rate: Sample rate of the audio
            language: Optional language hint
            beam_size: Beam size for decoding
        
        Returns:
            TranscriptionResult with raw and clean text
        """
        start_time = time.time()
        
        # Convert audio to 16kHz mono for Whisper
        audio_16k = self._prepare_audio(audio_data, sample_rate)
        
        # Transcribe with faster-whisper
        if self.model is None:
            raise RuntimeError("Model not loaded")
        
        segments, info = self.model.transcribe(
            audio_16k,
            language=language,
            beam_size=beam_size,
            vad_filter=True,  # Enable voice activity detection
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=400
            )
        )
        
        # Collect segments
        raw_segments = []
        full_text = ""
        
        for segment in segments:
            segment_text = segment.text.strip()
            raw_segments.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment_text
            })
            full_text += segment_text + " "
        
        raw_text = full_text.strip()
        
        # Calculate confidence (average of segment probabilities)
        if raw_segments:
            avg_confidence = sum(
                segment.get("avg_logprob", 0) 
                for segment in raw_segments
            ) / len(raw_segments)
            # Convert log probability to confidence score (approximate)
            confidence = max(0, min(1, (avg_confidence + 1) / 2))
        else:
            confidence = 0.0
        
        # Clean the transcript
        clean_text = self._cleanup_text(raw_text)
        
        processing_time = time.time() - start_time
        
        return TranscriptionResult(
            raw_text=raw_text,
            clean_text=clean_text,
            confidence=confidence,
            language=info.language if info.language else language,
            segments=raw_segments
        )
    
    def _prepare_audio(self, audio_data: np.ndarray, sample_rate: int) -> np.ndarray:
        """
        Prepare audio for Whisper (16kHz mono).
        
        Args:
            audio_data: Audio data as numpy array
            sample_rate: Original sample rate
        
        Returns:
            Resampled audio at 16kHz
        """
        from scipy import signal
        
        # Convert to mono if stereo
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)
        
        # Resample to 16kHz
        target_rate = 16000
        if sample_rate != target_rate:
            new_length = int(len(audio_data) * target_rate / sample_rate)
            audio_data = signal.resample(audio_data, new_length)
        
        # Ensure it's a numpy array (scipy might return different type)
        if not isinstance(audio_data, np.ndarray):
            audio_data = np.array(audio_data, dtype=np.float32)
        
        # Normalize
        if audio_data.size > 0 and audio_data.max() > 0:
            audio_data = audio_data / np.abs(audio_data).max()
        
        # Convert to float32
        audio_data = audio_data.astype(np.float32)
        
        return audio_data
    
    def _cleanup_text(self, text: str) -> str:
        """
        Clean up transcription text.
        
        Args:
            text: Raw transcription text
        
        Returns:
            Cleaned text
        """
        import re
        
        if not text:
            return ""
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove leading/trailing whitespace
        text = text.strip()
        
        # Capitalize first letter of sentences
        sentences = re.split(r'([.!?]+)', text)
        result = []
        for i, part in enumerate(sentences):
            if i % 2 == 0:  # This is a sentence
                part = part.strip()
                if part:
                    part = part[0].upper() + part[1:] if len(part) > 1 else part.upper()
            result.append(part)
        text = ''.join(result)
        
        # Fix common punctuation spacing
        text = re.sub(r'\s+([.,!?])', r'\1', text)
        
        # Remove repeated words (like "the the")
        text = re.sub(r'\b(\w+)\s+\1\b', r'\1', text)
        
        return text
    
    def batch_transcribe(self, audio_chunks: list, sample_rate: int,
                         language: Optional[str] = None) -> TranscriptionResult:
        """
        Transcribe multiple audio chunks and combine results.
        
        Args:
            audio_chunks: List of audio chunks
            sample_rate: Sample rate
            language: Optional language hint
        
        Returns:
            Combined transcription result
        """
        all_segments = []
        full_raw = ""
        total_confidence = 0
        count = 0
        
        for i, chunk in enumerate(audio_chunks):
            print(f"Processing chunk {i + 1}/{len(audio_chunks)}")
            result = self.transcribe(chunk, sample_rate, language)
            
            # Offset segment timestamps
            offset = i * 30  # Assuming 30s chunks
            for seg in result.segments or []:
                seg["start"] += offset
                seg["end"] += offset
                all_segments.append(seg)
            
            full_raw += result.raw_text + " "
            if result.confidence > 0:
                total_confidence += result.confidence
                count += 1
        
        raw_text = full_raw.strip()
        confidence = total_confidence / count if count > 0 else 0.0
        clean_text = self._cleanup_text(raw_text)
        
        return TranscriptionResult(
            raw_text=raw_text,
            clean_text=clean_text,
            confidence=confidence,
            language=language,
            segments=all_segments
        )


# Singleton instance
_processor: Optional[TranscriptProcessor] = None


def get_processor(model_size: str = "base") -> TranscriptProcessor:
    """Get or create the processor singleton."""
    global _processor
    if _processor is None:
        _processor = TranscriptProcessor(model_size=model_size)
    return _processor


def transcribe_audio(audio_data: np.ndarray, sample_rate: int,
                     model_size: str = "base",
                     language: Optional[str] = None) -> TranscriptionResult:
    """
    Convenience function to transcribe audio.
    
    Args:
        audio_data: Audio data as numpy array
        sample_rate: Sample rate
        model_size: Whisper model size
        language: Optional language hint
    
    Returns:
        TranscriptionResult
    """
    processor = get_processor(model_size)
    return processor.transcribe(audio_data, sample_rate, language)


def process_and_summarize(
    audio_data: np.ndarray,
    sample_rate: int,
    mode: str = "lecture",
    custom_prompt: Optional[str] = None,
    model_size: str = "base",
    language: Optional[str] = None
) -> FullProcessingResult:
    """
    Full pipeline: Transcribe audio and generate mode-aware summary.
    
    Args:
        audio_data: Audio data as numpy array
        sample_rate: Sample rate
        mode: Recording mode for summarization (lecture, meeting, interview, custom)
        custom_prompt: Custom prompt for custom mode
        model_size: Whisper model size
        language: Optional language hint
    
    Returns:
        FullProcessingResult with transcription and optional summary
    """
    print(f"[Processor] Starting process_and_summarize with mode: \"{mode}\"")
    
    # Step 1: Transcribe
    processor = get_processor(model_size)
    transcription = processor.transcribe(audio_data, sample_rate, language)
    
    # Initialize result
    result = FullProcessingResult(
        raw_text=transcription.raw_text,
        clean_text=transcription.clean_text,
        transcription_confidence=transcription.confidence,
        language=transcription.language or language or "unknown",
        segments=transcription.segments
    )
    
    # Step 2: Summarize (if summarizer is available)
    if SUMMARIZER_AVAILABLE and transcription.clean_text:
        try:
            print(f"[Processor] Calling summarize_transcript with mode: \"{mode}\"")
            summary_result = summarize_transcript(
                transcript=transcription.clean_text,
                mode=mode,
                custom_prompt=custom_prompt
            )
            result.summary = summary_result.summary
            result.summary_mode = summary_result.mode
            result.summary_tokens = summary_result.tokens_used
            result.summary_confidence = summary_result.confidence
        except Exception as e:
            print(f"Summarization error: {e}")
            result.summary = None
    
    return result
