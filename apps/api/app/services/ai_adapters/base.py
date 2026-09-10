from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any


class BaseLLMAdapter(ABC):
    @abstractmethod
    async def generate_chat(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_mode: bool = False,
    ) -> str:
        """Generate text from chat model."""
        pass

    @abstractmethod
    async def analyze_vision(
        self,
        image_paths: List[str],
        prompt: str,
    ) -> Dict[str, Any]:
        """Analyze 1-3 keyframe images and return description + tags."""
        pass

    @abstractmethod
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate 768-dim embedding vector for text."""
        pass
