import { apiRequest, isRecord } from '@/lib/http'

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type RecommendedTontine = {
  id: string
  name: string
  description: string | null
  category: string
  city: string | null
  currency: string
  contribution_amount: number | null
  frequency: string | null
  monthly_equivalent: number | null
  seats_left: number | null
  member_count: number
  max_members: number | null
  affinity_score: number
  is_eligible: boolean
  ineligibility_reason: string | null
  reasons: string[]
  cover_image_url: string | null
}

export type ChatReply = { reply: string; recommendations: RecommendedTontine[] }

function isRecommendation(value: unknown): value is RecommendedTontine {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
    typeof value.affinity_score === 'number' && typeof value.is_eligible === 'boolean'
}

function parseChatReply(value: unknown): ChatReply {
  if (!isRecord(value) || typeof value.reply !== 'string') {
    throw new Error("La réponse de l'assistant n'a pas le format attendu")
  }
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations.filter(isRecommendation)
    : []
  return { reply: value.reply, recommendations }
}

export async function sendChatMessage(
  accessToken: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ChatReply> {
  const payload = await apiRequest(accessToken, '/api/v1/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ messages }),
    signal,
  })
  return parseChatReply(payload)
}
