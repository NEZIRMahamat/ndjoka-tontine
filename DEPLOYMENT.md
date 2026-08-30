# Premier déploiement de Ndjoka Tontine

Cette procédure décrit le premier déploiement validé de l'application sur
Vercel, Auth0 et Render. Elle couvre aussi le lancement local et les contrôles
à effectuer après une nouvelle mise en ligne.

> État de référence validé le 28 août 2026. PostgreSQL n'est pas encore
> utilisé par cette version.

## Architecture

```mermaid
flowchart LR
    browser[Navigateur]
    frontend[React et Vite<br/>Vercel]
    auth[Auth0<br/>Universal Login]
    backend[FastAPI<br/>Render]

    browser --> frontend
    frontend -->|Connexion| auth
    auth -->|Redirection après authentification| frontend
    frontend -->|Access Token Bearer<br/>GET /api/v1/me| backend
    backend -->|Clés publiques JWKS| auth
```

Le navigateur charge le frontend statique depuis Vercel. Auth0 authentifie
l'utilisateur et remet un Access Token destiné à la Custom API. Le frontend
envoie ensuite ce token à FastAPI. Le backend vérifie sa signature RS256, son
issuer, son audience et son expiration avant de répondre.

## URLs de référence

| Service | Local | Distant |
| --- | --- | --- |
| Frontend | `http://localhost:5173` | `https://ndjoka-tontine.vercel.app` |
| Backend | `http://127.0.0.1:8000` | `https://api-ndjoka-tontine.onrender.com` |
| Documentation OpenAPI | `http://127.0.0.1:8000/docs` | `https://api-ndjoka-tontine.onrender.com/docs` |
| Health check | `http://127.0.0.1:8000/api/v1/health` | `https://api-ndjoka-tontine.onrender.com/api/v1/health` |
| Route protégée | `http://127.0.0.1:8000/api/v1/me` | `https://api-ndjoka-tontine.onrender.com/api/v1/me` |

L'audience Auth0 `https://api.ndjoka-tontine.com` est un identifiant logique.
Ce n'est pas l'URL réseau du backend Render.

## Prérequis

