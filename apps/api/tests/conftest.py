import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.main import app


@pytest.fixture(autouse=True)
def test_env_setup(tmp_path, monkeypatch):
    """Ensure tests run with safe isolated storage directory."""
    settings = get_settings()
    isolated_storage = tmp_path / "test_storage"
    isolated_storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "STORAGE_PATH", str(isolated_storage))
    return isolated_storage

@pytest.fixture
async def async_client():
    """Async HTTP test client bound to FastAPI ASGI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
