"""
Mode-aware summarizer using Qwen 2.5 1.5B.
Produces different summary formats based on recording mode.
"""
import time
import re
from enum import Enum
from typing import Optional
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch


class RecordingMode(str, Enum):
    """Recording modes for mode-aware summarization."""
    LECTURE = "lecture"
    MEETING = "meeting"
    INTERVIEW = "interview"
    CUSTOM = "custom"


# Mode configurations with token limits and system prompts
MODE_CONFIGS = {
    RecordingMode.LECTURE: {
        "token_limit": 400,
        "system_prompt": """You are a helpful teaching assistant. Summarize the lecture transcript into structured notes with:
- Key concepts and definitions
- Important points under each concept
- Any examples mentioned
- Main takeaways

Format as markdown with clear sections. Prioritize educational value.""",
        "user_template": """Create structured notes from this lecture transcript. Focus on concepts, definitions, and key learning points:

{transcript}"""
    },
    RecordingMode.MEETING: {
        "token_limit": 300,
        "system_prompt": """You are a professional meeting assistant. Extract and organize meeting content into:
- Key decisions made
- Action items with owners (if mentioned)
- Discussion topics
- Next steps

Use clear formatting with bullet points. Prioritize actionable outcomes.""",
        "user_template": """Extract meeting details from this transcript. Focus on decisions, action items, and next steps:

{transcript}"""
    },
    RecordingMode.INTERVIEW: {
        "token_limit": 350,
        "system_prompt": """You are an analyst reviewing an interview. Extract:
- Questions asked and their responses
- Key information shared by the interviewee
- Speaker intent and tone
- Important quotable statements

Format as Q&A pairs when clear, otherwise summarize by topic.""",
        "user_template": """Analyze this interview transcript. Extract questions, answers, and key information:

{transcript}"""
    },
    RecordingMode.CUSTOM: {
        "token_limit": 500,
        "system_prompt": """You are a helpful AI assistant. Follow the user's custom instructions to process this transcript.""",
        "user_template": """{custom_prompt}

Transcript to process:
{transcript}"""
    }
}


class SummarizationResult(BaseModel):
    """Result from summarization."""
    summary: str
    mode: str
    tokens_used: int
    confidence: float


