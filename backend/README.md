# Backend Ndjoka Tontine

Backend FastAPI de Ndjoka Tontine, version 0.2.0. Il valide les Access Tokens
Auth0, provisionne les profils locaux dans PostgreSQL et applique les statuts
et rôles globaux de la plateforme. Auth0 reste responsable de
l'authentification ; PostgreSQL conserve les données métier du profil.

## Prérequis

- Python 3.13.12, fixé dans `.python-version`
- [uv](https://docs.astral.sh/uv/)
- PostgreSQL 17 démarré depuis `../infra/`

## Installation

Initialisez d'abord `../infra/.env` à partir de `../infra/.env.example`, adaptez
`POSTGRES_PASSWORD`, puis démarrez PostgreSQL comme indiqué dans
`../infra/README.md`. La valeur utilisée dans `DATABASE_URL` doit contenir le
même mot de passe.

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
- `GET /api/v1/me` retourne le profil PostgreSQL courant ;
- `PATCH /api/v1/me` modifie les champs éditables du profil ;
- `POST /api/v1/me/deactivate` désactive logiquement le compte courant ;
- `/api/v1/admin/users` expose la consultation et l'administration des
  utilisateurs selon le rôle global ;
- `GET /docs` ouvre la documentation interactive OpenAPI.

## Vérifications

```bash
uv run pytest -m "not integration"
uv run ruff check app tests
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
CORS_ALLOWED_ORIGINS=["http://localhost:5173","https://app.ndjoka-tontine.com"]
DATABASE_URL=postgresql+asyncpg://ndjoka_postgres_admin:change-me-for-local-development@127.0.0.1:5433/ndjoka_db
```

`AUTH0_DOMAIN` ne doit contenir ni `https://` ni barre finale. L'audience doit
correspondre exactement à l'Identifier de la Custom API Auth0.
Les origines CORS sont une liste JSON explicite ; n'utilisez pas `*` pour une
route recevant un Bearer Token. Le middleware accepte `GET`, `PATCH`, `POST`
et les en-têtes `Authorization` et `Content-Type`, y compris leurs requêtes
préliminaires `OPTIONS`.

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
domaine public personnalisé du frontend. Ne configurez aucun Client Secret
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

Pour la version 0.2.0, `alembic current` doit afficher
`3b9f4c2a7d11 (head)` et `alembic check` doit indiquer qu'aucune nouvelle
opération n'est détectée.
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

## Utilisateurs, statuts et rôles

Le contrat détaillé du module est versionné dans
[`app/modules/users/README.md`](app/modules/users/README.md). Les principes à
retenir sont :

- `auth0_sub` est l'identité canonique, unique, exacte et immuable ;
- une identité inconnue crée un utilisateur `active` avec le rôle `user` ;
- l'e-mail est synchronisé depuis Auth0 lorsque l'Access Token expose le claim
  `email`, mais aucune route de profil ne permet de le modifier ;
- `INSERT ... ON CONFLICT DO NOTHING` empêche les doublons lors de deux
  premières connexions simultanées ;
- les mots de passe, tokens et secrets Auth0 ne sont jamais stockés localement ;
- un compte `suspended` ou `deactivated` reçoit `403` sur les routes
  authentifiées, même avec un JWT valide.

Les champs de profil éditables par leur propriétaire sont `display_name`,
`avatar_url`, `locale` et `timezone`. Les valeurs initiales sont `fr` et
`Europe/Paris`. La désactivation personnelle est logique et renseigne
`deactivated_at` sans supprimer la ligne. Une réactivation administrative
conserve cette date comme historique ; chaque nouvelle désactivation la met à
jour.

Les rôles globaux ont une portée limitée :

- `user` gère son propre profil ;
- `support` peut aussi consulter les utilisateurs et leur liste paginée ;
- `platform_admin` peut en plus modifier le statut ou le rôle global d'un
  autre utilisateur ; sa propre modification administrative est refusée.

Les rôles propres aux tontines ne font pas partie de ce module. Le profil
exclut également le téléphone, les données KYC, bancaires et de paiement.

## Contrat HTTP utilisateurs

| Méthode et route | Accès | Résultat |
| --- | --- | --- |
| `GET /api/v1/me` | Compte actif | Profil courant complet |
| `PATCH /api/v1/me` | Compte actif | Mise à jour des seuls champs éditables |
| `POST /api/v1/me/deactivate` | Compte actif | Désactivation logique du compte courant |
| `GET /api/v1/admin/users` | `support`, `platform_admin` | Liste paginée et filtrable |
| `GET /api/v1/admin/users/{user_id}` | `support`, `platform_admin` | Détail d'un utilisateur |
| `PATCH /api/v1/admin/users/{user_id}/status` | `platform_admin` | Changement de statut |
| `PATCH /api/v1/admin/users/{user_id}/role` | `platform_admin` | Changement de rôle global |

La liste utilise `limit` (1 à 100, défaut 50) et `offset` (minimum 0, défaut 0),
ainsi que les filtres query optionnels `status` et `global_role`. Elle retourne
`items`, `total`, `limit` et `offset`. Les erreurs suivent le contrat suivant :
`401` sans authentification valide, `403` pour un compte bloqué, un rôle
insuffisant ou une tentative de modifier administrativement son propre compte,
`404` pour un UUID utilisateur inconnu et `422` pour une charge utile ou un
paramètre invalide.

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

La première migration crée la table locale `users`. La révision Sprint 1
`3b9f4c2a7d11` ajoute le profil, le rôle global et la désactivation logique.
Elle convertit `pending` en `suspended` et `closed` en `deactivated`, puis
installe les contraintes correspondant aux valeurs du contrat v0.2.0. Aucune
migration ne contient de secret d'authentification : Auth0 reste responsable
des mots de passe et des facteurs d'authentification.

Après la migration et la première connexion du mainteneur, le premier
`platform_admin` doit être désigné explicitement par son `auth0_sub` exact.
Cette opération ponctuelle est détaillée dans `../DEPLOYMENT.md` et doit
afficher `UPDATE 1`. Ne jamais attribuer ce rôle à partir d'un e-mail seul.

Pour une future évolution du schéma :

```bash
uv run alembic revision --autogenerate -m "description de la migration"
```

La migration générée doit toujours être relue avant d'exécuter
`uv run alembic upgrade head`. N'utilisez pas `Base.metadata.create_all()` :
le schéma doit rester intégralement reproductible depuis les révisions Alembic.
