FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd -m scanner && mkdir -p /tmp/recap_checkpoints && chown -R scanner:scanner /tmp/recap_checkpoints
USER scanner

EXPOSE 10000
# Render sets PORT dynamically (10000 by default). Run the scanner on that port.
CMD ["sh", "-c", "exec uvicorn app.server:app --host 0.0.0.0 --port ${PORT:-10000}"]
