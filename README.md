# Meeting Intelligence Hub

An AI-powered meeting analysis platform that automatically extracts, summarizes, and organizes critical meeting insights into actionable intelligence. Transform long meeting transcripts into instant insights with AI-powered decision extraction, action item tracking, and intelligent chatbot capabilities.

## Overview

**Problem**: Organizations generate hours of meeting content weekly, but long transcripts (20+ pages) become "lost" information. Teams waste time asking "What happened in that meeting?" instead of executing tasks—a cycle called "Double Work."

**Solution**: Meeting Intelligence Hub automatically extracts decisions, action items, sentiment analysis, and provides intelligent search across all meetings.

## Key Features

✅ **AI-Powered Insights**
- Automatic decision extraction from transcripts
- Action item identification with ownership & due dates
- Sentiment analysis with emotional context
- Meeting summarization

✅ **Intelligent Search**
- Natural language chat interface
- Context-aware question answering
- Evidence citations with exact timestamps
- Cross-meeting analysis

✅ **Professional Quality**
- Streaming responses with real-time display
- Fallback intelligence when LLM unavailable
- Meeting dashboard with all insights
- Participant tracking

## Architecture

- **Backend**: Python 3.13, FastAPI, SQLAlchemy (async)
- **Database**: SQLite with WAL optimization (serverless, no Docker needed)
- **Frontend**: React 18, TypeScript, Vite, Material-UI, Tailwind CSS, Axios
- **AI**: Claude (Anthropic), Gemini (Google) - with intelligent fallback
- **Performance**: <200ms API response times

## Prerequisites

- **Python**: 3.10+ (tested with 3.13)
- **Node.js**: v18+ with npm
- **Text Editor**: VS Code recommended
- **API Keys**: Anthropic Claude and Google Gemini (free tiers available)

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/Arunitavk/meeting_intelligence_hub.git
cd meeting-intelligence-hub
```

### 2. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv .venv

# Windows (PowerShell):
.venv\Scripts\Activate

# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Environment Configuration
Create `backend/.env` file:
```bash
ANTHROPIC_API_KEY=your_claude_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=sqlite+aiosqlite:///./meeting_hub.db
```

**Get API Keys**:
- Claude: https://console.anthropic.com (free tier available)
- Gemini: https://ai.google.dev (free tier available)

### 4. Frontend Setup
```bash
cd frontend
npm install
```

### 5. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Backend available at: `http://localhost:8000`
API docs at: `http://localhost:8000/docs`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend available at: `http://localhost:5173`

## Features Included

1. **Meeting Upload & Processing**
   - Multi-file upload (PDF, audio, transcripts)
   - Automatic transcript generation
   - Real-time file progress tracking

2. **Intelligent Extraction**
   - Key decisions identified and ranked
   - Action items with assignees and due dates
   - Meeting participants tracked
   - Segments with timestamps

3. **Sentiment Analysis**
   - Per-segment sentiment scoring
   - Emotional trend visualization
   - Speaker tone analysis

4. **Chatbot & Search**
   - Natural language Q&A
   - Context-aware responses
   - Citation evidence with timestamps
   - Streaming responses

5. **Dashboard**
   - All meetings at a glance
   - Quick decision/action item search
   - Meeting detail view
   - Sentiment trends

## API Endpoints

- `GET /health` - Health check
- `GET /api/meetings/` - List all meetings
- `GET /api/meetings/{id}` - Get meeting details
- `GET /api/meetings/{id}/decisions` - Get meeting decisions
- `GET /api/meetings/{id}/action_items` - Get action items
- `POST /api/uploads/` - Upload files
- `POST /api/chat/stream` - Stream chat response
- `POST /api/chat` - Non-streaming chat

*Full API documentation available at `http://localhost:8000/docs` when running*

## Production Performance

✅ **Response Times**:
- Health check: 176ms
- List meetings: 121ms
- Action items: 84ms
- Chat: <2s (with LLM)

✅ **Reliability**:
- Database locked issues: Fixed (28x performance improvement)
- Rate-limiting: Handled with intelligent fallback
- Data persistence: SQLite with automatic backups

## Troubleshooting

**"Connection refused" on localhost:8000**
- Ensure backend is running: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`

**"Cannot find module" errors**
- Ensure virtual environment is activated
- Run `pip install -r requirements.txt`

**API key errors**
- Check `.env` file exists with correct format
- Verify API keys are valid and have quota

**Database locked**
- Delete `backend/meeting_hub.db-wal` and `backend/meeting_hub.db-shm`
- Restart backend

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - See [LICENSE](LICENSE) file

## Documentation

- [Solution Overview](SOLUTION_OVERVIEW.md) - Problem statement and solution details
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Production deployment instructions
- [Setup & Validation](VALIDATION_GUIDE.md) - Testing and validation steps

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing documentation
- Review API docs at `http://localhost:8000/docs`
