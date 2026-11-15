import json

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.config import get_settings
from app.core.db import Base, get_db
from app.main import app
from app.schemas.config import ProjectDefaultsConfig
from app.services.project_defaults import (
    load_project_defaults,
    reset_project_defaults,
    save_project_defaults,
)


@pytest.fixture
def isolated_config_path(tmp_path, monkeypatch):
    settings = get_settings()
    config_file = tmp_path / "test_storage" / "config.json"
    monkeypatch.setattr(settings, "CONFIG_JSON_PATH", str(config_file))
    return config_file


@pytest.fixture
async def isolated_client(tmp_path, isolated_config_path):
    db_file = tmp_path / "test_defaults.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_file}",
        connect_args={"check_same_thread": False},
    )
    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


def test_load_project_defaults_missing_file_returns_builtins(isolated_config_path):
    config, path, from_file = load_project_defaults()
    assert path == isolated_config_path
    assert from_file is False
    assert config.subtitle.font_family == "Poppins"
    assert config.watermark.text == "@cliperpro"
    assert config.tts.provider == "gemini"
    assert config.tts.voice == "Puck"


def test_load_project_defaults_merges_partial_json(isolated_config_path):
    isolated_config_path.parent.mkdir(parents=True, exist_ok=True)
    isolated_config_path.write_text(
        json.dumps(
            {
                "subtitle": {"font_family": "anton", "font_size": 48},
                "tts": {"voice": "Alnilam", "rate": "+12%", "pitch": "-2Hz"},
            }
        ),
        encoding="utf-8",
    )

    config, _, from_file = load_project_defaults()
    assert from_file is True
    assert config.subtitle.font_family == "Anton"
    assert config.subtitle.font_size == 48
    assert config.subtitle.position == "bottom"
    assert config.tts.voice == "Alnilam"
    assert config.tts.rate == 12
    assert config.tts.pitch == -2


def test_load_project_defaults_invalid_json_behavior(isolated_config_path):
    isolated_config_path.parent.mkdir(parents=True, exist_ok=True)
    isolated_config_path.write_text("{not-valid-json", encoding="utf-8")

    # Non-strict mode falls back safely to built-in defaults
    fallback, _, from_file = load_project_defaults()
    assert from_file is False
    assert fallback.subtitle.font_family == "Poppins"

    # Strict mode raises descriptive ValueError
    with pytest.raises(ValueError, match="Gagal membaca config.json"):
        load_project_defaults(strict=True)


def test_save_and_reset_project_defaults(isolated_config_path):
    custom = ProjectDefaultsConfig.model_validate(
        {
            "subtitle": {"font_family": "Oswald", "font_size": 50},
            "watermark": {"enabled": True, "text": "@toko_ku", "position": "top-left"},
            "tts": {"provider": "gemini", "voice": "Kore", "rate": 5, "pitch": 1},
        }
    )
    saved = save_project_defaults(custom)
    assert saved.subtitle.font_family == "Oswald"
    assert isolated_config_path.exists()

    reset = reset_project_defaults()
    assert reset.subtitle.font_family == "Poppins"
    assert reset.watermark.enabled is False
    assert reset.tts.voice == "Puck"


@pytest.mark.asyncio
async def test_project_defaults_settings_and_project_creation_flow(isolated_client, isolated_config_path):
    # 1. Initial GET returns built-in defaults
    resp = await isolated_client.get("/api/v1/settings/project-defaults")
    assert resp.status_code == 200
    body = resp.json()
    assert body["from_file"] is False
    assert body["subtitle"]["font_family"] == "Poppins"

    # 2. Import partial config.json
    import_resp = await isolated_client.post(
        "/api/v1/settings/project-defaults/import",
        json={
            "subtitle": {"font_family": "bebasneue", "font_size": 52, "position": "center"},
            "watermark": {"enabled": True, "text": "@brand_resmi", "position": "top-right"},
            "tts": {"provider": "gemini", "voice": "Alnilam", "rate": "+10%", "pitch": "-3Hz"},
            "background_fill": {"mode": "cover", "zoom": 2.0},
        },
    )
    assert import_resp.status_code == 200
    imported = import_resp.json()
    assert imported["from_file"] is True
    assert imported["subtitle"]["font_family"] == "Bebas Neue"
    assert imported["watermark"]["enabled"] is True
    assert imported["watermark"]["text"] == "@brand_resmi"
    assert imported["tts"]["voice"] == "Alnilam"
    assert imported["tts"]["rate"] == 10
    assert imported["tts"]["pitch"] == -3
    assert imported["background_fill"]["zoom"] == 2.0  # every section reaches Settings, not just the first four
    get_back = (await isolated_client.get("/api/v1/settings/project-defaults")).json()
    assert get_back["background_fill"] == imported["background_fill"]

    # 3. Export global config.json
    export_resp = await isolated_client.get("/api/v1/settings/project-defaults/export")
    assert export_resp.status_code == 200
    assert "attachment; filename=\"config.json\"" in export_resp.headers.get("content-disposition", "")
    exported_data = export_resp.json()
    assert set(exported_data.keys()) == {"subtitle", "watermark", "tts", "qc", "background_fill"}
    assert exported_data["background_fill"]["mode"] == "cover"
    assert exported_data["subtitle"]["font_family"] == "Bebas Neue"

    # 4. Creating a new project without specifying subtitle/watermark/tts applies config.json defaults
    create_resp = await isolated_client.post(
        "/api/v1/projects",
        json={"name": "Project Auto Default", "language": "id"},
    )
    assert create_resp.status_code == 201
    created_project = create_resp.json()
    project_id = created_project["id"]
    assert created_project["watermark"]["enabled"] is True
    assert created_project["watermark"]["text"] == "@brand_resmi"
    assert created_project["tts_config"]["voice"] == "Alnilam"
    assert created_project["tts_config"]["rate"] == 10
    assert created_project["tts_config"]["pitch"] == -3
    assert created_project["background_fill"]["mode"] == "cover"
    assert created_project["background_fill"]["dynamic_zoom"] is True  # untouched keys keep built-ins

    # 5. Fetching project returns persisted subtitle_style + watermark + tts_config
    get_resp = await isolated_client.get(f"/api/v1/projects/{project_id}")
    assert get_resp.status_code == 200
    detail = get_resp.json()
    assert detail["subtitle_style"]["font_family"] == "Bebas Neue"
    assert detail["subtitle_style"]["font_size"] == 52
    assert detail["subtitle_style"]["position"] == "center"
    assert detail["watermark"]["text"] == "@brand_resmi"
    assert detail["tts_config"]["voice"] == "Alnilam"

    # 6. Export project config.json snapshot
    proj_export_resp = await isolated_client.get(f"/api/v1/projects/{project_id}/config/export")
    assert proj_export_resp.status_code == 200
    proj_exported = proj_export_resp.json()
    assert proj_exported["subtitle"]["font_family"] == "Bebas Neue"
    assert proj_exported["watermark"]["text"] == "@brand_resmi"
    assert proj_exported["tts"]["voice"] == "Alnilam"
    assert proj_exported["background_fill"]["mode"] == "cover"

    # 7. Reset project defaults
    reset_resp = await isolated_client.post("/api/v1/settings/project-defaults/reset")
    assert reset_resp.status_code == 200
    assert reset_resp.json()["subtitle"]["font_family"] == "Poppins"
