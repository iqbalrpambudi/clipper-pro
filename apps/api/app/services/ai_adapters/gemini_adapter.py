from typing import Optional
from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter


class GeminiAdapter(OpenAICompatibleAdapter):
    def __init__(
        self,
        api_key: Optional[str],
        chat_model: str = "gemini-2.0-flash",
        vision_model: str = "gemini-2.0-flash",
        embedding_model: str = "text-embedding-004",
        base_url: Optional[str] = None,
    ):
        target_base = base_url or "https://generativelanguage.googleapis.com/v1beta/openai"
        super().__init__(
            base_url=target_base,
            api_key=api_key,
            chat_model=chat_model,
            vision_model=vision_model,
            embedding_model=embedding_model,
        )
