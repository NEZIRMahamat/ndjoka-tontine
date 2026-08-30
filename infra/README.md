# Infrastructure locale

Ce dossier démarre uniquement PostgreSQL 17 pour le développement local. Le
backend FastAPI et le frontend Vite continuent de s'exécuter directement sur
la machine. FastAPI sera relié à cette base lors du ticket NDJ-15.

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
