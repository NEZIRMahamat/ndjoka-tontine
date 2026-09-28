# Backend Ndjoka Tontine

API FastAPI de la plateforme Ndjoka Tontine. Auth0 authentifie les
utilisateurs ; PostgreSQL conserve les données métier. Aucun paiement réel
n'est exécuté : cotisations et versements sont déclaratifs.

## Stack

- Python 3.13 (`.python-version`), gestion des dépendances avec [uv](https://docs.astral.sh/uv/)
- FastAPI, SQLAlchemy 2 asynchrone (`asyncpg`), Alembic, Pydantic
- PostgreSQL 17, démarré via `../infra/` (voir [infra/README.md](../infra/README.md))
- Resend pour les e-mails, Groq pour l'assistant Ndjoka AI

## Démarrage local

```bash
cp .env.example .env.dev      # puis compléter les valeurs
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

L'API écoute sur `http://127.0.0.1:8000`. La documentation interactive est
sur `/docs`, le contrôle de santé sur `/api/v1/health`.

## Configuration

Le fichier `.env.dev` est chargé par défaut ; `APP_ENV=prod` charge
`.env.prod`. Les variables système restent prioritaires (Render).

| Variable | Rôle |
| --- | --- |
| `AUTH0_DOMAIN` | Domaine du tenant, sans `https://` ni barre finale |
| `AUTH0_AUDIENCE` | Identifier exact de la Custom API Auth0 |
| `CORS_ALLOWED_ORIGINS` | Liste JSON des origines frontend autorisées, jamais `*` |
| `DATABASE_URL` | URL PostgreSQL ; `postgres://` et `sslmode=` sont convertis pour `asyncpg` |
| `EMAIL_PROVIDER` | `console` en local, `resend` en production |
| `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_CONTACT_ADDRESS`, `EMAIL_REPLY_TO` | Expéditeur des e-mails |
| `FRONTEND_BASE_URL` | Base des liens insérés dans les e-mails |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Secrets Resend |
| `GROQ_API_KEY`, `GROQ_AGENT_MODEL`, `GROQ_MODERATOR_MODEL`, `AI_HISTORY_LIMIT` | Assistant Ndjoka AI (défauts : `openai/gpt-oss-120b` et `openai/gpt-oss-20b`) |

Aucun Client Secret Auth0 n'est nécessaire : les tokens RS256 sont validés
avec les clés publiques JWKS du tenant. Les secrets ne sont jamais versionnés.

## Architecture

```text
app/
  api/          agrégation des routeurs sous /api/v1
  core/         configuration, validation Auth0, contexte de requête
  db/           moteur, sessions, registre des modèles
  modules/      domaines métier (models, schemas, repositories, services, routes)
  ai/           assistant Ndjoka AI
  workers/      traitement de l'Outbox des notifications
  jobs/         tâches planifiées
alembic/        migrations du schéma
tests/          tests unitaires et d'intégration PostgreSQL
```

| Module | Responsabilité |
| --- | --- |
| [users](app/modules/users/README.md) | Profil, statut et rôle global des comptes |
| [tontines](app/modules/tontines/README.md) | Création, modification, visibilité et archivage |
| [memberships](app/modules/memberships/README.md) | Rôles internes, invitations, adhésions |
| [cycles](app/modules/cycles/README.md) | Cycles et calendrier des tours |
| [contributions](app/modules/contributions/README.md) | Obligations de cotisation |
| [payouts](app/modules/payouts/README.md) | Versements aux bénéficiaires |
| [profiles](app/modules/profiles/README.md) | Profil d'épargnant et score de fiabilité |
| [discovery](app/modules/discovery/README.md) | Recommandation et adhésion aux tontines ouvertes |
| [audit](app/modules/audit/README.md) | Historique métier immuable |
| [notifications](app/modules/notifications/README.md) | Notifications internes et e-mails |
| [fees](app/modules/fees/README.md) | Barème de commission et simulation des frais |
| [payment_methods](app/modules/payment_methods/README.md) | Moyens de paiement déclarés (référence masquée) |
| [ai](app/ai/README.md) | Assistant conversationnel (contrôle préalable + agent outillé) |

## Conventions

- Les services valident explicitement leur transaction (`commit`, `rollback`
  en cas d'erreur) ; la dépendance de session ne commite jamais.
- Toute mutation sensible écrit un événement d'audit dans la même transaction.
- Une ressource d'une autre tontine renvoie `404`, un rôle insuffisant `403`,
  une transition impossible `409`, une charge invalide `422`.
- Les schémas d'écriture refusent les champs inconnus.
- Les montants utilisent `Decimal` / `NUMERIC(18, 2)` ; les dates sont en UTC.
- Un compte `suspended` ou `deactivated` reçoit `403`, même avec un token valide.

## Tests et qualité

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest -m "not integration"
```

Les tests d'intégration utilisent une base PostgreSQL éphémère :

```bash
docker compose -f ../infra/compose.yaml --profile test up -d postgres_test
TEST_DATABASE_URL=postgresql+asyncpg://ndjoka_test:ndjoka_test@127.0.0.1:5434/ndjoka_test \
  uv run pytest
```

La fixture applique les migrations et vide les données entre chaque scénario.
Elle refuse toute URL qui ne cible pas `ndjoka_test` en local sur le port 5434.
Sans `TEST_DATABASE_URL`, les tests d'intégration sont ignorés.

## Migrations

Alembic est le seul moyen de modifier le schéma ; `create_all()` n'est jamais
utilisé.

```bash
uv run alembic current
uv run alembic upgrade head
uv run alembic check
uv run alembic revision --autogenerate -m "description"
```

- Toute migration générée doit être relue avant application.
- Tout nouveau modèle doit être ajouté à `load_all_models()` dans
  `app/db/models.py`, sinon l'autogénération l'ignore.
- `tests/test_migrations.py` vérifie la révision head et l'absence de dérive
  entre modèles et migrations : le mettre à jour à chaque nouvelle révision.

## Données de démonstration

`app/seed/demo.py` charge un jeu de données cohérent : une soixantaine de
profils fictifs (`demo|…`) aux comportements de paiement contrastés (fiables,
irréguliers, défaillants avec un score sous 50), et une quarantaine de
tontines de 2 à 12 membres couvrant les combinaisons catégorie × rythme ×
ordre de passage × statut (recrutement, planifiée, active, terminée), dont
quatre construites à la main autour du présentateur. Le compte réel passé avec
`--presenter "auth0|xxxx:Nom"` est propriétaire, trésorier ou membre selon la
tontine, avec profil d'épargnant, moyens de paiement et notifications.

`app/seed/reset.py` enchaîne sauvegarde (`pg_dump`, ou export JSON si la
version du serveur diffère), suppression du schéma `public`, `alembic upgrade
head` et chargement de la démo. `--env prod` cible `.env.prod` ; `--no-seed`
laisse une base vide ; `--no-backup` saute la sauvegarde.

```bash
uv run python -m app.seed.reset --env dev --yes
uv run python -m app.seed.reset --env prod --yes --presenter "auth0|xxxx:Nom"
```

Le script de démo refuse de s'exécuter si des données `demo|` existent déjà.

## Déploiement

Render, Web Service Python, répertoire racine `backend` :

```text
Build Command:     uv sync --locked --no-dev
Start Command:     uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /api/v1/health
```

Points d'attention :

- **Migrations** : elles ne sont pas lancées au build. Les appliquer sur
  AWS RDS avant de déployer une version qui en dépend
  ([procédure](../infra/README.md#appliquer-les-migrations)).
- **Tâches planifiées** : le Web Service ne lance ni le worker ni les rappels.
  Un ordonnanceur externe doit exécuter une fois par jour, dans cet ordre :

  ```bash
  uv run python -m app.jobs.contribution_reminders --once
  uv run python -m app.workers.notifications --once
  ```

  puis relancer le worker à intervalle régulier.
- **Premier administrateur** : le rôle `platform_admin` s'attribue par
  `auth0_sub` exact, jamais par e-mail
  ([procédure](../infra/README.md#désigner-le-premier-administrateur)).

Variables Render, Auth0, Resend et vérifications après déploiement :
[README racine](../README.md#production).
