# Meeting Intelligence Hub

## The Problem

Organizations generate hours of meeting content every week, but long transcripts (20+ pages) become "lost" information that nobody has time to read. Teams waste valuable time asking each other "What was decided in that meeting?" or "Did we agree to move forward?" instead of executing tasks—a cycle called "Double Work" that reduces productivity and creates team confusion.

## The Solution

Meeting Intelligence Hub is an AI-powered meeting analysis platform that automatically extracts, summarizes, and organizes critical meeting insights into actionable intelligence. The platform uses advanced natural language processing to identify key decisions and action items, analyzes sentiment and team dynamics, and provides an intelligent chatbot interface that lets users ask questions about meeting content in natural language—transforming 20-page transcripts into 30-second insights.

**Key Features:**
- ✅ Automatic decision extraction from meeting transcripts
- ✅ Action item identification with assignees and due dates
- ✅ Sentiment analysis and emotional context
- ✅ Natural language Q&A chatbot with evidence citations
- ✅ Real-time streaming responses and professional formatting
- ✅ Cross-meeting search and insights dashboard
- ✅ Meeting participant tracking and segment timestamps

## Tech Stack

**Programming Languages:**
- Python 3.13
- TypeScript
- JavaScript

**Backend Framework & Libraries:**
- FastAPI (high-performance Python web framework)
- SQLAlchemy (async ORM for database operations)
- Uvicorn (ASGI web server)
- Pydantic (data validation)
- aiohttp (async HTTP client)

**Frontend Framework & Libraries:**
- React 18 (UI framework)
- Vite 5 (build tool)
- Material-UI (component library)
- Tailwind CSS (styling)
- Axios (HTTP client)

**Database:**
- SQLite (serverless, with WAL optimization)
- aiosqlite (async SQLite driver)

**AI & NLP Services:**
- Claude (Anthropic) - primary LLM
- Gemini (Google) - fallback LLM
- VADER Sentiment Analysis
- Webvtt Parser (transcripts)
- PyPDF2 (PDF processing)

**Development & DevOps:**
- Docker & Docker Compose (containerization)
- Git & GitHub (version control)
- Pytest (testing framework)
- Alembic (database migrations)

## Setup Instructions

### Prerequisites

Before starting, ensure you have installed:
- **Python 3.10+** (tested with Python 3.13)
- **Node.js v18+** with npm
- **Git** for version control

### Step 1: Clone the Repository

```bash
git clone https://github.com/Arunitavk/meeting_intelligence_hub.git
cd meeting-intelligence-hub
```

### Step 2: Set Up Backend Dependencies

Navigate to the backend directory and create a Python virtual environment:

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows (PowerShell):
.venv\Scripts\Activate

# On macOS/Linux:
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

### Step 3: Configure Environment Variables

Create a `.env` file in the `backend/` directory with your API keys:

```bash
# Backend directory
cd backend

# Create .env file (copy from .env.example)
cp .env.example .env  # macOS/Linux
copy backend\.env.example backend\.env  # Windows PowerShell
```

Edit the `.env` file and add your API keys:

```env
ANTHROPIC_API_KEY=your_claude_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=sqlite+aiosqlite:///./meeting_hub.db
```

**Get Free API Keys:**
- **Claude**: https://console.anthropic.com (Free tier: $5 monthly credit)
- **Gemini**: https://ai.google.dev (Free tier available with limits)

### Step 4: Set Up Frontend Dependencies

In a new terminal window, navigate to the frontend directory:

```bash
cd frontend

# Install Node dependencies
npm install
```

### Step 5: Run the Application

**Terminal 1 - Start Backend Server:**

```bash
cd backend

# Make sure virtual environment is activated
.venv\Scripts\Activate  # Windows
source .venv/bin/activate  # macOS/Linux

# Start backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Backend running at: `http://localhost:8000`  
API documentation at: `http://localhost:8000/docs` (Swagger UI)

**Terminal 2 - Start Frontend Server:**

```bash
cd frontend

# Start frontend development server
npm run dev
```

Frontend running at: `http://localhost:5173`

### Step 6: Access the Application

Open your web browser and navigate to:
```
http://localhost:5173
```

You should see the Meeting Intelligence Hub dashboard ready for use.



## Additional Resources

### API Endpoints

The backend provides the following REST API endpoints:

- `GET /health` - Health check
- `GET /api/meetings/` - List all meetings
- `GET /api/meetings/{id}` - Get meeting details
- `GET /api/meetings/{id}/decisions` - Get meeting decisions
- `GET /api/meetings/{id}/action_items` - Get action items
- `POST /api/uploads/` - Upload files
- `POST /api/chat/stream` - Stream chat response
- `POST /api/chat` - Non-streaming chat

Full API documentation available at `http://localhost:8000/docs` when the backend is running.

### Features Included

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
   - Natural language Q&A interface
   - Context-aware responses
   - Citation evidence with timestamps
   - Streaming responses

5. **Dashboard**
   - All meetings at a glance
   - Quick decision/action item search
   - Meeting detail view
   - Sentiment trends

### Performance Metrics

The application achieves excellent performance:

- **Health check**: 176ms
- **List meetings**: 121ms
- **Action items**: 84ms
- **Chat response**: <2 seconds (with LLM)
- **Database response**: <200ms typical
- **28x performance improvement** (database lock resolution)

### Troubleshooting

**"Connection refused" on localhost:8000**
- Ensure backend is running
- Verify virtual environment is activated
- Check that port 8000 is not in use

**"Cannot find module" errors**
- Ensure virtual environment is activated: `source .venv/bin/activate`
- Reinstall dependencies: `pip install -r requirements.txt`

**API key authentication errors**
- Check `.env` file exists in the `backend/` directory
- Verify API key values are correct
- Ensure API keys have sufficient quota

**Database locked error**
- Delete lock files: `backend/meeting_hub.db-wal` and `backend/meeting_hub.db-shm`
- Restart the backend server

### Documentation

For more information, see:

- [SOLUTION_OVERVIEW.md](SOLUTION_OVERVIEW.md) - Detailed problem statement and solution architecture
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Production deployment instructions for various platforms
- [CONTRIBUTING.md](CONTRIBUTING.md) - Guidelines for contributing to the project

### Support & Contact

For issues, questions, or suggestions:

- Open an issue on [GitHub Issues](https://github.com/Arunitavk/meeting_intelligence_hub/issues)
- Review the [API documentation](http://localhost:8000/docs) when running locally
- Check existing issues and discussions
- See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines

### License

This project is licensed under the MIT License. See [LICENSE](LICENSE) file for details.
