# Backend Ndjoka Tontine

Premier jalon du backend FastAPI. Il expose uniquement les routes publiques de
base et n'utilise encore ni Auth0 ni PostgreSQL.

## Prérequis

- Python 3.12 ou supérieur
- [uv](https://docs.astral.sh/uv/)

## Installation

Depuis le dossier `backend/` :

```bash
uv sync
```

Cette commande crée l'environnement virtuel local et installe les dépendances
verrouillées dans `uv.lock`.

## Lancement local

```bash
uv run uvicorn app.main:app --reload
```

L'API est alors disponible sur `http://127.0.0.1:8000` :

- `GET /` présente l'API ;
- `GET /api/v1/health` vérifie son état ;
- `GET /docs` ouvre la documentation interactive OpenAPI.

## Vérifications

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

## Variables d'environnement

Aucune variable d'environnement n'est nécessaire pour ce premier jalon. Le
fichier `.env.example` sera enrichi au prochain jalon avec les valeurs publiques
nécessaires à la validation Auth0, sans secret réel.
