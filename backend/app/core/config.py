from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Meeting Intelligence Hub API"
    DATABASE_URL: str = "sqlite+aiosqlite:///./meeting_hub.db"
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-2.0-flash"
    ANTHROPIC_API_KEY: str | None = None

    class Config:
        env_file = ".env"

settings = Settings()
