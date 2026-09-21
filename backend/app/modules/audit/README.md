# Contrat métier Audit — Sprint 7

L'audit métier conserve une chronologie append-only des actions sensibles de
Ndjoka. Il complète les logs techniques et les journaux Auth0 sans les
remplacer. Chaque événement suit la convention `<ressource>.<action>`, porte
une version de schéma et est créé dans la transaction de l'action métier.

## Structure et immuabilité

`audit_events` contient un UUID, le nom et la version de l'événement, l'acteur
(`user` ou `system`), les utilisateurs acteur et sujet, la tontine, la
ressource, les changements autorisés, un contexte limité, le `request_id` et
la date UTC `occurred_at`. Il n'existe volontairement aucun `updated_at`.

- le repository expose uniquement l'insertion et la lecture ;
- aucune route HTTP ne crée, modifie ou supprime un événement ;
- un trigger PostgreSQL refuse tout `UPDATE` ou `DELETE` ;
- si l'insertion de l'audit échoue, la mutation métier est annulée ;
- une mutation idempotente déjà appliquée ne produit pas de doublon.

Le catalogue et la liste blanche des champs sont définis dans `catalog.py`.
Les familles couvertes sont : utilisateurs, tontines, invitations, adhésions,
cycles, cotisations et versements. Un événement automatique utilise
`actor_type=system`, `actor_user_id=null` et `context.source=system`.

## Données protégées

`changes` n'accepte que les champs explicitement déclarés pour l'événement.
Une validation récursive refuse notamment les tokens Auth0, Authorization,
secrets client, mots de passe, clés API, cookies, IBAN, cartes, CVV, documents
KYC, e-mails et `auth0_sub`. Les textes privés de paiement, références et
motifs ne sont pas copiés ; seule leur présence ou une raison métier fermée
peut être auditée.

## Corrélation HTTP

Le middleware accepte un `X-Request-ID` UUID valide ou en génère un. La valeur
est retournée dans la réponse et copiée dans tous les événements produits par
la requête. Elle permettra de relier audit, logs et intégrations externes.

## Consultation

```text
GET /api/v1/me/audit-events
GET /api/v1/me/audit-events/{event_id}
GET /api/v1/tontines/{tontine_id}/audit-events
GET /api/v1/tontines/{tontine_id}/audit-events/{event_id}
GET /api/v1/admin/audit-events
GET /api/v1/admin/audit-events/{event_id}
```

Les listes acceptent `event_name`, `resource_type`, `resource_id`,
`actor_user_id`, `date_from`, `date_to`, `cursor` et `limit` (1 à 100). Elles
sont triées du plus récent au plus ancien et utilisent un curseur stable fondé
sur `(occurred_at, id)`, sans pagination profonde par offset.

Un owner ou manager voit toute sa tontine. Un treasurer voit les événements
financiers et ceux qui le concernent. Un member voit seulement ceux dont il
est acteur ou sujet. Seul `platform_admin` accède à l'audit global. Un compte
non actif et une personne extérieure sont refusés, sans révéler les ressources
d'une autre tontine.

## Migration

La révision `f75db14c9a20`, après `e64ca02b8d39`, crée la table, ses index de
filtrage et le trigger `trg_audit_events_immutable`. Son downgrade retire
d'abord le trigger et sa fonction, puis la table.