class ModeAwareSummarizer:
    """
    Mode-aware summarizer using Qwen 2.5 1.5B.
    
    Produces different summary formats based on recording mode:
    - Lecture: structured notes with concepts and definitions
    - Meeting: decisions and action items extraction
    - Interview: Q/A extraction and speaker intent
    - Custom: user-defined instructions
    """
    
    def __init__(self, model_id: str = "Qwen/Qwen2.5-1.5B-Instruct"):
        """
        Initialize the summarizer.
        
        Args:
            model_id: Hugging Face model ID for Qwen 2.5 1.5B
        """
        self.model_id = model_id
        self.tokenizer = None
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Load Qwen 2.5 1.5B model on CPU."""
        try:
            print(f"Loading Qwen 2.5 1.5B model: {self.model_id}")
            
            # Load tokenizer and model
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)
            
            # Load model with CPU optimization
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_id,
                torch_dtype="auto",
                device_map="auto",
                low_cpu_mem_usage=True
            )
            
            print("Qwen 2.5 1.5B model loaded successfully")
            
        except Exception as e:
            print(f"Error loading Qwen model: {e}")
            # Fallback to quantized version if available
            try:
                print("Attempting to load quantized model...")
                self.model = AutoModelForCausalLM.from_pretrained(
                    self.model_id,
                    torch_dtype="auto",
                    device_map="auto",
                    load_in_4bit=True,
                    low_cpu_mem_usage=True
                )
                print("Quantized model loaded successfully")
            except Exception as e2:
                print(f"Final error loading model: {e2}")
                raise
    
    def _count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        if not self.tokenizer:
            return len(text) // 4  # Rough estimate
        return len(self.tokenizer.encode(text))
    
    def _truncate_to_tokens(self, text: str, max_tokens: int) -> str:
        """Truncate text to fit within token limit."""
        tokens = self.tokenizer.encode(text) if self.tokenizer else text.split()
        
        if len(tokens) <= max_tokens:
            return text
        
        truncated = tokens[:max_tokens]
        return self.tokenizer.decode(truncated) if self.tokenizer else " ".join(truncated)
    
    def _estimate_confidence(self, response: str) -> float:
        """
        Estimate confidence based on response characteristics.
        Returns a value between 0 and 1.
        """
        if not response:
            return 0.0
        
        score = 0.5  # Base score
        
        # Positive indicators
        if len(response) > 50:
            score += 0.2
        if "•" in response or "-" in response or "*" in response:
            score += 0.1  # Structured output
        if any(word in response.lower() for word in ["decision", "action", "conclusion", "key"]):
            score += 0.1
        
        # Negative indicators
        if "i cannot" in response.lower() or "i'm sorry" in response.lower():
            score -= 0.3
        if len(response.split()) < 10:
            score -= 0.2
        
        return max(0.0, min(1.0, score))
    
    def summarize(
        self,
        transcript: str,
        mode: RecordingMode,
        custom_prompt: Optional[str] = None
    ) -> SummarizationResult:
        """
        Generate a mode-aware summary of the transcript.
        
        Args:
            transcript: The cleaned transcript text
            mode: Recording mode (lecture, meeting, interview, custom)
            custom_prompt: Custom instructions for custom mode
        
        Returns:
            SummarizationResult with summary, mode, tokens used, and confidence
        """
        start_time = time.time()
        
        if not transcript or not transcript.strip():
            return SummarizationResult(
                summary="No transcript content to summarize.",
                mode=mode.value,
                tokens_used=0,
                confidence=0.0
            )
        
        config = MODE_CONFIGS.get(mode, MODE_CONFIGS[RecordingMode.CUSTOM])
        token_limit = config["token_limit"]
        
        # Prepare user message
        if mode == RecordingMode.CUSTOM and custom_prompt:
            user_content = config["user_template"].format(
                custom_prompt=custom_prompt,
                transcript=transcript
            )
        else:
            user_content = config["user_template"].format(transcript=transcript)
        
        # Truncate transcript if too long (leave room for prompt)
        max_transcript_tokens = token_limit - 100  # Reserve tokens for prompt
        user_content = self._truncate_to_tokens(user_content, max_transcript_tokens + 100)
        
        # Build messages for chat template
        messages = [
            {"role": "system", "content": config["system_prompt"]},
            {"role": "user", "content": user_content}
        ]
        
        # Apply chat template
        if self.tokenizer:
            try:
                text = self.tokenizer.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=True
                )
            except Exception:
                # Fallback if chat template not available
                text = f"System: {config['system_prompt']}\n\nUser: {user_content}\n\nAssistant:"
        else:
            text = f"System: {config['system_prompt']}\n\nUser: {user_content}\n\nAssistant:"
        
        # Tokenize and generate
        if self.model and self.tokenizer:
            try:
                inputs = self.tokenizer.encode(text, return_tensors="pt")
                
                with torch.no_grad():
                    outputs = self.model.generate(
                        inputs,
                        max_new_tokens=token_limit,
                        temperature=0.7,
                        top_p=0.9,
                        do_sample=True,
                        pad_token_id=self.tokenizer.eos_token_id
                    )
                
                # Decode only the generated part
                response = self.tokenizer.decode(
                    outputs[0][inputs.shape[1]:],
                    skip_special_tokens=True
                )
            except Exception as e:
                print(f"Generation error: {e}")
                response = self._fallback_summarize(transcript, mode)
        else:
            response = self._fallback_summarize(transcript, mode)
        
        # Clean up response
        response = response.strip()
        
        # Estimate confidence
        confidence = self._estimate_confidence(response)
        
        tokens_used = self._count_tokens(response)
        processing_time = time.time() - start_time
        
        print(f"Summarization ({mode.value}): {tokens_used} tokens, {processing_time:.2f}s")
        
        return SummarizationResult(
            summary=response,
            mode=mode.value,
            tokens_used=tokens_used,
            confidence=confidence
        )
    
    def _fallback_summarize(self, transcript: str, mode: RecordingMode) -> str:
        """
        Fallback summarization if model fails.
        Creates a simple extractive summary.
        """
        config = MODE_CONFIGS.get(mode, MODE_CONFIGS[RecordingMode.CUSTOM])
        
        # Simple extractive summarization
        sentences = re.split(r'[.!?]+', transcript)
        key_sentences = []
        
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) > 20:  # Filter very short sentences
                key_sentences.append(sentence)
        
        # Take first few sentences as summary
        max_chars = 500 if mode == RecordingMode.CUSTOM else (
            400 if mode == RecordingMode.LECTURE else (
                300 if mode == RecordingMode.MEETING else 350
            )
        )
        
        summary = ". ".join(key_sentences[:5])  # Take first 5 sentences
        return (summary + ".") if summary and not summary.endswith(".") else summary


# Singleton instance
_summarizer: Optional[ModeAwareSummarizer] = None


def get_summarizer(model_id: str = "Qwen/Qwen2.5-1.5B-Instruct") -> ModeAwareSummarizer:
    """Get or create the summarizer singleton."""
    global _summarizer
    if _summarizer is None:
        _summarizer = ModeAwareSummarizer(model_id=model_id)
    return _summarizer


def summarize_transcript(
    transcript: str,
    mode: str = "lecture",
    custom_prompt: Optional[str] = None,
    model_id: str = "Qwen/Qwen2.5-1.5B-Instruct"
) -> SummarizationResult:
    """
    Convenience function to summarize a transcript.
    
    Args:
        transcript: The cleaned transcript text
        mode: Recording mode (lecture, meeting, interview, custom)
        custom_prompt: Custom instructions for custom mode
        model_id: Qwen model ID
    
    Returns:
        SummarizationResult
    """
    print(f"[Summarizer] summarize_transcript called with mode: \"{mode}\"")
    
    try:
        mode_enum = RecordingMode(mode.lower())
        print(f"[Summarizer] Mode enum resolved to: {mode_enum.value}")
    except ValueError:
        mode_enum = RecordingMode.LECTURE
        print(f"[Summarizer] Invalid mode \"{mode}\", defaulting to lecture")
    
    summarizer = get_summarizer(model_id)
    return summarizer.summarize(transcript, mode_enum, custom_prompt)
