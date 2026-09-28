import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Bot, ChevronRight, Clock, RefreshCw, Send, ShieldCheck, Sparkles, Star, Target, TrendingUp, User, Wallet } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'

import { sendChatMessage, type ChatMessage, type RecommendedTontine } from '@/features/ai/ai-api'
import { discoverTontines } from '@/features/explorer/discovery-api'
import { CATEGORY_META, frequencyShortLabels } from '@/features/tontines/tontine-presentation'
import type { TontineCategory } from '@/features/tontines/tontines-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

type Message = ChatMessage & { id: string; timestamp: Date }

const SUGGESTIONS = ['Je débute en tontine', 'Où en sont mes cotisations ?', 'Mon budget est 200 € par mois', 'Combien coûte une tontine de 10 × 500 € ?']

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Bonjour ! Je suis Ndjoka AI, votre conseiller en tontines. Parlez-moi de votre budget, de vos objectifs et de vos capacités d'épargne : je vous aide à trouver la tontine qui vous convient et à suivre vos cotisations.",
  timestamp: new Date(),
}

function RecCard({ rec, index, onOpen }: { rec: RecommendedTontine; index: number; onOpen: () => void }) {
  const category = CATEGORY_META[(rec.category as TontineCategory) in CATEGORY_META ? (rec.category as TontineCategory) : 'other']
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }} onClick={onOpen} role="link" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen()} className="group cursor-pointer rounded-xl border border-slate-100 bg-white p-4 transition-all hover:border-emerald-200 hover:shadow-md">
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', category.chip)}>{category.label}</span>
          <div className="flex items-center gap-1 text-amber-500">
            <Star size={11} className="fill-amber-400" />
            <span className="text-xs font-bold">{Math.round(rec.affinity_score * 100)}%</span>
          </div>
        </div>
        <ChevronRight size={15} className="text-slate-300 transition-colors group-hover:text-emerald-500" />
      </div>
      <h4 className="mb-1 text-sm font-bold text-slate-800">{rec.name}</h4>
      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-slate-500">{rec.reasons[0] ?? rec.description ?? 'Tontine ouverte aux nouveaux membres.'}</p>
      <div className="mb-3 grid grid-cols-3 gap-1.5 text-center">
        {[
          { value: rec.contribution_amount ? formatCurrencyAmount(rec.contribution_amount, rec.currency) : '—', label: rec.frequency ? `/ ${frequencyShortLabels[rec.frequency as 'weekly' | 'monthly'] ?? rec.frequency}` : 'cotisation' },
          { value: rec.max_members ? `${rec.max_members} tours` : '—', label: 'durée' },
          { value: `${rec.member_count}${rec.max_members ? `/${rec.max_members}` : ''}`, label: 'membres' },
        ].map(({ value, label }) => (
          <div key={label} className="rounded-lg bg-slate-50 p-1.5">
            <div className="text-sm font-bold text-emerald-700">{value}</div>
            <div className="text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>
      <span className={cn('block w-full rounded-lg border py-1.5 text-center text-xs font-semibold transition-all', rec.is_eligible ? 'border-emerald-200 text-emerald-700 group-hover:border-emerald-600 group-hover:bg-emerald-600 group-hover:text-white' : 'border-slate-200 text-slate-400')}>
        {rec.is_eligible ? 'Voir et rejoindre' : 'Score insuffisant'}
      </span>
    </motion.div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('mb-3 flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', isUser ? 'bg-emerald-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600')}>
        {isUser ? <User size={14} className="text-white" /> : <Sparkles size={14} className="text-white" />}
      </div>
      <div className={cn('flex max-w-[82%] flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div className={cn('rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap', isUser ? 'rounded-tr-sm bg-emerald-600 text-white' : 'rounded-tl-sm border border-slate-200 bg-slate-50 text-slate-700')}>
          {renderMarkdownLite(message.content)}
        </div>
        <span className="px-1 text-xs text-slate-400">{message.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </motion.div>
  )
}

/** Gras et listes simples pour les réponses de l'assistant, sans HTML brut. */
function renderMarkdownLite(text: string) {
  const cleaned = text.replace(/^\|.*\|$/gm, (line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()).filter((cell) => !/^:?-{2,}:?$/.test(cell)).join(' · ')).replace(/<br\s*\/?>/gi, ' ')
  return cleaned.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong> : part)
}

export default function NdjokaAIPage() {
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [recommendations, setRecommendations] = useState<RecommendedTontine[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const result = await discoverTontines(token, { limit: 4 }, controller.signal)
        if (active) setRecommendations(result.items.map((item) => ({
          id: item.id, name: item.name, description: item.description, category: item.category, city: item.city, currency: item.currency,
          contribution_amount: item.contribution_amount ? Number(item.contribution_amount) : null, frequency: item.frequency,
          monthly_equivalent: item.monthly_equivalent ? Number(item.monthly_equivalent) : null, seats_left: item.seats_left,
          member_count: item.member_count, max_members: item.max_members, affinity_score: Number(item.affinity_score),
          is_eligible: item.is_eligible, ineligibility_reason: item.ineligibility_reason,
          reasons: item.reasons.filter((reason) => reason.matched).map((reason) => reason.label), cover_image_url: item.cover_image_url,
        })))
      } catch {
        /* les recommandations initiales sont optionnelles */
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently])

  useEffect(() => {
    if (messages.length <= 1 && !pending) return
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, pending])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || pending) return
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content, timestamp: new Date() }
    const history = [...messages, userMessage]
    setMessages(history)
    setInput('')
    setError('')
    setPending(true)
    try {
      const token = await getAccessTokenSilently()
      const reply = await sendChatMessage(token, history.slice(-16).map(({ role, content: body }) => ({ role, content: body })))
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: reply.reply, timestamp: new Date() }])
      if (reply.recommendations.length > 0) setRecommendations(reply.recommendations)
    } catch (caught) {
      setMessages(messages)
      setInput(content)
      setError(messageOf(caught, "Ndjoka AI n'a pas pu répondre. Votre message est conservé pour réessayer."))
    } finally {
      setPending(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void send()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-600 px-6 py-5 text-white">
        <div className="pointer-events-none absolute top-0 right-0 h-full w-56 -translate-x-4 rounded-l-full bg-white/5" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><Sparkles size={20} /></div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Ndjoka AI</h1>
              <p className="text-xs text-white/70">Conseiller intelligent en tontines</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[{ icon: Target, label: 'Objectifs' }, { icon: Wallet, label: 'Budget' }, { icon: TrendingUp, label: 'Simulation' }].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium"><Icon size={11} /> {label}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ height: '560px' }}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-sm font-semibold text-slate-700">Ndjoka AI · En ligne</span>
            </div>
            <button type="button" onClick={() => { setMessages([{ ...WELCOME, id: crypto.randomUUID(), timestamp: new Date() }]); setInput(''); setError('') }} disabled={pending} className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50">
              <RefreshCw size={11} /> Nouvelle conversation
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4" role="log" aria-label="Conversation avec Ndjoka AI">
            {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
            <AnimatePresence>
              {pending && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-3 flex gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600"><Sparkles size={14} className="text-white" /></div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-slate-200 bg-slate-50 px-4 py-3">
                    {[0, 150, 300].map((delay) => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${delay}ms` }} />)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={endRef} />
          </div>

          {error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-50 p-3 text-xs text-red-600">{error}</p>}

          {messages.length <= 1 && (
            <div className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-2">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">{suggestion}</button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="shrink-0 px-4 pb-4">
            <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 transition-all focus-within:border-emerald-300 focus-within:ring-1 focus-within:ring-emerald-100">
              <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Budget, objectif, durée…" aria-label="Message à Ndjoka AI" maxLength={4000} disabled={pending} className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none" />
              <button type="submit" disabled={!input.trim() || pending} aria-label="Envoyer" className={cn('flex h-9 w-9 items-center justify-center rounded-lg transition-all', input.trim() && !pending ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-200 text-slate-400')}>
                <Send size={15} />
              </button>
            </div>
          </form>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Bot size={17} className="text-emerald-600" /> Recommandations pour vous</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{recommendations.length} résultat{recommendations.length > 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '510px' }}>
            {recommendations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
                Demandez une recommandation à Ndjoka AI ou complétez votre <button type="button" onClick={() => navigate('/profile/savings')} className="font-semibold text-emerald-600 hover:underline">profil d'épargnant</button>.
              </div>
            ) : recommendations.map((rec, index) => <RecCard key={rec.id} rec={rec} index={index} onOpen={() => navigate(`/explore/${rec.id}`)} />)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: ShieldCheck, value: 'Vos données', label: 'Réponses fondées sur votre compte', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { icon: Wallet, value: 'Lecture seule', label: 'Aucune action sans vous', color: 'text-teal-700', bg: 'bg-teal-50' },
          { icon: Clock, value: 'Quelques secondes', label: 'Temps de réponse', color: 'text-slate-600', bg: 'bg-slate-100' },
        ].map(({ icon: Icon, value, label, color, bg }) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
            <div className={cn('mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg', bg)}><Icon size={16} className={color} /></div>
            <div className={cn('text-sm font-bold', color)}>{value}</div>
            <div className="mt-0.5 text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
