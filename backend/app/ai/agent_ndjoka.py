import json
import os
from groq import AsyncGroq
from app.ai.tools import TOOLS_DEFINITIONS, execute_tool

client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))


def load_prompt(filename: str) -> str:
    # Ajuste le chemin selon la structure de ton projet
    filepath = os.path.join(os.path.dirname(__file__), 'prompts', filename)
    with open(filepath, 'r', encoding='utf-8') as file:
        return file.read()

# Utilisation
AGENT_PROMPT = load_prompt('backend/app/ai/prompts/prompt_system_agent_ndjoka.txt')

async def run_ndjoka_agent(messages: list, user_id: str) -> str:
    formatted_messages = [{"role": "system", "content": AGENT_PROMPT}] + messages

    # Premier appel au modèle avec les outils déclarés
    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=formatted_messages,
        tools=TOOLS_DEFINITIONS,
        tool_choice="auto",
        temperature=0.3
    )

    response_message = response.choices[0].message
    tool_calls = response_message.tool_calls

    # Si le modèle ne demande aucun outil, on renvoie directement son texte
    if not tool_calls:
        return response_message.content

    # Si le modèle demande des outils, on les exécute
    formatted_messages.append(response_message)

    for tool_call in tool_calls:
        tool_name = tool_call.function.name
        tool_args = json.loads(tool_call.function.arguments or "{}")
        
        # Exécution sécurisée avec l'user_id
        tool_result = await execute_tool(tool_name, tool_args, user_id)

        # On injecte le résultat dans l'historique
        formatted_messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "name": tool_name,
            "content": tool_result
        })

    # Deuxième appel : le modèle utilise le résultat pour formuler sa réponse finale
    final_response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=formatted_messages,
        temperature=0.3
    )

    return final_response.choices[0].message.content