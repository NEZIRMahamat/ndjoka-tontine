# Notifications transactionnelles — Sprint 8

Le Sprint 8 (NDJ-126 à NDJ-136) ajoute des notifications internes et des e-mails
transactionnels, sans changer l'interface React. Les huit événements MVP sont
`invitation.created`, `membership.role_changed`, `cycle.activated`,
`cycle.cancelled`, `contribution.due_soon`, `contribution.rejected`,
`payout.declared_paid` et `payout.disputed`.

## Contrat et sécurité

- Une mutation métier, son audit et son événement Outbox sont écrits dans la
  même transaction PostgreSQL. Resend n'est appelé que par le worker, après le
  commit.
- L'Outbox, les notifications et les livraisons portent des clés de
  déduplication uniques. Chaque envoi transmet aussi une clé d'idempotence à
  Resend.
- Les notifications sont accessibles uniquement à leur destinataire actif :
  liste paginée (`status`, `event_name`, `cursor`, `limit`), compteur non lu,
  détail, lecture individuelle et lecture globale sous `/api/v1/me/notifications`.
- Les webhooks `/api/v1/webhooks/resend` vérifient la signature sur le corps
  brut, conservent le `svix-id` et traitent `email.delivered`, `email.bounced`,
  `email.complained` et `email.failed` sans doublon.
- Ni clé API, ni secret de webhook, ni JWT, ni donnée bancaire, ni token brut
  d'invitation ne sont enregistrés dans l'Outbox ou les logs.

Une invitation créée déclenche bien un e-mail d'information et, pour un compte
existant, une notification interne. Le lien ne transporte toutefois **pas** le
token d'acceptation : le contrat Sprint 3 impose de ne jamais stocker ce token
brut et l'Outbox agit après la transaction. L'API continue à le retourner une
seule fois à l'invitant. Un lien d'acceptation autonome par e-mail nécessitera
un ticket distinct (par exemple un secret chiffré à durée de vie limitée).

## Exécution

Dans `backend/.env.dev`, `EMAIL_PROVIDER=console` permet de développer sans
envoi réel. En production, configurer `EMAIL_PROVIDER=resend`,
`EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `FRONTEND_BASE_URL`, `RESEND_API_KEY`
et `RESEND_WEBHOOK_SECRET`. `EMAIL_FROM_ADDRESS` vaut
`notifications@ndjoka-tontine.com` pour les notifications automatiques ;
`EMAIL_CONTACT_ADDRESS=contact@ndjoka-tontine.com` est utilisé pour les
invitations. `EMAIL_REPLY_TO` peut rester vide : le champ est alors omis de
l'appel Resend. Le domaine
d'expédition doit être autorisé chez Resend. Ces secrets restent dans les
variables d'environnement du service, jamais dans Git.

Depuis `backend/`, après `alembic upgrade head` :

```bash
uv run python -m app.workers.notifications --once
uv run python -m app.jobs.contribution_reminders --once
```

Le worker traite jusqu'à 50 événements dus (option `--limit`, maximum 100).
Il doit être relancé périodiquement par un ordonnanceur externe. Le job de
rappels doit être lancé une fois par jour UTC, avant le worker : il crée une
seule entrée par cotisation dont l'échéance tombe exactement trois jours plus
tard, si l'utilisateur, l'adhésion et le cycle sont actifs. Aucun de ces
processus n'est lancé par le Web Service FastAPI lui-même.

Les erreurs temporaires entraînent trois tentatives au total : immédiate,
puis après cinq et trente minutes. Une erreur permanente ou une troisième
erreur temporaire met la livraison et son événement en `dead`. Le traitement
automatique s'arrête alors ; l'analyse et un éventuel rejeu administré sont à
prévoir séparément. Le fournisseur `console` ne révèle pas le contenu des
messages dans les logs.

## Vérification

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest -m "not integration"
TEST_DATABASE_URL=postgresql+asyncpg://ndjoka_test:ndjoka_test@127.0.0.1:5434/ndjoka_test uv run pytest -m integration
```

Les tests PostgreSQL exigent `docker compose --profile test up -d
postgres_test` dans `infra/` et refusent toute URL de test non locale. Ils ne
contactent jamais Resend : ils utilisent un fournisseur factice et un webhook
signé de test.
