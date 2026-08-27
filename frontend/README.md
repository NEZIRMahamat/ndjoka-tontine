# Frontend Ndjoka Tontine

Frontend React, TypeScript et Vite de l'application Ndjoka Tontine.

Le frontend intègre Auth0 pour la connexion et la déconnexion. Les appels au
backend seront ajoutés pendant les tickets suivants.

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
```

Ces trois valeurs sont publiques. N'ajoutez jamais de Client Secret Auth0 dans
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

## Vérification Auth0

1. Ouvrez `http://localhost:5173` et cliquez sur **Se connecter**.
2. Authentifiez-vous sur la page Universal Login d'Auth0.
3. Vérifiez le retour sur l'application et l'affichage de l'utilisateur.
4. Cliquez sur **Se déconnecter** et vérifiez le retour à l'état déconnecté.
