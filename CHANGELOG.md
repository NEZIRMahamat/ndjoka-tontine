# Journal des versions

Les évolutions notables de Ndjoka Tontine sont regroupées dans ce fichier.

## [0.9.0] - Non publiée

Sprint 8 « Notifications et Resend » (NDJ-126 à NDJ-136), backend uniquement.

- quatre tables PostgreSQL pour notifications, Outbox, livraisons et webhooks ;
- huit événements métier essentiels, templates texte/HTML et fournisseur
  console, factice ou Resend ;
- API privée de consultation/lecture, worker `--once` et rappel trois jours
  avant échéance ;
- signatures Svix, déduplication PostgreSQL, clé d'idempotence Resend et retries
  limités ;
- migration `a91c4e7d2b60` et tests unitaires/PostgreSQL.

Le déploiement, la recette avec un véritable e-mail/webhook et le tag `v0.9.0`
restent à effectuer par le mainteneur. Le frontend n'a pas été modifié.

## [0.8.0] - Non publiée

Sprint 7 « Audit métier et historique immuable » (NDJ-108 à NDJ-125), backend
uniquement.

- catalogue versionné et listes blanches par événement pour les utilisateurs,
  tontines, membres, invitations, cycles, cotisations et versements ;
- table PostgreSQL append-only avec trigger bloquant `UPDATE` et `DELETE` ;
- événement atomique dans chaque transaction métier sensible ;
- corrélation `X-Request-ID` acceptée, générée, retournée et conservée ;
- six endpoints de lecture personnels, par tontine et administratifs ;
- permissions owner/manager/treasurer/member/platform admin et isolation ;
- pagination stable par curseur `(occurred_at, id)` et filtres documentés ;
- migration `f75db14c9a20` et tests d'immuabilité, rollback et sécurité.

La migration RDS, le redéploiement Render, la recette distante et le tag
`v0.8.0` restent à effectuer par le mainteneur.

## [0.7.0] - Non publiée

Sprint 6 « Versements manuels » (NDJ-90 à NDJ-107), backend uniquement.

- douze endpoints protégés : génération, listes, détail, synthèse, éligibilité,
  approbation, déclaration, réception, contestation, résolution et annulation ;
- montants Decimal et bénéficiaire/cycle/tontine garantis par contraintes DB ;
- génération à l'activation et mise à jour lors des confirmations, atomiques ;
- permissions par adhésion et bénéficiaire, références internes filtrées ;
- migration `e64ca02b8d39`, tests PostgreSQL de concurrence et migrations ;
- corrections Sprints 4–5 : archives en lecture seule, participants figés,
  filtres de retard cohérents, synthèses SQL sans plafond arbitraire,
  erreurs de génération non masquées et revalidation de l'adhésion à l'écriture.

Aucun changement frontend, aucun paiement bancaire, aucun commit/push/tag
ni déploiement distant exécuté. Voir `backend/SPRINT_6_VALIDATION.md`.


## [0.6.0] - 2026-09-08

Prête à publier — Sprint 5 « Cotisations » (NDJ-75 à NDJ-89).

### Ajouté

- génération idempotente des obligations lors de l'activation d'un cycle ;
- échéancier personnel et suivi collectif paginés et filtrables ;
- déclaration par le membre, confirmation ou rejet par les rôles financiers ;
- statut de retard calculé, synthèse par cycle et conservation de l'historique
  confirmé lors d'une annulation ;
- migration `d53b9f1a7c28`, tests unitaires, HTTP et PostgreSQL ;

### Hors périmètre

- encaissement réel, Stripe, Mobile Money et notifications automatiques.

## [0.5.0] - 2026-09-08

Prête à publier — Sprint 4 « Cycles et tours » (NDJ-59 à NDJ-74).

### Ajouté

- cycles hebdomadaires ou mensuels avec montants décimaux et fuseaux IANA ;
- génération et réordonnancement atomiques du calendrier des bénéficiaires ;
- transitions brouillon, planifié, actif, terminé et annulé ;
- contrôles de rôles, unicité du cycle actif et verrouillage après planification ;
- migration `c42a8e0f6b17`, tests unitaires, HTTP et PostgreSQL ;

La migration Render, le déploiement, les tags Git `v0.5.0`/`v0.6.0` et les
releases restent des opérations du mainteneur.

## [0.4.0] - 2026-09-07

Prête à publier — Sprint 3 « Membres et invitations » (NDJ-45 à NDJ-58).

### Ajouté

- adhésions uniques avec rôles `owner`, `manager`, `treasurer` et `member` ;
- invitations à durée de vie de sept jours, token brut retourné une seule fois
  et stockage exclusif de son hash SHA-256 ;
