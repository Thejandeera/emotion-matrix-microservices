FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# Install Python and build dependencies
RUN apt-get update && apt-get install -y \
    python3.10 python3-pip python3.10-venv ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# Install PyTorch with CUDA 12.1 support, then install requirements
RUN pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
RUN pip3 install --no-cache-dir -r requirements.txt

COPY main.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]