# Backend Ndjoka Tontine

Backend FastAPI de Ndjoka Tontine. Il expose les routes publiques de base et la
route protégée `/api/v1/me`, adossée au validateur des Access Tokens Auth0 et
au profil utilisateur conservé dans PostgreSQL. La couche PostgreSQL asynchrone
est utilisée par cette route pour retrouver ou créer l'utilisateur local.

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
- `GET /api/v1/me` retourne l'identité Auth0, les permissions du token et le
  profil PostgreSQL du porteur d'un Access Token valide ;
- `GET /docs` ouvre la documentation interactive OpenAPI.

## Vérifications

```bash
uv run pytest -m "not integration"
uv run ruff check .
uv run ruff format --check .
```

Les tests rapides n'ouvrent aucune connexion vers PostgreSQL ou Auth0.

## Tests d'intégration PostgreSQL

Démarrez d'abord le service éphémère décrit dans `../infra/README.md`, puis
exécutez depuis `backend/` :

```bash
TEST_DATABASE_URL=postgresql+asyncpg://ndjoka_test:ndjoka_test@127.0.0.1:5434/ndjoka_test \
  uv run pytest -m integration -v
```

Pour lancer les tests unitaires et PostgreSQL ensemble :

```bash
TEST_DATABASE_URL=postgresql+asyncpg://ndjoka_test:ndjoka_test@127.0.0.1:5434/ndjoka_test \
  uv run pytest -v
```

La fixture applique `alembic upgrade head`, puis vide uniquement la table
`users` de la base de test avant et après chaque scénario. Par sécurité, elle
refuse toute URL qui ne cible pas exactement l'utilisateur et la base
`ndjoka_test` sur une adresse locale et le port `5434`. Sans
`TEST_DATABASE_URL`, les tests marqués `integration` sont simplement ignorés.

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
publiques restent disponibles même si PostgreSQL n'est pas encore configuré
sur Render, mais `/api/v1/me` exige désormais la base. Les écritures doivent
valider explicitement leur transaction ; la dépendance de session n'effectue
aucun commit automatique. Les schémas Render `postgres://` et `postgresql://`
sont convertis automatiquement en `postgresql+asyncpg://`. Pour une connexion
externe, `sslmode=<mode>` est également converti en `ssl=<mode>`, paramètre
attendu par SQLAlchemy avec `asyncpg`.

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
Auth0 pour cette API. Ajoutez enfin :

```text
DATABASE_URL=<Internal Database URL de instance-postgres-ndjoka>
```

Le Web Service et PostgreSQL doivent être dans la même région. Utilisez l'URL
interne Render pour l'application ; l'URL externe, plus exposée et plus lente,
est réservée à une migration ponctuelle depuis un poste autorisé.

Le Pre-Deploy Command n'est pas disponible sur le Web Service Free. Ne placez
pas Alembic dans les commandes Build ou Start : depuis `backend/`, appliquez
chaque migration avec l'External Database URL saisie sans affichage :

```zsh
read -s "DATABASE_URL?Collez l'External Database URL Render : "
echo
export DATABASE_URL
uv run --no-sync alembic upgrade head
uv run --no-sync alembic current
uv run --no-sync alembic check
unset DATABASE_URL
```

Pour NDJ-21, `alembic current` doit afficher `d94b607046b8 (head)` et
`alembic check` doit indiquer qu'aucune nouvelle opération n'est détectée.
Retirez ensuite l'accès réseau externe devenu inutile, configurez l'URL interne
dans le Web Service et redéployez. La procédure distante complète et les
limites de l'offre Free sont détaillées dans `../DEPLOYMENT.md`.

## Validation Auth0

Le validateur vérifie :

- l'algorithme RS256 ;
- la signature avec la clé correspondant au `kid` du JWT ;
- l'issuer du tenant Auth0 ;
- l'audience de la Custom API ;
- les claims obligatoires, dont l'expiration.

Les tests génèrent leurs propres clés RSA et leurs JWT en mémoire. Ils ne
contactent jamais le tenant Auth0.

## Liaison avec l'utilisateur local

Le module `app/modules/users/` sait désormais relier le claim `sub` d'un token
Auth0 validé à une ligne PostgreSQL :

- la recherche conserve le `sub` exact, sans le découper ni le normaliser ;
- une identité inconnue crée un utilisateur `active` avec un e-mail encore nul ;
- `auth0_sub` reste la seule identité canonique et unique ;
- `INSERT ... ON CONFLICT DO NOTHING` empêche les doublons lors de deux
  premières connexions simultanées ;
- une reconnexion ne modifie ni l'e-mail ni le statut métier existants.

La dépendance `get_current_ndjoka_user` compose le token validé et la session
SQLAlchemy. La route `/api/v1/me` l'utilise : à la première requête authentifiée,
elle crée l'utilisateur local si nécessaire, puis retourne son UUID, son
`auth0_sub` sous le nom `sub`, son e-mail éventuel, son statut et ses timestamps.
Les permissions restent issues de l'Access Token validé et aucun mot de passe
Auth0 n'est stocké dans PostgreSQL.

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

La première migration crée la table locale `users` avec un UUID, l'identifiant
canonique `auth0_sub`, un e-mail optionnel, un statut et des timestamps. Elle ne
contient aucun secret d'authentification : Auth0 reste responsable des mots de
passe et des facteurs d'authentification. Pour une future évolution du schéma :

```bash
uv run alembic revision --autogenerate -m "description de la migration"
```

La migration générée doit toujours être relue avant d'exécuter
`uv run alembic upgrade head`. N'utilisez pas `Base.metadata.create_all()` :
le schéma doit rester intégralement reproductible depuis les révisions Alembic.
