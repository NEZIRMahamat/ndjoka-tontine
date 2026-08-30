# Backend Ndjoka Tontine

Backend FastAPI de Ndjoka Tontine. Il expose les routes publiques de base et la
route protégée `/api/v1/me`, adossée au validateur des Access Tokens Auth0.
La couche PostgreSQL asynchrone est configurée, mais aucune route ne l'utilise
encore.

## Prérequis

- Python 3.13.12, fixé dans `.python-version`
- [uv](https://docs.astral.sh/uv/)
- PostgreSQL 17 démarré depuis `../infra/`

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
DATABASE_URL=postgresql+asyncpg://ndjoka_postgres_admin:change-me-for-local-development@127.0.0.1:5433/ndjoka_db
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

`DATABASE_URL` utilise le pilote asynchrone `asyncpg`. Les caractères spéciaux
du mot de passe doivent être encodés dans l'URL. La configuration de la base,
le moteur et la fabrique de sessions sont chargés paresseusement : les routes
actuelles restent disponibles même si PostgreSQL n'est pas encore configuré
sur Render. Les écritures devront valider explicitement leur transaction ; la
dépendance de session n'effectue aucun commit automatique.

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

## Migrations de schéma

Alembic est l'unique mécanisme de modification du schéma PostgreSQL. Depuis
`backend/`, les commandes courantes sont :

```bash
uv run alembic current
uv run alembic history
uv run alembic upgrade head
uv run alembic check
```

La configuration utilise `DATABASE_URL` et `Base.metadata`, sans conserver
d'identifiant dans `alembic.ini`. Elle crée une connexion asynchrone dédiée à
chaque exécution, distincte du moteur de l'application.

À ce stade, `heads`, `history` et `current` n'affichent encore aucune révision :
NDJ-16 initialise seulement l'infrastructure. La première migration sera créée
avec la table `users` dans NDJ-17. Pour une future évolution du schéma :

```bash
uv run alembic revision --autogenerate -m "description de la migration"
```

La migration générée doit toujours être relue avant d'exécuter
`uv run alembic upgrade head`. N'utilisez pas `Base.metadata.create_all()` :
le schéma doit rester intégralement reproductible depuis les révisions Alembic.
