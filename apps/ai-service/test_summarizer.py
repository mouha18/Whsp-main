"""
Test Script for AI Service Summarizer
Tests all three modes: lecture, interview (QA), and meeting

Usage:
    1. Start the AI service: python main.py
    2. Run this script: python test_summarizer.py

Requirements:
    - AI service must be running on http://localhost:8001
    - Install requests: pip install requests
"""

import requests
import json
import sys

# Configuration
BASE_URL = "http://localhost:8001"

# Test transcripts for different modes
TEST_TRANSCRIPTS = {
    "lecture": """
    Welcome to today's lecture on machine learning fundamentals. Machine learning is a subset 
    of artificial intelligence that enables systems to learn and improve from experience without 
    being explicitly programmed. The three main types of machine learning are supervised learning, 
    unsupervised learning, and reinforcement learning. In supervised learning, we have labeled 
    training data where each example is paired with its correct output. The algorithm learns to 
    map inputs to outputs by finding patterns in the training data. Common applications include 
    image classification, speech recognition, and medical diagnosis. The key metrics for evaluating 
    supervised models include accuracy, precision, recall, and F1 score. Accuracy measures the 
    proportion of correct predictions, while precision measures how many of the positive predictions 
    were correct. Recall measures how many actual positives were identified correctly.
    """,
    
    "meeting": """
    Meeting started at 10 AM with all team members present. We discussed the Q1 product roadmap 
    and made several important decisions. First, we decided to prioritize the mobile app redesign 
    for the March release. Tom will lead the design team and coordinate with developers. 
    Sarah volunteered to handle the backend API migration. Action items were assigned: John will 
    update the documentation by Friday, Lisa will schedule user testing sessions for next week, 
    and Mike will prepare the budget proposal. We also decided to postpone the international 
    expansion to Q2. Budget allocation: 40% for mobile development, 30% for infrastructure, 
    30% for marketing. Next meeting scheduled for Monday at 2 PM to review progress.
    """,
    
    "interview": """
    Interviewer: Can you tell us about your background in software development?
    Applicant: I have been working as a software engineer for the past five years, primarily 
    using Python and JavaScript. I've worked on web applications and machine learning systems.
    Interviewer: What made you interested in this position?
    Applicant: I am passionate about building scalable systems and your company's focus on 
    cloud infrastructure aligns with my interests. I want to work on challenging problems 
    that have real-world impact.
    Interviewer: Can you describe a difficult technical challenge you faced?
    Applicant: I once had to optimize a slow database query that was causing performance issues. 
    I analyzed the query execution plan and added appropriate indexes. I also implemented caching 
    which reduced response time by 80 percent.
    Interviewer: What are your salary expectations?
    Applicant: Based on my experience and the market rate, I am expecting between 120 and 150 
    thousand dollars annually.
    """
}


def test_health_check():
    """Test the health endpoint."""
    print("\n" + "="*60)
    print("TEST 1: Health Check")
    print("="*60)
    
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_list_models():
    """Test the models endpoint."""
    print("\n" + "="*60)
    print("TEST 2: List Available Models")
    print("="*60)
    
    try:
        response = requests.get(f"{BASE_URL}/models")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_list_modes():
    """Test the modes endpoint."""
    print("\n" + "="*60)
    print("TEST 3: List Available Modes")
    print("="*60)
    
    try:
        response = requests.get(f"{BASE_URL}/modes")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_summarize_mode(mode: str, transcript: str):
    """Test the summarize endpoint with a specific mode."""
    print("\n" + "="*60)
    print(f"TEST: Summarize - {mode.upper()} MODE")
    print("="*60)
    
    payload = {
        "transcript": transcript.strip(),
        "mode": mode
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/summarize",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"\nSummary:\n{result.get('summary', 'N/A')}")
            print(f"\nMetadata:")
            print(f"  Mode: {result.get('mode')}")
            print(f"  Tokens Used: {result.get('tokens_used')}")
            print(f"  Confidence: {result.get('confidence')}")
            print(f"  Processing Time: {result.get('processing_time')}")
            return True
        else:
            print(f"Error Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_summarize_custom_prompt():
    """Test the summarize endpoint with custom prompt."""
    print("\n" + "="*60)
    print(f"TEST: Summarize - CUSTOM MODE")
    print("="*60)
    
    payload = {
        "transcript": TEST_TRANSCRIPTS["meeting"].strip(),
        "mode": "custom",
        "custom_prompt": "Extract all action items with owners and deadlines"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/summarize",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"\nCustom Summary:\n{result.get('summary', 'N/A')}")
            print(f"\nMetadata:")
            print(f"  Mode: {result.get('mode')}")
            print(f"  Tokens Used: {result.get('tokens_used')}")
            print(f"  Confidence: {result.get('confidence')}")
            return True
        else:
            print(f"Error Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_audio_processing():
    """Test full audio processing pipeline if audio file exists."""
    print("\n" + "="*60)
    print("TEST: Full Audio Processing (Transcribe + Summarize)")
    print("="*60)
    
    # Try to find an audio file
    audio_paths = [
        "apps/backend/data/recordings/rec_1770377304917_297002f2/recording.webm",
        "apps/backend/test.wav",
        "test.wav"
    ]
    
    audio_file = None
    for path in audio_paths:
        try:
            with open(path, "rb") as f:
                audio_file = path
                break
        except FileNotFoundError:
            continue
    
    if not audio_file:
        print("No audio file found. Skipping audio test.")
        print("To test audio, place a .wav or .webm file in the project root.")
        return True
    
    try:
        with open(audio_file, "rb") as f:
            files = {"file": f}
            data = {
                "language": "en",
                "model_size": "base",
                "mode": "lecture"
            }
            response = requests.post(
                f"{BASE_URL}/process/full",
                files=files,
                data=data
            )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"\nRaw Transcript:\n{result.get('raw_transcript', 'N/A')[:500]}...")
            print(f"\nClean Transcript:\n{result.get('clean_transcript', 'N/A')[:500]}...")
            if result.get('summary'):
                print(f"\nSummary:\n{result.get('summary')}")
            print(f"\nMetadata:")
            print(f"  Language: {result.get('language')}")
            print(f"  Confidence: {result.get('transcription_confidence')}")
            print(f"  Processing Time: {result.get('processing_time')}")
            return True
        else:
            print(f"Error Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"Error: {e}")
        return False


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print(" AI SERVICE SUMMARIZER TEST SUITE")
    print("="*60)
    print(f"\nTesting API at: {BASE_URL}")
    print("Make sure the AI service is running: python main.py")
    
    results = []
    
    # Basic tests
    results.append(("Health Check", test_health_check()))
    results.append(("List Models", test_list_models()))
    results.append(("List Modes", test_list_modes()))
    
    # Mode-specific summarization tests
    results.append(("Lecture Mode", test_summarize_mode("lecture", TEST_TRANSCRIPTS["lecture"])))
    results.append(("Meeting Mode", test_summarize_mode("meeting", TEST_TRANSCRIPTS["meeting"])))
    results.append(("Interview Mode", test_summarize_mode("interview", TEST_TRANSCRIPTS["interview"])))
    results.append(("Custom Mode", test_summarize_custom_prompt()))
    
    # Audio processing test
    results.append(("Audio Processing", test_audio_processing()))
    
    # Summary
    print("\n" + "="*60)
    print(" TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
