"""
Audio preprocessing utilities for the AI pipeline.
Handles noise reduction, silence trimming, and audio format conversion.
"""
import io
import traceback
import numpy as np
import noisereduce as nr
from pydub import AudioSegment
from scipy.io import wavfile


def convert_audio_to_wav(audio_data: bytes, original_format: str = "webm") -> tuple[np.ndarray, int]:
    """
    Convert audio data to WAV format and return as numpy array.
    
    Args:
        audio_data: Raw audio bytes
        original_format: Original audio format (webm, mp3, etc.)
    
    Returns:
        Tuple of (audio_data as numpy array, sample_rate)
    """
    import tempfile
    import os
    
    # Map format to pydub format
    format_map = {
        'webm': 'webm',
        'wav': 'wav',
        'mp3': 'mp3',
        'mp4': 'mp4',
        'm4a': 'm4a',
        'ogg': 'ogg',
        'flac': 'flac',
        'aac': 'aac',
    }
    pydub_format = format_map.get(original_format.lower(), 'webm')
    
    # Use mkstemp to create a file that won't be auto-deleted
    fd, tmp_path = tempfile.mkstemp(suffix=f".{pydub_format}")
    try:
        # Close the file descriptor immediately so pydub/ffmpeg can open it
        os.close(fd)
        
        # Write data to file using a new handle
        with open(tmp_path, 'wb') as f:
            f.write(audio_data)
        
        # Now read with pydub (file is on disk, no handle locked by us)
        audio = AudioSegment.from_file(tmp_path, format=pydub_format)
    finally:
        # Clean up temp file with retry logic
        import time
        time.sleep(0.05)  # Small delay for ffmpeg to release
        try:
            os.unlink(tmp_path)
        except PermissionError:
            time.sleep(0.1)
            try:
                os.unlink(tmp_path)
            except (PermissionError, FileNotFoundError):
                pass
    
    # Export to new BytesIO (no temp file for output)
    wav_buffer = io.BytesIO()
    audio.export(wav_buffer, format="wav")
    wav_buffer.seek(0)
    
    # Read with scipy
    sample_rate, data = wavfile.read(wav_buffer)
    
    # Convert to float32 normalized array
    if data.dtype != np.float32:
        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            data = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.uint8:
            data = (data.astype(np.float32) / 128.0) - 1.0
    
    return data, sample_rate


def reduce_noise(audio_data: np.ndarray, sample_rate: int) -> np.ndarray:
    """
    Apply noise reduction to audio.
    
    Args:
        audio_data: Audio data as numpy array
        sample_rate: Sample rate of the audio
    
    Returns:
        Noise-reduced audio data
    """
    try:
        # Estimate noise from first 0.5 seconds or minimum available
        noise_duration = min(0.5, len(audio_data) / sample_rate)
        if len(audio_data) > sample_rate:
            noise_sample = audio_data[:int(noise_duration * sample_rate)]
        else:
            noise_sample = audio_data
        
        # Apply noise reduction (compatible with newer noisereduce versions)
        reduced = nr.reduce_noise(
            y=audio_data,
            sr=sample_rate,
            y_noise=noise_sample
        )
        
        return reduced.astype(audio_data.dtype)
        
    except Exception as e:
        print(f"Warning: Noise reduction failed: {e}")
        return audio_data


def trim_silence(audio_data: np.ndarray, sample_rate: int,
                 threshold_db: int = -40, 
                 min_silence_len: int = 500) -> np.ndarray:
    """
    Trim silence from beginning and end of audio.
    
    Args:
        audio_data: Audio data as numpy array
        sample_rate: Sample rate of the audio
        threshold_db: Silence threshold in dB
        min_silence_len: Minimum silence duration in ms
    
    Returns:
        Trimmed audio data
    """
    try:
        # Convert to AudioSegment for easier manipulation
        audio_segment = AudioSegment(
            data=(audio_data * 32767).astype(np.int16).tobytes(),
            sample_rate=sample_rate,
            channels=1,
            sample_width=2
        )
        
        # Trim silence from beginning and end
        trimmed = audio_segment.strip_silence(
            silence_len=min_silence_len,
            silence_thresh=threshold_db
        )
        
        # Convert back to numpy
        samples = np.array(trimmed.get_array_of_samples(), dtype=np.float32)
        
        # Normalize if needed
        if samples.max() > 0:
            samples = samples / 32767.0
        
        return samples
        
    except Exception as e:
        print(f"Warning: Silence trimming failed: {e}")
        return audio_data


def normalize_audio(audio_data: np.ndarray, target_dbfs: float = -3.0) -> np.ndarray:
    """
    Normalize audio to target loudness.
    
    Args:
        audio_data: Audio data as numpy array
        target_dbfs: Target loudness in dBFS
    
    Returns:
        Normalized audio data
    """
    try:
        current_dbfs = 20 * np.log10(np.abs(audio_data).max() + 1e-10)
        gain = target_dbfs - current_dbfs
        
        if gain > 0:
            audio_data = audio_data * (10 ** (gain / 20))
        
        # Clip to prevent clipping
        audio_data = np.clip(audio_data, -1.0, 1.0)
        
        return audio_data
        
    except Exception as e:
        print(f"Warning: Audio normalization failed: {e}")
        return audio_data


def chunk_audio(audio_data: np.ndarray, sample_rate: int,
                max_chunk_duration: int = 30) -> list:
    """
    Split audio into chunks for processing.
    
    Args:
        audio_data: Audio data as numpy array
        sample_rate: Sample rate of the audio
        max_chunk_duration: Maximum chunk duration in seconds
    
    Returns:
        List of audio chunks
    """
    chunk_size = max_chunk_duration * sample_rate
    chunks = []
    
    for i in range(0, len(audio_data), chunk_size):
        chunk = audio_data[i:i + chunk_size]
        if len(chunk) > 0:
            chunks.append(chunk)
    
    return chunks


def preprocess_audio(audio_data: bytes, format: str = "webm",
                      apply_noise_reduction: bool = True,
                      apply_silence_trimming: bool = True) -> tuple:
    """
    Full preprocessing pipeline for audio.
    
    Args:
        audio_data: Raw audio bytes
        format: Original audio format
        apply_noise_reduction: Whether to apply noise reduction
        apply_silence_trimming: Whether to trim silence
    
    Returns:
        Tuple of (processed_audio, sample_rate)
    """
    # Convert to WAV
    audio_array, sample_rate = convert_audio_to_wav(audio_data, format)
    
    # Apply noise reduction
    if apply_noise_reduction:
        audio_array = reduce_noise(audio_array, sample_rate)
    
    # Trim silence
    if apply_silence_trimming:
        audio_array = trim_silence(audio_array, sample_rate)
    
    # Normalize
    audio_array = normalize_audio(audio_array)
    
    return audio_array, sample_rate
