#!/bin/bash
set -e

echo "🚀 Starting Python InsightFace microservice on port 8001..."
cd /app/face_service
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 &
PYTHON_PID=$!

echo "⏳ Waiting for Python service on port 8001 to become ready..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:8001/healthz > /dev/null; then
    echo "✅ Python InsightFace microservice is ready!"
    break
  fi
  sleep 1
done

echo "🚀 Starting Node Express App on port ${PORT:-8000}..."
cd /app
export PORT=${PORT:-8000}
node dist/server.cjs &
NODE_PID=$!

# Wait on either process exiting
wait -n $PYTHON_PID $NODE_PID
