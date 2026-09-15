# Contrat métier Cycles et tours — Sprint 4

Un cycle appartient à une tontine et organise exactement un tour par adhésion
active. Les montants utilisent `Decimal`/`NUMERIC(18, 2)` et les échéances sont
calculées dans le fuseau IANA du cycle, puis enregistrées en UTC.

## États et transitions

```text
draft -> scheduled -> active -> completed
  |          |          |
  +----------+----------+-> cancelled
```

- un seul cycle peut être `active` par tontine ;
- une tontine archivée ne reçoit aucun nouveau cycle ;
- le calendrier doit contenir tous les membres actifs, une seule fois, avant
  la planification ;
- seuls les brouillons sont modifiables et réordonnables ;
- montant, fréquence, date, fuseau, ordre et `beneficiary_contributes` sont
  verrouillés après la planification ;
- owner et manager gèrent le cycle ; seul l'owner peut l'annuler ; tous les
  membres actifs peuvent le consulter.

Les fréquences MVP sont `weekly` et `monthly`. Pour une fréquence mensuelle,
une date inexistante dans le mois cible est ramenée au dernier jour de ce mois.

## API

La collection `/api/v1/tontines/{tontine_id}/cycles` expose `POST` et `GET`.
Le détail `/{cycle_id}` expose `GET` et `PATCH`. Les actions disponibles sont
`turns/generate`, le remplacement atomique de l'ordre via `PUT /turns`, puis
`schedule`, `activate`, `complete` et `cancel` via `POST`.

L'activation passe une tontine brouillon à `active` et génère dans la même
transaction les obligations de cotisation du Sprint 5 et les versements
attendus du Sprint 6. Une tontine archivée interdit désormais toutes les
écritures sur ses cycles. Les participants sont vérifiés par identité avant
la planification et l'activation, puis restent figés dans le calendrier.
