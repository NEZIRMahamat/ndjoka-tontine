# Backend Ndjoka Tontine

Backend FastAPI de Ndjoka Tontine. Il expose actuellement les routes publiques
de base et contient le validateur des Access Tokens Auth0. La première route
protégée sera ajoutée dans le ticket NDJ-7. PostgreSQL n'est pas encore utilisé.

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

Complétez `.env.dev` à partir de `.env.example` :

```dotenv
AUTH0_DOMAIN=your-tenant.eu.auth0.com
AUTH0_AUDIENCE=https://api.ndjoka-tontine.com
```

`AUTH0_DOMAIN` ne doit contenir ni `https://` ni barre finale. L'audience doit
correspondre exactement à l'Identifier de la Custom API Auth0.

Le backend charge `.env.dev` par défaut. Pour sélectionner `.env.prod`, lancez
le processus avec `APP_ENV=prod`. Les variables système restent prioritaires,
notamment lors du déploiement sur Render.

Aucun Client ID ou Client Secret n'est requis pour valider un Access Token
RS256. Le backend récupère uniquement les clés publiques JWKS d'Auth0.

## Validation Auth0

Le validateur vérifie :

- l'algorithme RS256 ;
- la signature avec la clé correspondant au `kid` du JWT ;
- l'issuer du tenant Auth0 ;
- l'audience de la Custom API ;
- les claims obligatoires, dont l'expiration.

Les tests génèrent leurs propres clés RSA et leurs JWT en mémoire. Ils ne
contactent jamais le tenant Auth0.
