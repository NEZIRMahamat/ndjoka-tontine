# Infrastructure PostgreSQL

Ce dossier démarre PostgreSQL 17 pour le développement local et, à la demande,
une seconde instance éphémère réservée aux tests d'intégration. Le backend
FastAPI et le frontend Vite continuent de s'exécuter directement sur la machine.
Il documente également la base PostgreSQL gérée sur AWS RDS et l'application de
ses migrations Alembic. Le fichier Compose reste exclusivement local : il ne
doit pas être déployé sur Render.

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

## Déployer PostgreSQL sur AWS RDS

Utilisez une instance RDS PostgreSQL dans une région proche de l'hébergement du
backend. Les identifiants du fichier local `infra/.env` ne sont pas réutilisés
en production.

Configurez le Security Group RDS pour autoriser TCP `5432` depuis le backend
Render et, temporairement, depuis votre IP publique afin d'exécuter Alembic.
Dans les variables d'environnement du Web Service FastAPI, configurez :

```dotenv
DATABASE_URL=postgresql+asyncpg://<utilisateur>:<mot-de-passe-encode>@<hote-rds>:5432/ndjoka_db?ssl=require
```

Le backend accepte les schémas `postgres://` et `postgresql://`, les convertit
vers `postgresql+asyncpg://` et adapte le paramètre `sslmode` pour `asyncpg`.
Ne placez jamais cette URL dans `.env.example`, Git, une capture d'écran ou un
ticket : elle contient les identifiants de la base.

## Migrer PostgreSQL AWS RDS avec Alembic

Les migrations sont lancées explicitement depuis le poste local. Une commande
Alembic lancée sans configuration explicite de
l'environnement utilise `backend/.env.dev` et migre donc PostgreSQL Docker
local, pas RDS.

Avant la migration, poussez et synchronisez la version du code contenant les
nouvelles révisions Alembic. Autorisez temporairement l'adresse IP du poste si
la configuration réseau Render le demande.

### Méthode principale : `APP_ENV=prod`

`backend/.env.prod` contient déjà l'URL RDS dans `DATABASE_URL`. Il suffit donc
de sélectionner cet environnement. Depuis `backend/`, sous zsh :

```zsh
uv sync --locked

nc -vz <hote-rds> 5432

export APP_ENV=prod
uv run --no-sync alembic current
uv run --no-sync alembic upgrade head
uv run --no-sync alembic current
uv run --no-sync alembic check
unset APP_ENV
```

La commande `nc -vz` vérifie au préalable que le poste atteint bien le port
PostgreSQL RDS avant de lancer Alembic. Si elle reste bloquée ou affiche un
timeout, vérifiez la route réseau et le Security Group RDS.

### Méthode de secours : saisie manuelle de l'URL

Si `backend/.env.prod` n'est pas disponible sur le poste, ou pour cibler une
URL différente sans modifier ce fichier, saisissez-la sans qu'elle soit
affichée ni inscrite dans l'historique du terminal :

```zsh
cd backend
read -s "DATABASE_URL?Collez l'External Database URL Render : "
echo
export DATABASE_URL

uv run --no-sync alembic upgrade head
uv run --no-sync alembic current
uv run --no-sync alembic check

unset DATABASE_URL
```

La valeur collée après `read -s` reste invisible et n'est pas inscrite dans la
ligne de commande. Il ne faut pas remplacer le texte de la question par l'URL :
exécutez d'abord `read -s`, collez l'URL lorsque le terminal la demande, puis
appuyez sur Entrée.

### Méthode de secours : accès externe indisponible

Si `nc -vz` échoue durablement depuis le poste (accès externe bloqué), lancez
la migration une seule fois via le Start Command du Web Service Render, qui
utilise l'Internal Database URL sur le réseau privé Render :

```bash
uv run --no-sync alembic upgrade head && uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Déclenchez un déploiement manuel, vérifiez dans les logs que les révisions
s'appliquent jusqu'à la tête attendue, puis restaurez immédiatement le Start
Command habituel :

```bash
uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Cette méthode reste ponctuelle : ne laissez pas Alembic dans la commande de
démarrage de façon permanente.

Pour la version `0.7.0`, `alembic current` doit afficher :

```text
e64ca02b8d39 (head)
```

`alembic check` doit ensuite afficher :

```text
No new upgrade operations detected.
```

Cette tête inclut `c42a8e0f6b17` (cycles et tours), puis `d53b9f1a7c28`
(cotisations), puis `e64ca02b8d39` (versements manuels du Sprint 6).
La migration ne génère pas les versements des anciens cycles : après
redéploiement, un owner/manager utilise `POST .../cycles/{cycle_id}/payouts/generate`
pour les cycles actifs ou terminés. Voir le
[contrat Sprint 6](../backend/app/modules/payouts/README.md).

Si l'une des commandes échoue, ne redéployez pas le backend avant d'avoir
identifié la cause. N'exécutez jamais `alembic downgrade`, ne supprimez aucune
table et ne réinitialisez pas la base distante pour corriger une migration sans
procédure de sauvegarde et validation explicite.

Après une migration réussie :

1. vérifiez que le Web Service utilise toujours l'Internal Database URL ;
2. redéployez FastAPI avec la même version du code que celle utilisée par
   Alembic ;
3. contrôlez `/api/v1/health`, puis une route utilisant PostgreSQL telle que
   `/api/v1/me` avec un Access Token valide ;
4. retirez l'autorisation IP externe devenue inutile ;
5. vérifiez que `DATABASE_URL` n'est plus exportée dans le terminal avec
   `[[ -z ${DATABASE_URL:-} ]] && echo "DATABASE_URL supprimée"`.

Le Web Service ne lance volontairement pas Alembic dans sa commande de
démarrage : cela évite une modification concurrente du schéma à chaque
redémarrage ou réveil Render. Si une offre Render disposant d'une commande de
pré-déploiement est utilisée plus tard, la migration pourra y être exécutée
avec :

```bash
uv run --no-sync alembic upgrade head
```
