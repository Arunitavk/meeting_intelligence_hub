from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Meeting Intelligence Hub API"
    DATABASE_URL: str = "postgresql+asyncpg://admin:adminpassword@localhost:5432/meeting_hub"
    
    class Config:
        env_file = ".env"

settings = Settings()
