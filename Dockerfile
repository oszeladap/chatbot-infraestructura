# ── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --prefer-offline
COPY frontend/index.html frontend/vite.config.js ./
COPY frontend/src ./src
RUN npx vite build

# ── Stage 2: Python backend ─────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Copy built React app — path matches what main.py expects:
# Path(__file__).parent.parent / "frontend" / "dist"  →  /frontend/dist
COPY --from=frontend-builder /frontend/dist /frontend/dist

EXPOSE 8080

# Railway injects $PORT automatically
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
