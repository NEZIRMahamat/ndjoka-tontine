# Module cycles

Un cycle organise la rotation d'une tontine : un tour par membre actif, avec
un montant et une fréquence de cotisation.

## États

```text
draft -> scheduled -> active -> completed
draft | scheduled | active -> cancelled
```

## Règles

- Un seul cycle `active` par tontine.
- Le calendrier doit contenir chaque membre actif exactement une fois avant
  la planification. Un bénéficiaire ne reçoit qu'une fois par cycle.
- Seuls les brouillons sont modifiables et réordonnables. Montant, fréquence,
  date de début, fuseau, ordre et `beneficiary_contributes` sont figés dès
  la planification.
- Fréquences : `weekly` et `monthly`. En mensuel, un jour absent du mois cible
  est ramené au dernier jour du mois.
- Les échéances sont calculées dans le fuseau IANA du cycle, puis stockées
  en UTC.
- L'activation passe la tontine en `active` et génère, dans la même
  transaction, les cotisations et les versements attendus.
- `owner` et `manager` gèrent le cycle ; seul `owner` peut l'annuler.

## API

Base : `/api/v1/tontines/{tontine_id}/cycles`

| Méthode | Route | Action |
| --- | --- | --- |
| `POST`, `GET` | base | Création, liste |
| `GET`, `PATCH` | `/{cycle_id}` | Détail, modification du brouillon |
| `POST` | `/{cycle_id}/turns/generate` | Génération des tours |
| `PUT` | `/{cycle_id}/turns` | Remplacement de l'ordre |
| `POST` | `/{cycle_id}/schedule` | Planification |
| `POST` | `/{cycle_id}/activate` | Activation |
| `POST` | `/{cycle_id}/complete` | Clôture |
| `POST` | `/{cycle_id}/cancel` | Annulation |
