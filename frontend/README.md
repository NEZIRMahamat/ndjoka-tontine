# Frontend Ndjoka Tontine

Frontend React, TypeScript et Vite de l'application Ndjoka Tontine.

Le frontend intègre Auth0 pour la connexion et la déconnexion, puis transmet
l'Access Token à FastAPI pour tous les appels protégés.

## Fonctionnalités intégrées

- tableau de bord alimenté par les tontines réellement accessibles ;
- consultation, modification et désactivation du profil Ndjoka ;
- liste et administration globale des utilisateurs selon le rôle Auth0/DB ;
- création, modification et archivage logique des tontines ;
- création, consultation, révocation et acceptation des invitations ;
- consultation des membres, attribution des rôles internes, retrait et départ ;
- transfert atomique de la propriété d'une tontine.

Les rôles globaux (`user`, `support`, `platform_admin`) restent séparés des
rôles internes d'une tontine (`owner`, `manager`, `treasurer`, `member`). Les
écrans et actions disponibles suivent les autorisations retournées par l'API.

## Prérequis

- Node.js `^20.19.0` ou `>=22.12.0` (le projet fixe `20.20.2` dans `.nvmrc`)
- npm 10 ou supérieur

Si `nvm` est installé, activez la version prévue puis vérifiez le terminal :

```bash
nvm use
node --version
npm --version
```

## Installation

Depuis le dossier `frontend/` :

```bash
npm install
```

## Lancement local

Créez ou complétez `.env.dev` à partir de `.env.example` :

```dotenv
VITE_AUTH0_DOMAIN=your-tenant.eu.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id
VITE_AUTH0_AUDIENCE=https://api.ndjoka-tontine.com
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Ces valeurs sont publiques. N'ajoutez jamais de Client Secret Auth0 dans
un fichier Vite ou dans une variable préfixée par `VITE_`.

Dans les réglages de l'application Auth0 de type **Single Page Application**,
configurez pour le développement local :

- Allowed Callback URLs : `http://localhost:5173`
- Allowed Logout URLs : `http://localhost:5173`
- Allowed Web Origins : `http://localhost:5173`

Utilisez ensuite la même origine dans le navigateur :

```bash
npm run dev
```

L'application est disponible par défaut sur `http://localhost:5173`.

## Vérifications

```bash
npm run lint
npm run build
```

Le script de développement charge le mode Vite `dev` (`.env.dev`) et le build
charge le mode `prod` (`.env.prod`). Ces fichiers locaux restent ignorés par Git.

## Vérification fonctionnelle locale

1. Ouvrez `http://localhost:5173` et cliquez sur **Se connecter**.
2. Authentifiez-vous sur la page Universal Login d'Auth0.
3. Vérifiez le retour sur l'application et le chargement du tableau de bord.
4. Ouvrez **Mon profil**, modifiez une préférence et contrôlez sa persistance.
5. Ouvrez **Mes tontines**, créez un groupe puis consultez son espace membres.
6. Avec deux comptes de test, créez puis acceptez une invitation.
7. Cliquez sur **Se déconnecter** et vérifiez le retour à l'état déconnecté.

## Déploiement continu

Vercel doit utiliser `frontend` comme répertoire racine, `npm run build` comme
commande de build et `dist` comme répertoire de sortie. Les quatre variables
`VITE_*` doivent être définies dans l'environnement Production. Chaque push sur
la branche de production configurée déclenche alors un nouveau build.

Le déploiement du backend Render, le CORS, Auth0, les domaines Cloudflare et la
procédure de validation complète sont documentés dans
[`../DEPLOYMENT.md`](../DEPLOYMENT.md).
