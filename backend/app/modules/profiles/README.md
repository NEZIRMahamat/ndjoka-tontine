# Module profiles

Profil déclaratif d'épargnant et score de fiabilité. Ces données alimentent
les recommandations du module discovery.

## Profil d'épargnant

Un profil par utilisateur, facultatif, composé de sept variables :

| Champ | Valeurs |
| --- | --- |
| `monthly_capacity` | Montant mensuel disponible, strictement positif |
| `preferred_rhythm` | `weekly`, `monthly` |
| `savings_goal` | `project`, `emergency`, `housing`, `education`, `business` |
| `horizon_months` | 1 à 120 |
| `group_size_preference` | `small` (2-6), `medium` (7-12), `large` (13+) |
| `experience_level` | `beginner`, `intermediate`, `experienced` |
| `turn_preference` | `early`, `flexible`, `late` |

## Score de fiabilité

Indicateur entre 0 et 1, recalculé à chaque lecture à partir des cotisations
réelles (`reliability.py`). Il n'est pas stocké.

- Sans cotisation échue : `0.500` (nouvel arrivant, score neutre).
- Sinon :
  `0.350 + 0.500 x taux_ponctualité - min(0.080 x impayés, 0.250) + 0.030 x min(cycles_terminés, 5)`,
  borné entre 0 et 1.

Sont comptées les cotisations confirmées et celles échues non payées ; les
échéances futures sont ignorées. Une cotisation est ponctuelle si elle est
confirmée au plus tard à son échéance.

| Palier | Seuil |
| --- | --- |
| `excellent` | 0.80 et plus |
| `bon` | 0.65 et plus |
| `moyen` | 0.45 et plus |
| `fragile` | en dessous |

Le score est marqué `is_provisional` tant que moins de 6 cotisations sont
prises en compte. Les constantes sont centralisées en tête de
`reliability.py`.

## API

| Méthode | Route | Résultat |
| --- | --- | --- |
| `GET` | `/api/v1/me/saver-profile` | Profil, `404` s'il n'existe pas |
| `PUT` | `/api/v1/me/saver-profile` | Création ou remplacement |
| `DELETE` | `/api/v1/me/saver-profile` | Suppression |
| `GET` | `/api/v1/me/reliability` | Score, palier et détail du calcul |

## Fiche publique d'un membre

`GET /api/v1/users/{user_id}/profile` renvoie ce qu'un autre membre peut voir :
nom affiché, avatar, ville, ancienneté, score de fiabilité (avec son
explication), nombre de tontines actives, cycles menés à terme, niveau
d'expérience déclaré et tontines partagées avec le demandeur. Aucune donnée de
contact, bancaire ou financière individuelle n'est exposée. La liste des
membres d'une tontine inclut aussi le score de chacun.
