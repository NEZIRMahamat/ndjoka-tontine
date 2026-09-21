# Validation du Sprint 8 — NDJ-126 à NDJ-136

## Réalisé localement

- Migration `a91c4e7d2b60` après l'audit du Sprint 7 ; les tables et index
  Notifications, Outbox, livraisons et webhooks sont créés.
- Huit événements essentiels raccordés aux transactions métier ; rappel de
  cotisation à J-3 lancé séparément, dédupliqué par cotisation.
- API privée de liste, compteur, détail, lecture individuelle/globale ;
  isolation du destinataire et refus des comptes non actifs.
- Templates texte/HTML et fournisseurs console, factice et Resend ; worker
  relançable, clés d'idempotence, retry à +5/+30 minutes puis `dead`.
- Webhook signé sur corps brut, dédupliqué par `svix-id`, avec mise à jour des
  états livrés, rebondis, plaintes et échecs.
- Tests rapides, tests PostgreSQL isolés, vérification du schéma Alembic,
  lint, formatage et lockfile validés localement.

## À valider par le mainteneur avant de clore NDJ-136

1. Vérifier la cible RDS, sauvegarder si nécessaire, puis appliquer
   `alembic upgrade head` et confirmer `a91c4e7d2b60 (head)`.
2. Vérifier le domaine d'expédition dans Resend, créer le webhook et placer sa
   clé de signature dans Render avec l'API key privée.
3. Redéployer FastAPI ; organiser une exécution périodique indépendante du
   worker et du job quotidien de rappels (le Web Service ne les lance pas).
4. Émettre un événement réel, constater l'e-mail reçu, la livraison passée de
   `accepted` à `delivered`, la notification interne et les permissions.
5. Publier le tag `v0.9.0` selon le processus Git du mainteneur.

Le test local ne contacte pas Resend et n'atteste pas d'une livraison distante.
Le frontend reste inchangé. Le mail d'invitation ne transporte pas le token
brut d'acceptation pour respecter l'invariant de sécurité du Sprint 3 ; voir
le [contrat Notifications](app/modules/notifications/README.md).
