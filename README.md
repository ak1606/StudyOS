# 🎓 AI-Powered Learning Management System

A full-stack, AI-enhanced LMS featuring adaptive quizzes, personalized learning analytics, an AI tutor chatbot, and real-time notifications — all running locally via Ollama.

## 🏗 Architecture

| Layer | Tech |
|-------|------|
| **Frontend** | Next.js 14 (App Router), TypeScript, DaisyUI, TanStack Query, Recharts |
| **Backend** | FastAPI, SQLAlchemy 2.0 (async), Pydantic v2, Alembic |
| **Database** | PostgreSQL 15 + pgvector (768-dim IVFFLAT) |
| **AI / LLM** | Ollama (llama3 chat, nomic-embed-text embeddings), Whisper (transcription) |
| **Background** | Celery 5.4 + Redis |
| **Auth** | JWT (access + refresh tokens), 4 roles: admin · teacher · student · parent |

## ✨ Features

### Module A — Auth & Roles
- JWT login / register with role-based access control
- Token refresh, protected API routes

### Module B — Course & Content Management
- CRUD for courses, modules, lectures, materials
- Video upload → Supabase Storage → Whisper transcription → auto-summarization
- Celery background processing for heavy tasks

### Module C — Embeddings & AI Tutor
- Content is chunked and embedded via nomic-embed-text (768-dim)
- pgvector IVFFLAT index for fast cosine similarity search
- RAG-powered AI Tutor chatbot with SSE streaming
- Source attribution for every AI answer

### Module D — AI Quiz Generation & Adaptive Assessment
- Generate quizzes from any lecture/material using Ollama
- Bloom's Taxonomy tagging (remember / understand / apply / analyze)
- Adaptive difficulty selection during attempts
- Per-concept mastery tracking (JSONB)

### Module E — Learning Analytics & Dashboards
- Student progress: radar charts, engagement trends, predicted grade, AI coach
- Teacher analytics: at-risk students, lecture engagement, confused concepts
- Weekly AI-generated class insights (Celery Beat)
- Concept map visualization (force-directed graph)

### Module F — Notifications & Communication
- Real-time notification bell with 30s polling
- Types: announcements, reminders, alerts, AI insights
- Teacher announcement composer with AI draft generation
- Scheduled announcements (Celery Beat)

## 📁 Project Structure

```
lms/
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI routers (auth, courses, chat, quizzes, analytics, notifications)
│   │   ├── core/          # Config, security helpers
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Business logic (adaptive, analytics, embeddings, ollama)
│   │   ├── tasks/         # Celery tasks (processing, quiz generation, notifications)
│   │   └── main.py        # FastAPI app entrypoint
│   ├── alembic/           # Database migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/               # Next.js App Router pages
│   ├── components/        # Reusable UI components
│   ├── lib/               # API client, stores, utilities
│   ├── types/             # TypeScript interfaces
│   └── Dockerfile
├── nginx/                 # Reverse proxy config
├── docker-compose.yml     # Dev (postgres + redis only)
└── docker-compose.prod.yml # Full production stack
```

## 🚀 Quick Start (Development)

### Prerequisites

- **Python 3.11+** (recommended: use [uv](https://github.com/astral-sh/uv))
- **Node.js 20+**
- **PostgreSQL 15** with pgvector extension
- **Redis**
- **Ollama** with `llama3` and `nomic-embed-text` models

### 1. Start infrastructure

```bash
docker compose up -d   # PostgreSQL (pgvector) + Redis
```

### 2. Install & run Ollama models

```bash
ollama pull llama3
ollama pull nomic-embed-text
ollama serve   # runs on :11434
```

### 3. Backend setup

```bash
cd backend

# Create venv & install deps
uv venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

uv pip install -r requirements.txt

# Configure environment
cp .env.example .env            # then edit .env with your DB/Redis URLs

# Run migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8000
```

### 4. Celery workers (separate terminals)

```bash
# Terminal 1: Worker
celery -A app.celery_app worker --loglevel=info --pool=solo   # --pool=solo for Windows

# Terminal 2: Beat scheduler
celery -A app.celery_app beat --loglevel=info
```

### 5. Frontend setup

```bash
cd frontend
npm install
npm run dev    # runs on :3000
```

### 6. Open the app

Navigate to **http://localhost:3000** — register a teacher account, create a course, and explore!

## 🐳 Production (Docker Compose)

```bash
# Build and start everything
docker compose -f docker-compose.prod.yml up --build -d

# Run migrations inside the backend container
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Pull Ollama models
docker compose -f docker-compose.prod.yml exec ollama ollama pull llama3
docker compose -f docker-compose.prod.yml exec ollama ollama pull nomic-embed-text
```

The app will be available at **http://localhost** (nginx reverse proxy).

## 🔑 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/lms` | Async DB connection |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis for Celery broker/backend |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `JWT_SECRET_KEY` | — | Secret for signing JWT tokens |
| `SUPABASE_URL` | — | Supabase project URL (file storage) |
| `SUPABASE_SERVICE_KEY` | — | Supabase service role key |

## 📊 API Endpoints

| Group | Prefix | Key Endpoints |
|-------|--------|---------------|
| Auth | `/api/auth` | `POST /register`, `POST /login`, `POST /refresh` |
| Courses | `/api/courses` | Full CRUD, modules, lectures, materials, enroll |
| Chat | `/api/chat` | `POST /sessions`, `POST /ask` (SSE), `GET /sessions/{id}/messages` |
| Quizzes | `/api/quizzes` | `POST /generate`, attempts, adaptive answers, publish |
| Analytics | `/api/analytics` | Student progress, course overview, insights, lecture tracking |
| Notifications | `/api` | `GET /notifications`, announcements CRUD, AI draft |

## 🧪 Key Technical Decisions

- **pgvector + IVFFLAT**: Sub-10ms semantic search over content chunks at scale
- **Adaptive quizzes**: Difficulty adjusts per-concept based on response correctness
- **RFC 7807 errors**: Global exception handler returns structured error responses
- **SSE streaming**: AI Tutor responses stream token-by-token via Server-Sent Events
- **Celery Beat**: Scheduled tasks for notifications, weekly insights, announcement delivery
- **bcrypt 3.2.0**: Pinned for passlib 1.7.4 compatibility on Windows

## 📄 License

MIT
