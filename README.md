# Ndjoka Tontine

Monorepo de l'application de tontine digitale Ndjoka.

## Stack cible

- backend : Python, FastAPI et PostgreSQL ;
- authentification : Auth0 ;
- frontend : React, TypeScript et Vite.

## État actuel

Le premier jalon backend est disponible avec les routes publiques `GET /` et
`GET /api/v1/health`. Auth0, PostgreSQL et le frontend seront ajoutés par petits
jalons indépendants.

Les instructions d'installation, de lancement et de test sont dans le
[README du backend](backend/README.md).
