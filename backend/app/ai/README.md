# Module ai

Assistant conversationnel Ndjoka AI (fournisseur Groq). L'utilisateur dispose
d'une seule zone de saisie ; l'orchestration décrite ci-dessous est un détail
d'implémentation qui ne doit jamais lui être exposé, ni dans l'interface ni
dans les réponses.

## Fonctionnement

Chaque message passe par deux modèles :

1. **Contrôle préalable** (`agent_guardrail.py`, `GROQ_MODERATOR_MODEL`) :
   décide si la demande relève du périmètre de l'application. Hors périmètre,
   un message de réorientation est renvoyé et l'agent n'est pas appelé.
2. **Agent principal** (`agent_ndjoka.py`, `GROQ_AGENT_MODEL`) : répond en
   s'appuyant sur les outils, avec au plus 4 tours d'appels d'outils. Lorsque
   l'outil de recommandation est utilisé, les tontines proposées sont aussi
   renvoyées sous forme structurée pour être affichées en cartes.

En cas d'indisponibilité ou d'erreur fournisseur, la route renvoie `503` avec
un message générique, sans exposer de détail technique ni de secret.

## Outils

Définis dans `tools.py`, tous en lecture seule et limités aux données de
l'utilisateur connecté. Les paramètres optionnels sont déclarés nullables car
le fournisseur valide strictement les arguments produits par le modèle.

| Outil | Données |
| --- | --- |
| `list_my_tontines` | Tontines de l'utilisateur |
| `get_tontine_details` | Détail d'une tontine (règles, cycle, prochaine échéance) |
| `get_financial_overview` | Synthèse des cotisations et versements |
| `list_my_contributions` | Échéancier des cotisations |
| `list_my_payouts` | Versements reçus ou attendus, avec montant net |
| `get_my_saver_profile` | Profil d'épargnant et score de fiabilité |
| `recommend_tontines` | Tontines ouvertes recommandées (cartes renvoyées au client) |
| `simulate_fees` | Simulation du barème de frais d'un tour |

`TOOLS_DEFINITIONS` et `execute_tool` doivent rester synchronisés.

## Prompts

Les consignes sont dans `prompts/`. Elles intègrent le modèle économique
(barème dégressif, fonds de solidarité, paiements via prestataire agréé) et
la règle de non-divulgation de l'architecture interne.

## Configuration

| Variable | Défaut |
| --- | --- |
| `GROQ_API_KEY` | Obligatoire |
| `GROQ_AGENT_MODEL` | `openai/gpt-oss-120b` |
| `GROQ_MODERATOR_MODEL` | `openai/gpt-oss-20b` |
| `AI_HISTORY_LIMIT` | `16` messages transmis au modèle |

Vérifier la disponibilité des modèles sur le compte Groq avec
`GET https://api.groq.com/openai/v1/models` avant tout changement.

## API

`POST /api/v1/ai/chat` avec `{"messages": [{"role": "user", "content": "..."}]}`.
Rôles acceptés : `user` et `assistant` ; le dernier message doit venir de
l'utilisateur. Au plus 40 messages de 4 000 caractères.
Réponse : `{"reply": "...", "recommendations": [...]}` (le second champ est
absent lorsqu'aucune tontine n'a été proposée).
