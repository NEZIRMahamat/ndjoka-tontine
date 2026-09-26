# Module notifications

Notifications internes et e-mails transactionnels, via une Outbox
transactionnelle et Resend.

## Événements notifiés

`invitation.created`, `membership.role_changed`, `cycle.activated`,
`cycle.cancelled`, `contribution.due_soon`, `contribution.rejected`,
`payout.declared_paid`, `payout.disputed`.

## Fonctionnement

- L'action métier, son audit et l'événement Outbox sont écrits dans la même
  transaction. Resend n'est appelé qu'ensuite, par le worker.
- Outbox, notifications et livraisons portent des clés de déduplication ;
  chaque envoi transmet une clé d'idempotence à Resend.
- En cas d'erreur temporaire : 3 tentatives (immédiate, +5 min, +30 min),
  puis passage en `dead`.
- Le webhook Resend vérifie la signature sur le corps brut, déduplique par
  `svix-id` et met à jour l'état de livraison.
- L'e-mail d'invitation ne contient pas le token d'acceptation, qui n'est
  jamais stocké en clair.

## Exécution

Ces processus ne tournent pas dans le Web Service ; ils doivent être planifiés.

```bash
uv run python -m app.jobs.contribution_reminders --once   # 1 fois par jour, rappel à J-3
uv run python -m app.workers.notifications --once          # régulièrement, --limit 1 à 100
```

En local, `EMAIL_PROVIDER=console` évite tout envoi réel. En production,
`EMAIL_PROVIDER=resend` exige `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` et un
domaine d'expédition vérifié chez Resend.

## API

| Méthode | Route |
| --- | --- |
| `GET` | `/api/v1/me/notifications` (filtres `status`, `event_name`, curseur) |
| `GET` | `/api/v1/me/notifications/unread-count` |
| `GET` | `/api/v1/me/notifications/{notification_id}` |
| `POST` | `/api/v1/me/notifications/{notification_id}/read` |
| `POST` | `/api/v1/me/notifications/read-all` |
| `POST` | `/api/v1/webhooks/resend` |
