# Ndjoka Tontine

Monorepo de l'application de tontine digitale Ndjoka.

## Stack cible

- backend : Python, FastAPI et PostgreSQL ;
- authentification : Auth0 ;
- frontend : React, TypeScript et Vite.

## État actuel

Le flux de bout en bout utilise React/Vite sur Vercel, Auth0, FastAPI sur Render
et PostgreSQL 17 géré par migrations Alembic. La version backend `0.7.0` ajoute les
cycles, les tours de bénéficiaires et le suivi déclaratif des cotisations. Les
membres actifs peuvent consulter leur calendrier et leurs échéances par l'API ;
les rôles internes gèrent les cycles et valident les déclarations selon le
contrat métier. L'interface frontend reste volontairement dans son état
antérieur aux Sprints 4 et 5. Le Sprint 6 ajoute les versements manuels :
éligibilité, approbation, déclaration, réception et contestation. Aucun paiement
bancaire automatique n'est exécuté. Voir le
[contrat Versements](backend/app/modules/payouts/README.md) et le
[bilan de vérification](backend/SPRINT_6_VALIDATION.md).

Les instructions frontend sont dans le [README React](frontend/README.md) et
les instructions API dans le [README du backend](backend/README.md). La
procédure Vercel/Auth0/Render et les migrations PostgreSQL distantes sont
décrites dans [DEPLOYMENT.md](DEPLOYMENT.md).
