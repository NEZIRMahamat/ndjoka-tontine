# Ndjoka Tontine

Monorepo de l'application de tontine digitale Ndjoka.

## Stack cible

- backend : Python, FastAPI et PostgreSQL ;
- authentification : Auth0 ;
- frontend : React, TypeScript et Vite.

## État actuel

Le flux de bout en bout utilise React/Vite sur Vercel, Auth0, FastAPI sur Render
et PostgreSQL 17 géré par migrations Alembic. La version `0.4.0` ajoute les
adhésions, invitations et rôles internes aux tontines. Les membres actifs voient
leurs tontines ; owners et managers disposent des opérations autorisées par le
contrat métier. Le frontend conserve l'interface de création et de liste.

Les instructions d'installation, de lancement et de test sont dans le
[README du backend](backend/README.md). La procédure Vercel/Auth0/Render et les
migrations PostgreSQL distantes sont décrites dans
[DEPLOYMENT.md](DEPLOYMENT.md).