- acceptation, révocation et expiration sécurisées des invitations ;
- liste des membres, modification des rôles, départ volontaire, retrait et
  transfert atomique de propriété ;
- dépendances FastAPI de permissions internes et contrôle de `max_members` ;
- migration rétroactive créant l'adhésion `owner` des tontines existantes ;
- tests unitaires, HTTP et PostgreSQL couvrant les transitions, conflits,
  permissions et accès après retrait.

### Modifié

- les membres actifs peuvent désormais consulter les tontines auxquelles ils
  appartiennent ;
- les nouvelles tontines créent leur propriétaire dans la même transaction ;
- l'API, le backend et le frontend portent la version `0.4.0` ;
- la révision Alembic attendue devient `b81e6c3d4f20 (head)`.

### Hors périmètre

- envoi réel d'e-mails, cycles, cotisations et paiements.

Cette entrée prépare la publication. La migration Render, le déploiement, le
tag Git et la release restent des opérations du mainteneur.

## [0.3.0] - 2026-09-07

Prête à publier — Sprint 2 « Tontines » (NDJ-34 à NDJ-44).

### Ajouté

- contrat métier Tontine et séparation des règles entre routes, service et
  repository ;
- table `tontines` avec UUID, propriétaire, devise ISO 4217, limite de membres,
  statuts, dates UTC, contraintes SQL et index de liste ;
- création en brouillon, liste personnelle paginée, consultation, modification
  et archivage logique ;
- contrôle d'accès par propriétaire, verrouillage des mutations et lecture
  seule après archivage ;
- tests HTTP, unitaires et PostgreSQL pour les codes `201`, `200`, `400`,
  `403`, `404`, `409` et `422` ;
- interface React minimale pour créer et afficher les tontines du compte.

### Modifié

- l'API, le backend et le frontend portent la version `0.3.0` ;
- la documentation de migration Render attend la révision
  `7c2a91e4b630 (head)`.

### Hors périmètre

- membres, invitations, cycles, cotisations et paiements ;
- activation métier d'une tontine, prévue avec les cycles.

Cette entrée prépare la publication. La migration Render, le déploiement, le
tag Git et la release restent des opérations du mainteneur.

## [0.2.0] - 2026-09-05

Prête à publier — Sprint 1 « Utilisateurs » (NDJ-22 à NDJ-33).

### Ajouté

- contrat métier du profil utilisateur Ndjoka et séparation explicite des
  responsabilités entre Auth0 et PostgreSQL ;
- profil local enrichi : nom d'affichage, avatar, langue, fuseau horaire,
  statut, rôle global et date de désactivation ;
- provisionnement et synchronisation de l'e-mail depuis un Access Token Auth0
  lorsqu'il expose ce claim ;
- lecture et mise à jour du profil courant avec `GET` et `PATCH /api/v1/me` ;
- désactivation logique du compte avec `POST /api/v1/me/deactivate` ;
- consultation paginée des utilisateurs pour le support et l'administration ;
- gestion des statuts et rôles globaux réservée à `platform_admin` ;
- contrôles d'accès `401`, `403`, `404` et validation `422` documentés dans
  OpenAPI ;
- migration Alembic reproductible et couverture de tests unitaires,
  d'intégration PostgreSQL et de régression CORS.

### Modifié

- les comptes utilisent désormais uniquement les statuts `active`,
  `suspended` et `deactivated` ;
- les rôles globaux sont `user`, `support` et `platform_admin` ;
- les comptes suspendus ou désactivés ne peuvent plus utiliser les routes
  authentifiées, même avec un JWT Auth0 valide ;
- la date de désactivation est conservée comme historique après une
  réactivation et remplacée lors d'une nouvelle désactivation ;
- l'API et le paquet backend portent la version `0.2.0`.

### Migration

- les anciens comptes `pending` deviennent `suspended` ;
- les anciens comptes `closed` deviennent `deactivated` et reçoivent une date
  de désactivation ;
- un premier `platform_admin` doit être désigné explicitement après la
  migration, à partir de son `auth0_sub` exact.

Cette entrée prépare la publication. Aucun commit, tag Git ni release distante
n'est créé automatiquement ; leur création reste une opération du mainteneur.

## [0.1.0] - 2026-08-31

- socle FastAPI et React/Vite ;
- authentification Auth0 et validation JWT RS256 ;
- route protégée `GET /api/v1/me` ;
- PostgreSQL 17, SQLAlchemy asynchrone et migrations Alembic ;
- premier déploiement sur Vercel, Render et Cloudflare.
