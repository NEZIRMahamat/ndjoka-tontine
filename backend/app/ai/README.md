# Module ai

Assistant conversationnel Ndjoka AI. L'utilisateur dispose d'une seule zone
de saisie ; l'orchestration décrite ci-dessous est un détail d'implémentation
qui ne doit jamais lui être exposé, ni dans l'interface ni dans les réponses.

## Fonctionnement

Chaque message passe par deux modèles Groq :

1. **Contrôle préalable** (`agent_guardrail.py`, `GROQ_MODERATOR_MODEL`) :
   décide si la demande relève du périmètre de l'application. Hors périmètre,
   un message de réorientation est renvoyé et l'agent n'est pas appelé.
2. **Agent principal** (`agent_ndjoka.py`, `GROQ_AGENT_MODEL`) : répond en
   s'appuyant sur les outils, avec au plus 3 tours d'appels d'outils.

En cas d'indisponibilité ou d'erreur, un message générique est renvoyé ; la
route ne renvoie jamais d'erreur technique au client.

## Outils

Définis dans `tools.py`, tous en lecture seule et limités aux données de
l'utilisateur connecté.

| Outil | Données |
| --- | --- |
| `list_my_tontines` | Tontines de l'utilisateur |
| `get_financial_overview` | Synthèse des cotisations et versements |
| `list_my_contributions` | Échéancier des cotisations |
| `list_my_payouts` | Versements reçus ou attendus |
| `get_my_saver_profile` | Profil d'épargnant et score de fiabilité |
| `recommend_tontines` | Tontines ouvertes recommandées |

`TOOLS_DEFINITIONS` et `execute_tool` doivent rester synchronisés.

## Prompts

Les consignes sont dans `prompts/`. Toute modification doit préserver la
règle de non-divulgation de l'architecture interne.

## Configuration

| Variable | Défaut |
| --- | --- |
| `GROQ_API_KEY` | Obligatoire |
| `GROQ_AGENT_MODEL` | `llama-3.3-70b-versatile` |
| `GROQ_MODERATOR_MODEL` | `llama-3.1-8b-instant` |
| `AI_HISTORY_LIMIT` | `16` messages transmis au modèle |

## API

`POST /api/v1/ai/chat` avec `{"messages": [{"role": "user", "content": "..."}]}`.
Rôles acceptés : `user` et `assistant` ; le dernier message doit venir de
l'utilisateur. Au plus 40 messages de 4 000 caractères. Réponse : `{"reply": "..."}`.
