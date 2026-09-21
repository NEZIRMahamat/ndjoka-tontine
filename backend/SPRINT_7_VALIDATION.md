# Validation Sprint 7 — Audit métier

Version cible : `0.8.0`. Révision Alembic : `f75db14c9a20`.

## Contrôles locaux

Depuis `backend/` :

```bash
uv run ruff check app tests
uv run ruff format --check app tests
uv run pytest -m "not integration" -v
```

Pour inclure PostgreSQL éphémère :

```bash
cd ../infra
docker compose --profile test up -d postgres_test
cd ../backend
TEST_DATABASE_URL=postgresql+asyncpg://ndjoka_test:ndjoka_test@127.0.0.1:5434/ndjoka_test \
  uv run pytest -v
```

La suite couvre le trigger d'immuabilité, le rollback atomique, l'idempotence,
les listes blanches, les événements système, les rôles, l'isolation, les
filtres et le curseur.

## Migration distante

Suivre `../DEPLOYMENT.md` en ciblant explicitement PostgreSQL RDS. Après
`alembic upgrade head`, les résultats attendus sont :

```text
f75db14c9a20 (head)
No new upgrade operations detected.
```

La migration, le redéploiement Render, la recette distante et le tag `v0.8.0`
restent à exécuter par le mainteneur. Aucun secret ne doit être ajouté au dépôt.

## Recette distante

1. Vérifier `/api/v1/health`, `/openapi.json` et la version `0.8.0`.
2. Envoyer un `X-Request-ID` UUID lors d'une mutation métier.
3. Lire l'événement correspondant dans `/api/v1/me/audit-events` ou dans
   l'historique de la tontine et comparer son `request_id`.
4. Vérifier le curseur avec `limit=1`, puis les filtres `event_name`, ressource
   et dates UTC.
5. Vérifier les vues owner, manager, treasurer, member et platform admin, ainsi
   que les refus d'un compte désactivé et d'une autre tontine.
6. Ne jamais tester avec des tokens, secrets ou données bancaires réels dans
   les champs métier.
