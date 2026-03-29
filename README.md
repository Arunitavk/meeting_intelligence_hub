# Meeting Intelligence Hub

A production-ready web application for ingesting meeting transcripts, extracting actionable insights (decisions, action items), analyzing sentiment, and providing a cross-meeting chatbot using standard LLM integrations.

## Architecture
- **Backend**: Python, FastAPI, SQLAlchemy (asyncio)
- **Database**: PostgreSQL with `pgvector` for semantic search
- **Frontend**: React, TypeScript, Vite, Material-UI, Axios

## Prerequisites
- Docker & docker-compose
- Node.js & npm (v18+)
- Python 3.11+
- Make

## Setup

1. **Backend Environment**
```bash
cd meeting-intelligence-hub/backend
python -m venv venv
# On Windows powershell: .\venv\Scripts\Activate
pip install -r requirements.txt
```

2. **Frontend Environment**
```bash
cd meeting-intelligence-hub/frontend
npm install
```

3. **Start the Database**
*(Run from the root of meeting-intelligence-hub)*
```bash
docker-compose up -d db
```

4. **Run the App**
You can use the provided Makefile to run everything at once:
```bash
make dev
```
- Backend runs on `http://localhost:8000` (API docs at `http://localhost:8000/docs`)
- Frontend runs on `http://localhost:3000`

## Features Included
1. **Multi-Transcript Upload**: Supports `.txt` and `.vtt` with backend parsing.
2. **Extraction**: Background tasks chunking text and using an NLP service (mocked for demo) to pull Decisions and Action Items.
3. **Sentiment Analysis**: Sentiment scoring per TranscriptSegment.
4. **Chatbot (pgvector RAG)**: A dedicated contextual global chat using semantic retrieval via cosine similarity for specific projects/meetings.

## Demo / Seeding
To populate the DB with some demo entities instantly:
```bash
make seed
```
