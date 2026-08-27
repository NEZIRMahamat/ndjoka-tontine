from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_returns_api_name() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "description": "Ndjoka Tontine API",
        "version": "0.1.0",
        "documentation": "/docs",
    }


def test_health_returns_ok() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
