# Emotion Matrix Microservices

An advanced, decoupled AI architecture designed to analyze audio streams (or files), extract business-critical keyphrases, and evaluate the specific emotional sentiment of those isolated contexts.

By breaking down a monolithic NLP/Audio processing script into independent microservices, this architecture ensures high scalability, fault isolation, and optimized GPU utilization.

## 🏗 Architecture Overview

The system consists of a Next.js frontend and four distinct FastAPI microservices. The frontend communicates exclusively with the API Gateway, which orchestrates the complex flow of machine learning data in the background.

- **Frontend (Next.js):** Provides a UI for static audio file uploads and live microphone recording.
- **API Gateway (Port 8000):** The central orchestrator. Routes traffic and bundles the final JSON payload.
- **Whisper STT Service (Port 8001):** Handles Speech-to-Text using `faster-whisper-large-v3-turbo-ct2` with Voice Activity Detection (VAD).
- **Phrase Extraction Service (Port 8002):** A lightweight NLP pipeline using spaCy's `PhraseMatcher` to isolate exact sentence boundaries around target keywords with sub-millisecond latency.
- **Sentiment Service (Port 8003):** Utilizes a fine-tuned RoBERTa model (`SamLowe/roberta-base-go_emotions`) to categorize the emotion (e.g., Disappointment, Anger, Joy) and overall sentiment of the isolated sentences.

## 📂 Project Structure

```text
emotion-matrix-microservices/
├── api-gateway/            # FastAPI Orchestrator
├── frontend/               # Next.js / React UI
├── service-phrase/         # spaCy Keyphrase Extraction
├── service-sentiment/      # RoBERTa Emotion Classifier
├── service-whisper/        # Faster-Whisper Transcription Engine
├── start_services.bat      # Windows batch script for local execution
├── docker-compose.yml      # Container orchestration (NVIDIA CUDA support)
└── venv/                   # Local Python virtual environment
```

## ⚙️ Environment Setup (First-Time Installation)

Before running the services locally, you must create a virtual environment in the root directory and install the dependencies for all four microservices.

Open your terminal in the `emotion-matrix-microservices` root folder and run the following commands:

1. Create and activate the virtual environment (Windows):

```powershell
python -m venv venv
.\venv\Scripts\activate
```

2. Install dependencies for each service:
   With the `(venv)` active in your terminal, install the requirements one by one:

```bash
pip install -r api-gateway/requirements.txt
pip install -r service-phrase/requirements.txt
pip install -r service-sentiment/requirements.txt
pip install -r service-whisper/requirements.txt
```

> **Note:** Installing the Whisper and Sentiment requirements will download PyTorch. If you want to ensure CUDA support for local execution, install the PyTorch CUDA wheels manually as specified on the PyTorch website before running these commands.

## 🚀 Quick Start (Local Development)

Running the services locally via the virtual environment is recommended to save bandwidth from downloading large CUDA Docker images.

### 1. Start the Backend Microservices

Ensure your Python virtual environment (`venv`) is fully set up with all requirements installed (see the Environment Setup section above).

Run the automated batch script from the root directory:

```dos
.\start_services.bat
```

This will open four separate terminal windows running the API Gateway, Whisper, Phrase, and Sentiment services on their respective ports.

### 2. Start the Frontend

Open a new terminal, navigate to the frontend directory, and start the Next.js development server:

```bash
cd frontend
npm install
npm run dev
```

Navigate to http://localhost:3000 in your browser to access the Emotion Matrix UI.

## 🐳 Deployment (Docker & NVIDIA GPU)

For production or containerized environments, the backend is fully configured for Docker with NVIDIA CUDA hardware acceleration.

### Prerequisites

- Docker Desktop installed.
- NVIDIA GPU with appropriate drivers.

Run the build:

```bash
docker compose up --build
```

> **Note:** The first build will download several gigabytes of CUDA base images (`nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04`). Ensure you have a stable connection and sufficient disk space.

## 📡 API Gateway Endpoints

The Next.js frontend relies on the following primary endpoint exposed by the Gateway:

### POST /api/v1/process-audio

Processes Base64 encoded audio through the entire STT -> NLP -> Emotion pipeline.

#### Request Body

```json
{
  "audio_data": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA..."
}
```

#### Response Payload

```json
{
  "status": "success",
  "processing_time_ms": 1450.2,
  "transcript": "Hello, I received the wrong item in my order. This is completely unacceptable.",
  "detected_issues": [
    {
      "phrase": "wrong item",
      "isolated_sentence": "Hello, I received the wrong item in my order.",
      // "emotion": "disappointment",
      "sentiment_category": "negative"
      // "confidence": 0.89
    },
    {
      "phrase": "completely unacceptable",
      "isolated_sentence": "This is completely unacceptable.",
      // "emotion": "anger",
      "sentiment_category": "negative"
      // "confidence": 0.94
    }
  ]
}
```

## 🛠 Tech Stack

- **Frontend:** Next.js, React, TypeScript, CSS Modules
- **Backend Framework:** FastAPI, Uvicorn, HTTPX (Async Routing)
- **Machine Learning:** PyTorch, Transformers (Hugging Face)
- **Audio Processing:** Faster-Whisper, Silero VAD
- **NLP:** spaCy (`en_core_web_sm`)