- Python `3.13.12`, fixé dans `backend/.python-version` ;
- [uv](https://docs.astral.sh/uv/) ;
- Node.js `20.20.2` en local, fixé dans `frontend/.nvmrc` ;
- npm 10 ou supérieur.

Le projet accepte aussi les versions récentes de Node et le build Vercel
utilise Node `24.x`. La version locale reste fixée pour reproduire les
vérifications effectuées pendant ce premier déploiement.

## Lancement local

### Backend

Depuis la racine du dépôt :

```bash
cd backend
# Exécuter la copie uniquement si .env.dev n'existe pas déjà.
cp -n .env.example .env.dev
uv sync
uv run uvicorn app.main:app --reload
```

Compléter `.env.dev` avec les valeurs du tenant Auth0 avant le lancement. Le
backend répond alors sur `http://127.0.0.1:8000`.

Contrôles backend :

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest -v
```

### Frontend

Dans un autre terminal, depuis la racine du dépôt :

Si `nvm` est installé, exécuter d'abord `nvm use` dans `frontend/`.

```bash
cd frontend
# Exécuter la copie uniquement si .env.dev n'existe pas déjà.
cp -n .env.example .env.dev
npm ci
npm run dev
```

Compléter `.env.dev`, puis ouvrir `http://localhost:5173`.

Contrôles frontend :

```bash
npm run lint
npm run build
```

Le script `npm run build` utilise le mode Vite `prod`. Pour valider localement
le vrai bundle de production, créer aussi `frontend/.env.prod` s'il n'existe
pas, y configurer les quatre variables `VITE_*`, puis relancer le build. Ce
fichier reste ignoré par Git.

Un changement de variable `VITE_*` sur Vercel n'affecte que les nouveaux
déploiements : il faut redéployer le frontend après la modification.

## Ordre de déploiement

1. Déployer FastAPI sur Render et relever l'URL `onrender.com` réellement
   attribuée.
2. Configurer cette URL dans `VITE_API_BASE_URL`, puis déployer React sur
   Vercel.
3. Relever le domaine Vercel de production réellement attribué.
4. Ajouter ce domaine dans les URLs autorisées de l'application Auth0.
5. Ajouter ce même domaine dans `CORS_ALLOWED_ORIGINS` sur Render.
6. Tester la connexion, la route protégée et la déconnexion depuis le domaine
   Vercel stable.

## Déploiement du backend sur Render

Créer un **Web Service** avec la configuration suivante :

| Réglage | Valeur |
| --- | --- |
| Service | `api-ndjoka-tontine` |
| Branche | `develop` |
| Root Directory | `backend` |
| Runtime | Python |
| Instance | Free |
| Build Command | `uv sync --locked --no-dev` |
| Start Command | `uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/v1/health` |

La version Python est fixée dans `backend/.python-version`. Render fournit la
variable `PORT` ; elle ne doit pas être remplacée par un port fixe.

### Variables Render

```dotenv
APP_ENV=prod
AUTH0_DOMAIN=dev-rjei6nu4xfpxilgo.us.auth0.com
AUTH0_AUDIENCE=https://api.ndjoka-tontine.com
CORS_ALLOWED_ORIGINS=["http://localhost:5173","https://ndjoka-tontine.vercel.app"]
```

`AUTH0_DOMAIN` ne contient ni protocole ni barre finale. La valeur CORS est une
liste JSON, pas une liste CSV. Aucun Client Secret Auth0 n'est nécessaire pour
la validation d'un Access Token RS256.

Après une modification de variable Render, enregistrer les changements et
attendre la fin du nouveau déploiement avant de tester le CORS ou l'API.

## Déploiement du frontend sur Vercel

Importer le même dépôt Git avec la configuration suivante :

| Réglage | Valeur |
| --- | --- |
| Projet | `ndjoka-tontine` |
| Production Branch | `develop` |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Node.js | `24.x` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` (détection automatique via `package-lock.json`) |

Le dépôt contient aussi une branche `main`, mais elle ne contient pas encore
l'application. Tant que cette organisation ne change pas, Vercel et Render
doivent donc suivre `develop`.

### Variables Vercel de production

```dotenv
VITE_AUTH0_DOMAIN=dev-rjei6nu4xfpxilgo.us.auth0.com
VITE_AUTH0_CLIENT_ID=<CLIENT_ID_DE_L_APPLICATION_SPA_AUTH0>
VITE_AUTH0_AUDIENCE=https://api.ndjoka-tontine.com
VITE_API_BASE_URL=https://api-ndjoka-tontine.onrender.com
```

Récupérer le Client ID dans **Auth0 > Applications > Ndjoka Tontine Web >
Settings > Client ID**. Enregistrer les variables pour l'environnement
Production, puis créer un nouveau déploiement Vercel.

Les variables préfixées par `VITE_` sont incorporées au bundle servi au
navigateur et sont donc publiques. Ne jamais y placer de Client Secret, token
privé ou mot de passe. Les fichiers locaux `.env.dev` et `.env.prod` ne doivent
pas être envoyés sur Git.

Les déploiements Preview utilisent un autre domaine. Le flux Auth0 n'est garanti
que sur le domaine de production stable ci-dessus, sauf si chaque domaine de
Preview est explicitement autorisé dans Auth0 et dans le CORS Render.

## Configuration Auth0

Dans l'application **Ndjoka Tontine Web**, de type **Single Page
Application**, conserver localhost et ajouter le domaine Vercel stable.

```text
Allowed Callback URLs:
http://localhost:5173, https://ndjoka-tontine.vercel.app

Allowed Logout URLs:
http://localhost:5173, https://ndjoka-tontine.vercel.app

Allowed Web Origins:
http://localhost:5173, https://ndjoka-tontine.vercel.app
```

Dans la Custom API Auth0, conserver :

```text
Identifier: https://api.ndjoka-tontine.com
Signing Algorithm: RS256
```

Les URLs doivent correspondre exactement aux origines utilisées. Ne pas ajouter
l'URL Render comme Callback URL : Auth0 redirige l'utilisateur vers le
frontend, pas vers l'API.

## Procédure de validation

### Contrôles HTTP publics

Vérifier le frontend et le health check :

```bash
curl -I https://ndjoka-tontine.vercel.app
curl -i https://api-ndjoka-tontine.onrender.com/api/v1/health
```

Résultats attendus : statut `200` et réponse `{"status":"ok"}` pour le health
check.

Vérifier que la route protégée refuse une requête anonyme :

```bash
curl -i https://api-ndjoka-tontine.onrender.com/api/v1/me
```

Résultat attendu : statut `401`, en-tête `WWW-Authenticate: Bearer` et détail
`Authentification requise`.

Vérifier le CORS Vercel vers Render :

```bash
curl -i -X OPTIONS \
  https://api-ndjoka-tontine.onrender.com/api/v1/me \
  -H 'Origin: https://ndjoka-tontine.vercel.app' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: Authorization'
```

Résultat attendu : statut `200` et en-tête :

```text
Access-Control-Allow-Origin: https://ndjoka-tontine.vercel.app
```

### Contrôle fonctionnel dans le navigateur

1. Ouvrir `https://ndjoka-tontine.vercel.app`.
2. Cliquer sur **Se connecter**.
3. Terminer l'authentification sur Universal Login Auth0.
4. Vérifier le retour vers le domaine Vercel stable.
5. Vérifier l'affichage **API protégée accessible** et du `sub` Auth0. Ce
   message confirme que `GET /api/v1/me` a répondu avec succès.
6. Cliquer sur **Se déconnecter** et vérifier le retour à l'état déconnecté.

## Limites de l'offre Render Free

- Un Web Service Free est mis en veille après 15 minutes sans trafic entrant.
- La première requête suivante le réveille ; le redémarrage prend environ une
  minute. Le frontend peut temporairement afficher une erreur FastAPI : attendre
  le réveil puis cliquer sur **Réessayer**.
- Le système de fichiers est éphémère. Les fichiers créés par le service sont
  perdus lors d'un redéploiement, redémarrage ou passage en veille.
- Un espace Render dispose de 750 heures d'instance Free par mois. Une fois le
  quota consommé, les services Free sont suspendus jusqu'au mois suivant.
- La bande passante sortante et les minutes de build consomment les quotas
  mensuels du workspace. En cas de dépassement, Render facture si un moyen de
  paiement est configuré ; sinon le service ou les nouveaux builds peuvent
  être suspendus jusqu'au mois suivant.
- Un Web Service Free ne prend pas en charge les disques persistants, le
  scaling au-delà d'une instance ni l'accès Shell SSH ou Dashboard.
- Render peut redémarrer un service Free à tout moment. Cette offre convient à
  la démonstration et au développement, pas à une production exigeant une
  disponibilité constante.
- Si PostgreSQL Free est ajouté ultérieurement sur Render, la base gratuite
  expire actuellement après 30 jours et ne dispose pas de sauvegardes.

## Diagnostic rapide

| Symptôme | Cause probable | Correction |
| --- | --- | --- |
| `Callback URL mismatch` | Domaine absent des URLs Auth0 | Ajouter l'origine exacte dans Callback, Logout et Web Origins |
| `Failed to fetch` en local | FastAPI local arrêté | Lancer Uvicorn sur `127.0.0.1:8000` |
| `Failed to fetch` sur Vercel | Render en veille ou origine CORS absente | Attendre le réveil, puis contrôler `CORS_ALLOWED_ORIGINS` |
| `401 Unauthorized` avec un token | Audience, issuer, expiration ou signature invalide | Comparer les configurations Auth0 frontend et backend |
| `404 NOT_FOUND` sur Vercel | Mauvaise branche ou mauvais Root Directory | Utiliser `develop` et `frontend` |
| Variables Vercel ignorées | Déploiement antérieur au changement | Créer un nouveau déploiement de production |

## Gestion des secrets

- Versionner uniquement `backend/.env.example` et `frontend/.env.example`.
- Garder `.env.dev` et `.env.prod` hors de Git.
- Ne jamais stocker d'Access Token, Client Secret, mot de passe ou clé privée
  dans le dépôt.
- Le backend valide les JWT avec les clés publiques JWKS ; il n'a pas besoin du
  Client Secret de l'application Auth0.
- Les valeurs `VITE_*` sont publiques, même lorsqu'elles sont configurées dans
  le tableau de bord Vercel.

## Références officielles

- [Render : Web Services](https://render.com/docs/web-services)
- [Render : limites des services gratuits](https://render.com/docs/free)
- [Vercel : déployer une application Vite](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel : variables d'environnement](https://vercel.com/docs/environment-variables)
- [Auth0 : paramètres d'une application](https://auth0.com/docs/get-started/applications/application-settings)
