import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    gemini_api_key: str = ""
    anki_connect_url: str = "http://localhost:8765"
    anki_deck_name: str = "NEET/JEE Wrong Questions"
    notion_token: str = ""
    notion_database_id: str = ""
    
    # In-app configuration settings
    database_url: str = ""
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Instantiate settings
settings = Settings()

# Setup default SQLite URL if not provided
if not settings.database_url:
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    data_db_path = os.path.join(backend_dir, "data", "database.db")
    settings.database_url = f"sqlite:///{data_db_path}"
