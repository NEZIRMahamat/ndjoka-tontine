import json
import os
from groq import AsyncGroq


client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

def load_prompt(filename: str) -> str:
    # Ajuste le chemin selon la structure de ton projet
    filepath = os.path.join(os.path.dirname(__file__), 'prompts', filename)
    with open(filepath, 'r', encoding='utf-8') as file:
        return file.read()

# Utilisation
GUARDRAIL_PROMPT = load_prompt('backend/app/ai/prompts/prompt_system_guardrail.txt')

async def check_moderation(user_message: str) -> dict:
    """
    Vérifie si le message est pertinent pour Ndjoka Tontine (finances, épargne, tontines).
    Retourne {"is_allowed": bool, "reason": str}
    """
    system_prompt = GUARDRAIL_PROMPT

    response = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        response_format={"type": "json_object"},
        temperature=0.0
    )

    return json.loads(response.choices[0].message.content)