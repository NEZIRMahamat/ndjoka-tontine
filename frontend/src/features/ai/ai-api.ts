import { apiRequest, isRecord } from '@/lib/http'

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

function parseChatReply(value: unknown): string {
  if (!isRecord(value) || typeof value.reply !== 'string') {
    throw new Error("La réponse de l'assistant n'a pas le format attendu")
  }
  return value.reply
}

export async function sendChatMessage(
  accessToken: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const payload = await apiRequest(accessToken, '/api/v1/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ messages }),
    signal,
  })
  return parseChatReply(payload)
}
