import { useAuth0 } from '@auth0/auth0-react'
import { ArrowRight, Loader2, RefreshCw, Send, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { type ChatMessage, sendChatMessage } from '@/features/ai/ai-api'
import { discoverTontines, type DiscoveredTontine } from '@/features/explorer/discovery-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: "Bonjour ! Je suis Ndjoka AI. Dites-moi ce que vous souhaitez comprendre ou préparer pour votre épargne.",
}

const SUGGESTIONS = [
  'Je débute en tontine',
  'Quel est le statut de mes cotisations ?',
  'Quand est mon prochain versement ?',
  'Quelle tontine correspond à mon profil ?',
]

export default function NdjokaAIPage() {
  const { getAccessTokenSilently } = useAuth0()
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [recommendations, setRecommendations] = useState<DiscoveredTontine[]>([])
  const [recommendationError, setRecommendationError] = useState('')
  const [loadingRecommendations, setLoadingRecommendations] = useState(true)
  const listEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const result = await discoverTontines(token, { limit: 5 }, controller.signal)
        if (active) setRecommendations(result.items)
      } catch (caught) {
        if (active) setRecommendationError(messageOf(caught, 'Recommandations indisponibles.'))
      } finally {
        if (active) setLoadingRecommendations(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, pending])

  async function sendText(text: string) {
    if (!text.trim() || pending) return
    const userMessage: ChatMessage = { role: 'user', content: text.trim() }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setError('')
    setPending(true)
    try {
      const token = await getAccessTokenSilently()
      const reply = await sendChatMessage(token, nextMessages.slice(-40))
      setMessages((current) => [...current, { role: 'assistant', content: reply }])
    } catch (caught) {
      setMessages(messages)
      setInput(text)
      setError(messageOf(caught, "Ndjoka AI n'a pas pu répondre. Votre message est conservé pour réessayer."))
    } finally {
      setPending(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendText(input)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 p-6 text-white shadow-sm sm:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15"><Sparkles /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ndjoka AI</h1>
            <p className="mt-1 text-sm text-white/80">Votre espace pour parler épargne et tontines.</p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="flex h-[min(620px,75dvh)] min-h-[420px] flex-col overflow-hidden py-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Conversation</h2>
            <Button variant="ghost" size="sm" onClick={() => { setMessages([WELCOME_MESSAGE]); setInput(''); setError('') }} disabled={pending}>
              <RefreshCw className="h-4 w-4" /> Nouvelle conversation
            </Button>
          </div>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5" role="log" aria-label="Conversation avec Ndjoka AI">
              {messages.map((message, index) => (
                <div key={index} className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${message.role === 'user' ? 'bg-primary text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                    {message.role === 'user' ? <UserRound className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  </span>
                  <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-muted/40 text-foreground'}`}>
                    {message.content}
                  </p>
                </div>
              ))}
              {pending && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Ndjoka AI prépare sa réponse…</p>}
              <div ref={listEndRef} />
            </div>
            {error && <p role="alert" className="mx-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 px-4 pb-3">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary" onClick={() => void sendText(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="flex gap-2 border-t p-4">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Votre question, votre objectif, votre budget…"
                aria-label="Message à Ndjoka AI"
                maxLength={4000}
                disabled={pending}
                className="min-w-0 flex-1 rounded-xl border bg-muted/30 px-4 py-2 text-sm outline-none focus:border-primary"
              />
              <Button type="submit" size="icon" aria-label="Envoyer" disabled={pending || !input.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : <Send />}
              </Button>
            </form>
          </CardContent>
        </Card>

        <section aria-labelledby="recommendations-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="recommendations-heading" className="font-semibold">Tontines pour votre profil</h2>
              <p className="text-xs text-muted-foreground">Groupes ouverts classés selon vos préférences enregistrées.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/explorer')}>Explorer <ArrowRight /></Button>
          </div>
          {recommendationError && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{recommendationError}</p>}
          {loadingRecommendations ? <p role="status" className="text-sm text-muted-foreground">Chargement des recommandations…</p>
            : !recommendationError && recommendations.length === 0 ? <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Aucune tontine ouverte ne correspond encore à votre profil.</p>
              : recommendations.map((tontine) => (
                <Card key={tontine.id} className="gap-3 py-4 transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{tontine.name}</h3>
                        {tontine.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{tontine.description}</p>}
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{Math.round(Number(tontine.affinity_score) * 100)}% d'affinité</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-lg bg-muted/60 px-2 py-1">{tontine.contribution_amount ? formatCurrencyAmount(tontine.contribution_amount, tontine.currency) : 'Cotisation à définir'}</span>
                      <span className="rounded-lg bg-muted/60 px-2 py-1">{tontine.member_count} membre(s)</span>
                      {tontine.frequency && <span className="rounded-lg bg-muted/60 px-2 py-1">{tontine.frequency}</span>}
                    </div>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => navigate(`/explorer/${tontine.id}`)}>
                      Voir la tontine <ArrowRight />
                    </Button>
                  </CardContent>
                </Card>
              ))}
        </section>
      </div>
    </div>
  )
}
