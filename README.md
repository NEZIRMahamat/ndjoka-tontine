# Ndjoka Tontine

Monorepo de l'application de tontine digitale Ndjoka.

## Stack cible

- backend : Python, FastAPI et PostgreSQL ;
- authentification : Auth0 ;
- frontend : React, TypeScript et Vite.

## État actuel

Le premier flux de bout en bout est disponible : React/Vite sur Vercel utilise
Auth0, appelle FastAPI sur Render et la route protégée `GET /api/v1/me` relie
l'identité Auth0 à un profil PostgreSQL 17 géré par migrations Alembic. Le
développement continue par petits tickets testés indépendamment.

Les instructions d'installation, de lancement et de test sont dans le
[README du backend](backend/README.md). La procédure Vercel/Auth0/Render et les
migrations PostgreSQL distantes sont décrites dans
[DEPLOYMENT.md](DEPLOYMENT.md).
