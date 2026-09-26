# Infrastructure

Ce dossier décrit les bases PostgreSQL du projet :

- en développement et en test, des conteneurs Docker définis dans
  `compose.yaml` ;
- en production, une instance AWS RDS.

L'API et le frontend ne sont pas conteneurisés. Ils tournent directement sur
le poste en local, puis sur Render et Vercel en production
([README racine](../README.md#production)).

| Environnement | Base | Adresse | Données |
| --- | --- | --- | --- |
| Développement | Docker `postgres` (PostgreSQL 17) | `127.0.0.1:5433/ndjoka_db` | Volume `postgres_data`, persistant |
| Tests | Docker `postgres_test` (PostgreSQL 17) | `127.0.0.1:5434/ndjoka_test` | En mémoire, perdues à l'arrêt |
| Production | AWS RDS (PostgreSQL 17) | `<endpoint-rds>:5432/ndjoka_db` | Gérées par RDS, connexion TLS |

Les ports sont liés à `127.0.0.1` : les conteneurs ne sont pas exposés sur le
réseau.

## Développement

### Configuration

```bash
cd infra
cp .env.example .env
```

| Variable | Valeur par défaut |
| --- | --- |
| `POSTGRES_DB` | `ndjoka_db` |
| `POSTGRES_USER` | `ndjoka_postgres_admin` |
| `POSTGRES_PASSWORD` | à définir |
| `POSTGRES_PORT` | `5433` (évite un conflit avec un PostgreSQL local sur 5432) |

`DATABASE_URL` dans `backend/.env.dev` doit reprendre ces valeurs :

```text
postgresql+asyncpg://ndjoka_postgres_admin:<mot-de-passe>@127.0.0.1:5433/ndjoka_db
```

### Commandes

À lancer depuis `infra/` :

```bash
docker compose up -d postgres        # démarrer
docker compose ps                    # état (doit afficher healthy)
docker compose logs -f postgres      # journaux
docker compose stop postgres         # arrêter, données conservées
docker compose down                  # supprimer le conteneur, données conservées
```

Se connecter à la base :

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Appliquer les migrations, depuis `backend/` :

```bash
uv run alembic upgrade head
```

Repartir d'une base vide :

```bash
docker compose down -v               # supprime définitivement le volume
docker compose up -d postgres
cd ../backend && uv run alembic upgrade head
```

Le mot de passe n'est lu qu'à la création du volume. Pour le changer, il faut
recréer le volume avec `down -v`.

## Tests

La base de test est isolée de la base de développement. Ses données sont
stockées en mémoire.

```bash
docker compose --profile test up -d postgres_test
```

Depuis `backend/` :

```bash
TEST_DATABASE_URL=postgresql+asyncpg://ndjoka_test:ndjoka_test@127.0.0.1:5434/ndjoka_test \
  uv run pytest -q
```

Arrêter la base de test :

```bash
docker compose --profile test rm -sf postgres_test
```

## Production : AWS RDS

### Configuration

- Moteur : PostgreSQL 17, base `ndjoka_db`, port 5432.
- Connexion chiffrée obligatoire (`ssl=require`).
- Security Group : TCP 5432 ouvert pour Render. L'accès depuis un poste
  (IP `/32`) s'ouvre uniquement pendant une intervention, puis se referme.

URL utilisée par l'API (variable `DATABASE_URL` sur Render) :

```text
postgresql+asyncpg://<utilisateur>:<mot-de-passe>@<endpoint-rds>:5432/ndjoka_db?ssl=require
```

Les caractères spéciaux du mot de passe (`@`, `:`, `/`, `#`, `%`) doivent
être encodés en URL.

Pour les interventions depuis un poste, la même URL est placée dans
`backend/.env.prod`. Ce fichier n'est jamais versionné.

### Vérifier l'accès

```bash
nc -vz <endpoint-rds> 5432
```

En cas d'échec, vérifier que l'IP publique du poste est autorisée dans le
Security Group.

Pour une session `psql`, utiliser le format libpq (sans `+asyncpg`) :

```bash
psql "postgresql://<utilisateur>@<endpoint-rds>:5432/ndjoka_db?sslmode=require"
```

### Appliquer les migrations

Les migrations ne sont pas lancées par le déploiement Render. Il faut les
appliquer avant de pousser une version qui en dépend.

Depuis `backend/`, avec `backend/.env.prod` renseigné :

```bash
uv sync --locked
export APP_ENV=prod
uv run --no-sync alembic current     # révision actuellement appliquée
uv run --no-sync alembic upgrade head
uv run --no-sync alembic current     # doit afficher (head)
uv run --no-sync alembic check       # doit indiquer l'absence d'écart
unset APP_ENV
```

Sans `APP_ENV=prod`, Alembic cible la base Docker locale.

Sans fichier `.env.prod`, passer l'URL de façon ponctuelle, sans l'écrire dans
l'historique du shell :

```bash
read -s "DATABASE_URL?URL AWS RDS : "; echo    # zsh ; en bash : read -rsp "URL AWS RDS : " DATABASE_URL
export DATABASE_URL
uv run --no-sync alembic upgrade head
unset DATABASE_URL
```

Si le poste ne peut pas joindre RDS, préfixer temporairement le Start Command
Render par `uv run --no-sync alembic upgrade head && `, déployer, vérifier les
journaux, puis retirer le préfixe.

Règles :

- ne jamais lancer `alembic downgrade` en production ;
- créer un snapshot RDS avant une migration qui modifie ou supprime des
  données ;
- appliquer les migrations du code qui va être déployé, pas d'une autre
  branche.

### Désigner le premier administrateur

1. Se connecter une fois sur `https://app.ndjoka-tontine.com` pour créer le
   compte en base.
2. Récupérer l'identifiant `auth0_sub` (`auth0|...`) dans Auth0, rubrique
   User Management > Users.
3. Dans `psql` sur la base RDS :

   ```sql
   UPDATE users
   SET global_role = 'platform_admin', updated_at = CURRENT_TIMESTAMP
   WHERE auth0_sub = 'auth0|...';
   ```

   Le résultat attendu est `UPDATE 1`.

Toujours cibler l'utilisateur par `auth0_sub`, jamais par e-mail. Les
administrateurs suivants sont ensuite gérés depuis l'interface.
