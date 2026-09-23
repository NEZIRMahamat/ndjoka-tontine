import { useAuth0 } from '@auth0/auth0-react'
import { Bot, Loader2, Send, Sparkles, User as UserIcon } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { type ChatMessage, sendChatMessage } from '@/features/ai/ai-api'
import { messageOf } from '@/lib/http'

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    "Bonjour, je suis Ndjoka AI. Je peux répondre à vos questions sur vos tontines, vos cotisations, vos versements et l’utilisation de l’application. Que puis-je faire pour vous ?",
}

const SUGGESTIONS = [
  'Où en sont mes cotisations ?',
  'Quand aura lieu mon prochain versement ?',
  'Résume mes tontines actives',
  'Comment créer une nouvelle tontine ?',
]

export default function NdjokaAIPage() {
  const { getAccessTokenSilently } = useAuth0()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const listEndRef = useRef<HTMLDivElement | null>(null)

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || pending) return

    const nextMessages = [...messages, { role: 'user', content: text } satisfies ChatMessage]
    setMessages(nextMessages)
    setInput('')
    setError('')
    setPending(true)

    try {
      const token = await getAccessTokenSilently()
      const reply = await sendChatMessage(token, nextMessages)
      setMessages((current) => [...current, { role: 'assistant', content: reply }])
    } catch (caught) {
      setError(messageOf(caught, "Ndjoka AI n'a pas pu répondre, réessayez."))
    } finally {
      setPending(false)
      requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-violet-200 bg-[radial-gradient(circle_at_90%_0%,#ede9fe,transparent_38%),#fff] p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
            <Sparkles />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-violet-600 uppercase">Ndjoka AI</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight">Votre assistant tontine, toujours disponible.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Posez vos questions sur vos tontines, vos cotisations ou vos versements : Ndjoka AI vous répond avec vos
              données réelles, en langage simple.
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="flex h-[560px] flex-col overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-violet-600" /> Discussion avec Ndjoka AI
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-5">
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex max-w-[85%] items-start gap-2 rounded-2xl px-4 py-3 text-sm ${
                      message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-violet-50 text-violet-950'
                    }`}
                  >
                    {message.role === 'assistant' && <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.role === 'user' && <UserIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />}
                  </div>
                </div>
              ))}
              {pending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ndjoka AI réfléchit…
                  </div>
                </div>
              )}
              <div ref={listEndRef} />
            </div>

            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-violet-300 hover:text-violet-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <form onSubmit={send} className="flex gap-2">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Écrivez votre question…"
                aria-label="Message à Ndjoka AI"
                disabled={pending}
              />
              <Button
                type="submit"
                size="icon"
                className="shrink-0 bg-violet-600 hover:bg-violet-700"
                disabled={pending || !input.trim()}
              >
                {pending ? <Loader2 className="animate-spin" /> : <Send />}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Ce que Ndjoka AI peut faire</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>• Faire le point sur vos cotisations et vos versements</p>
            <p>• Résumer l’état de vos tontines</p>
            <p>• Vous guider pour créer ou rejoindre une tontine</p>
            <p>• Expliquer les règles et le fonctionnement de l’application</p>
            <p className="mt-4 rounded-xl bg-muted/60 p-3 text-xs">
              Ndjoka AI répond uniquement à partir de vos données réelles et ne réalise aucune action financière à
              votre place.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
