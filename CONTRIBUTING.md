# Contributing to Meeting Intelligence Hub

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Please be respectful and constructive in all interactions with other contributors.

## Getting Started

### 1. Fork the Repository
```bash
# Fork at https://github.com/Arunitavk/meeting_intelligence_hub
git clone https://github.com/YOUR_USERNAME/meeting_intelligence_hub.git
cd meeting_intelligence_hub
git remote add upstream https://github.com/Arunitavk/meeting_intelligence_hub.git
```

### 2. Create a Feature Branch
```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names:
- `feature/add-pdf-support` for new features
- `fix/database-lock-issue` for bug fixes
- `docs/update-readme` for documentation
- `refactor/cleanup-imports` for refactoring

### 3. Make Your Changes

#### Backend Development
- Follow PEP 8 style guide
- Use type hints for all functions
- Add docstrings for classes and functions
- Write tests for new features

```python
def extract_decisions(transcript: str) -> list[Decision]:
    """Extract key decisions from meeting transcript.
    
    Args:
        transcript: Full meeting transcript text
        
    Returns:
        List of Decision objects with text and timestamps
    """
    # Implementation
```

#### Frontend Development
- Use TypeScript strict mode
- Follow React best practices
- Use functional components with hooks
- Keep components small and reusable

```typescript
interface MeetingProps {
  id: string;
  title: string;
  onUpdate?: () => void;
}

export const MeetingDetail: React.FC<MeetingProps> = ({
  id,
  title,
  onUpdate
}) => {
  // Implementation
};
```

### 4. Test Your Changes

#### Backend Tests
```bash
cd backend
pytest tests/ -v
pytest tests/test_chat_agent.py -v  # Specific test
pytest --cov=app tests/  # With coverage
```

#### Frontend Tests
```bash
cd frontend
npm test
npm run lint
```

### 5. Commit Messages

Write clear, descriptive commit messages:

```bash
# Good
git commit -m "Fix: Resolve database lock issue with WAL configuration"
git commit -m "Feat: Add decision extraction from meeting transcripts"
git commit -m "Docs: Update README with installation instructions"

# Avoid
git commit -m "fixed stuff"
git commit -m "updates"
```

Format: `[Type]: [Description]`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Test additions/modifications
- `chore`: Build, dependencies, config
- `perf`: Performance improvements

### 6. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a PR on GitHub with:
- Clear title describing the change
- Description of what was changed and why
- Reference to any related issues (#123)
- Screenshots for UI changes

## Development Setup

### Backend
```bash
cd backend
python -m venv .venv
.venv/Scripts/Activate  # Windows
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
pip install -r requirements-dev.txt  # For testing
```

### Frontend
```bash
cd frontend
npm install
npm run dev  # Start dev server
npm run build  # Production build
npm test     # Run tests
npm run lint # Check code style
```

## Project Structure

```
meeting-intelligence-hub/
├── backend/
│   ├── app/
│   │   ├── api/              # API endpoints
│   │   ├── core/             # Config, constants
│   │   ├── models/           # Pydantic models
│   │   ├── services/         # Business logic
│   │   ├── main.py           # FastAPI app
│   │   └── database.py       # Database setup
│   ├── tests/                # Test files
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Example env file
├── frontend/
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── App.tsx           # Root component
│   │   └── main.tsx          # Entry point
│   ├── package.json          # Node dependencies
│   └── vite.config.ts        # Vite configuration
└── README.md                 # This file
```

## Important Guidelines

### ✅ Do's
- Write clean, readable code
- Add tests for your changes
- Update documentation
- Keep commits atomic and logical
- Follow existing code style
- Comment complex logic
- Test locally before pushing

### ❌ Don'ts
- Don't commit sensitive data (API keys, passwords)
- Don't include large binary files
- Don't break existing functionality
- Don't mix multiple features in one PR
- Don't skip tests
- Don't commit to main directly

## Reporting Issues

When reporting bugs:
1. Describe the issue clearly
2. Include steps to reproduce
3. Provide error messages/logs
4. Specify your environment (OS, Python version, etc.)
5. Share minimal code example if applicable

## Feature Requests

When suggesting features:
1. Explain the use case
2. Describe how it should work
3. Consider backward compatibility
4. Check if similar features exist

## Performance Considerations

- Keep API responses <200ms
- Optimize database queries
- Use async/await properly
- Minimize frontend bundle size
- Cache where appropriate

## Documentation

- Update README for user-facing changes
- Add docstrings to Python functions
- Comment complex algorithms
- Include usage examples
- Keep CHANGELOG updated

## Questions?

- Check existing GitHub issues
- Review documentation
- Ask in issue discussions
- Create a discussion thread

Thank you for contributing to Meeting Intelligence Hub! 🚀
