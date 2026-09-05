import pytest

from app.core.config import CorsSettings


def test_cors_settings_loads_local_and_vercel_origins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS",
        '["http://localhost:5173","https://app.ndjoka-tontine.com"]',
    )

    settings = CorsSettings()

    assert settings.cors_allowed_origins == [
        "http://localhost:5173",
        "https://app.ndjoka-tontine.com",
    ]
