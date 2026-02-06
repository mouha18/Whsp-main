import wave
import struct
import math
import os

# Create a simple test WAV file (1 second of sine wave tone)
sample_rate = 44100
duration = 1  # seconds
frequency = 440  # Hz (A4 note)

num_samples = sample_rate * duration
amplitude = 16000

output_file = os.path.join(os.path.dirname(__file__), 'test.wav')

with wave.open(output_file, 'w') as wav_file:
    wav_file.setnchannels(1)  # Mono
    wav_file.setsampwidth(2)  # 2 bytes = 16-bit
    wav_file.setframerate(sample_rate)
    
    for i in range(num_samples):
        value = int(amplitude * math.sin(2 * math.pi * frequency * i / sample_rate))
        data = struct.pack('<h', value)
        wav_file.writeframes(data)

print(f"Test WAV file created: {output_file}")
print(f"Duration: {duration}s, Sample rate: {sample_rate}Hz, Channels: 1, 16-bit")
