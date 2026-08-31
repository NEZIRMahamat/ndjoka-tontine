# Infrastructure locale

Ce dossier démarre PostgreSQL 17 pour le développement local et, à la demande,
une seconde instance éphémère réservée aux tests d'intégration. Le backend
FastAPI et le frontend Vite continuent de s'exécuter directement sur la machine.

## Configuration

Depuis `infra/`, créez au besoin la configuration locale :

```bash
cp .env.example .env
```

Modifiez ensuite `POSTGRES_PASSWORD` dans `.env`. Ce fichier est ignoré par Git
et ne doit jamais être versionné. Le port hôte par défaut est `5433`, car le
port PostgreSQL standard `5432` peut déjà être occupé sur la machine. Dans le
conteneur, PostgreSQL écoute toujours sur `5432`.

## Démarrage et vérification

```bash
docker compose up -d
docker compose ps
docker compose exec postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SHOW server_version;"'
```

Le service doit apparaître avec l'état `healthy` et la dernière commande doit
retourner une version majeure `17`.

## PostgreSQL éphémère pour les tests

Le profil Compose `test` démarre une instance totalement séparée :

```bash
docker compose --profile test up -d postgres_test
docker compose --profile test ps postgres_test
```

Elle écoute uniquement sur `127.0.0.1:5434`, utilise la base et le rôle
`ndjoka_test`, et conserve ses données dans un `tmpfs`. Les identifiants fixes
du service sont exclusivement locaux et ne doivent jamais être réutilisés dans
un environnement distant.

Depuis `backend/`, lancez ensuite :

```bash
TEST_DATABASE_URL=postgresql+asyncpg://ndjoka_test:ndjoka_test@127.0.0.1:5434/ndjoka_test \
  uv run pytest -m integration -v
```

Pour arrêter et supprimer uniquement ce conteneur, sans toucher à PostgreSQL de
développement :

```bash
docker compose --profile test stop postgres_test
docker compose --profile test rm -f postgres_test
```

La suppression du conteneur efface son `tmpfs`. La base de développement, son
conteneur `postgres` et le volume `postgres_data` ne sont pas concernés.

Pour consulter les journaux :

```bash
docker compose logs postgres
```

Pour arrêter PostgreSQL tout en conservant les données :

```bash
docker compose down
```

Les données sont persistées dans le volume Docker `postgres_data`. La commande
`docker compose down -v` supprime définitivement ce volume et ne doit être
utilisée que pour réinitialiser volontairement la base locale.
