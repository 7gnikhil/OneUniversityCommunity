FROM python:3.11-slim

# ffmpeg: song decode + mp3 encode. git: demucs' model download path.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Hugging Face Spaces default port.
ENV PORT=7860
EXPOSE 7860
CMD ["python", "app.py"]
