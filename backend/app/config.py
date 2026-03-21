from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://myarchive:myarchive@db:5432/myarchive"
    claude_api_key: str = ""
    gemini_api_key: str = ""
    openai_api_key: str = ""
    backend_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
