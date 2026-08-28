# Backend Ndjoka Tontine

Backend FastAPI de Ndjoka Tontine. Il expose les routes publiques de base et la
route protégée `/api/v1/me`, adossée au validateur des Access Tokens Auth0.
PostgreSQL n'est pas encore utilisé.

## Prérequis

- Python 3.13.12, fixé dans `.python-version`
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
- `GET /api/v1/me` retourne l'identité et les permissions du porteur d'un Access Token Auth0 valide ;
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
CORS_ALLOWED_ORIGINS=["http://localhost:5173","https://ndjoka-tontine.vercel.app"]
```

`AUTH0_DOMAIN` ne doit contenir ni `https://` ni barre finale. L'audience doit
correspondre exactement à l'Identifier de la Custom API Auth0.
Les origines CORS sont une liste JSON explicite ; n'utilisez pas `*` pour une
route recevant un Bearer Token.

Le backend charge `.env.dev` par défaut. Pour sélectionner `.env.prod`, lancez
le processus avec `APP_ENV=prod`. Les variables système restent prioritaires,
notamment lors du déploiement sur Render.

Aucun Client ID ou Client Secret n'est requis pour valider un Access Token
RS256. Le backend récupère uniquement les clés publiques JWKS d'Auth0.

## Préparation Render

Créez un service Web Python avec `backend` comme répertoire racine, puis
utilisez :

```text
Build Command: uv sync --locked --no-dev
Start Command: uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /api/v1/health
```

Render fournit dynamiquement la variable `PORT`. Configurez aussi dans le
service `APP_ENV=prod`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` et
`CORS_ALLOWED_ORIGINS`. Cette dernière doit rester une liste JSON et contenir le
domaine Vercel réellement attribué au projet. Ne configurez aucun Client Secret
Auth0 pour cette API.

## Validation Auth0

Le validateur vérifie :

- l'algorithme RS256 ;
- la signature avec la clé correspondant au `kid` du JWT ;
- l'issuer du tenant Auth0 ;
- l'audience de la Custom API ;
- les claims obligatoires, dont l'expiration.

Les tests génèrent leurs propres clés RSA et leurs JWT en mémoire. Ils ne
contactent jamais le tenant Auth0.
