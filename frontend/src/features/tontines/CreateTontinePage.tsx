import { Fragment, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowLeft, ArrowRight, Calendar, Check, Globe, Hash, Loader2, Lock, Shield, Wallet } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Toggle } from '@/components/shared/page-primitives'
import { localQuote } from '@/features/fees/fees-api'
import { CATEGORY_META, CATEGORY_ORDER, ORDER_MODE_META, cycleFrequencyLabels } from '@/features/tontines/tontine-presentation'
import { setupTontine, type TontineCategory, type TurnOrderMode } from '@/features/tontines/tontines-api'
import type { CycleFrequency } from '@/features/tontines/cycles-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

type Visibility = 'public' | 'invite'

type FormData = {
  name: string
  description: string
  category: TontineCategory | ''
  goal: string
  city: string
  amount: string
  frequency: CycleFrequency
  maxMembers: string
  startDate: string
  orderMode: TurnOrderMode
  visibility: Visibility
  minScore: string
  rules: string
  latePenalty: boolean
}

const STEPS = ['Informations', 'Paramètres', 'Règles', 'Récapitulatif']
const FREQUENCIES: CycleFrequency[] = ['monthly', 'weekly']
const ORDER_MODES: TurnOrderMode[] = ['lottery', 'registration', 'vote']
const SCORE_OPTIONS = [
  { value: 'none', label: 'Ouverte à tous' },
  { value: '0.450', label: 'Score moyen minimum (45/100)' },
  { value: '0.650', label: 'Bon score minimum (65/100)' },
  { value: '0.800', label: 'Excellent score minimum (80/100)' },
]

function defaultStartDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-0">
      {STEPS.map((label, index) => (
        <Fragment key={label}>
          <div className="flex flex-col items-center">
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all',
              index < current ? 'bg-emerald-600 text-white' : index === current ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : 'bg-slate-100 text-slate-400',
            )}>
              {index < current ? <Check size={14} /> : index + 1}
            </div>
            <span className={cn('mt-1 hidden text-xs sm:block', index === current ? 'font-semibold text-emerald-700' : 'text-slate-400')}>{label}</span>
          </div>
          {index < STEPS.length - 1 && <div className={cn('mx-1 mb-4 h-px w-12 transition-colors sm:w-16', index < current ? 'bg-emerald-500' : 'bg-slate-200')} />}
        </Fragment>
      ))}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-500 uppercase">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition-all focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 focus:outline-none'

export default function CreateTontinePage() {
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormData>({
    name: '', description: '', category: '', goal: '', city: '',
    amount: '', frequency: 'monthly', maxMembers: '', startDate: defaultStartDate(),
    orderMode: 'lottery', visibility: 'public', minScore: 'none', rules: '', latePenalty: true,
  })

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => setForm((previous) => ({ ...previous, [key]: value }))

  const amount = Number(form.amount)
  const members = Number(form.maxMembers)
  const quote = localQuote(amount, members)

  const canNext = () => {
    if (step === 0) return form.name.trim().length > 2 && form.category !== ''
    if (step === 1) return amount > 0 && members >= 2 && members <= 200 && form.startDate !== ''
    return true
  }

  async function handleCreate() {
    if (!form.category) return
    setSubmitting(true)
    try {
      const token = await getAccessTokenSilently()
      const { tontine } = await setupTontine(token, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        currency: 'EUR',
        max_members: members,
        is_discoverable: form.visibility === 'public',
        min_reliability_score: form.visibility === 'public' && form.minScore !== 'none' ? form.minScore : null,
        category: form.category,
        goal: form.goal.trim() || null,
        city: form.city.trim() || null,
        order_mode: form.orderMode,
        rules: form.rules.trim() || null,
        late_penalty_enabled: form.latePenalty,
        cover_image_url: null,
        contribution_amount: amount.toFixed(2),
        frequency: form.frequency,
        start_date: form.startDate,
        timezone: 'Europe/Paris',
        beneficiary_contributes: true,
      })
      toast.success('Tontine créée avec succès !', { description: form.visibility === 'public' ? `« ${form.name} » est visible dans l'Explorer.` : `« ${form.name} » est prête : invitez vos membres.` })
      navigate(`/tontines/${tontine.id}`)
    } catch (caught) {
      toast.error(messageOf(caught, 'La création de la tontine a échoué.'))
    } finally {
      setSubmitting(false)
    }
  }

  const slide = { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } }

  return (
    <div className="mx-auto max-w-2xl">
      <button type="button" onClick={() => navigate('/tontines')} className="mb-5 flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700">
        <ArrowLeft size={15} /> Mes Tontines
      </button>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-600 to-teal-600 px-6 pt-6 pb-4 text-white">
          <h1 className="mb-0.5 text-xl font-bold">Créer une tontine</h1>
          <p className="text-sm text-white/70">Configurez votre groupe en quelques étapes</p>
        </div>

        <div className="p-6">
          <StepIndicator current={step} />

          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="step0" {...slide} className="space-y-5">
                <Field label="Nom de la tontine *">
                  <input className={inputCls} placeholder="Ex : Tontine Famille Diop, Business Femmes…" value={form.name} onChange={(event) => set('name', event.target.value)} maxLength={120} />
                </Field>
                <Field label="Description" hint="Décrivez l'objectif et l'esprit du groupe">
                  <textarea rows={3} className={cn(inputCls, 'resize-none')} placeholder="Groupe de collègues souhaitant financer…" value={form.description} onChange={(event) => set('description', event.target.value)} />
                </Field>
                <Field label="Catégorie *">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {CATEGORY_ORDER.map((id) => {
                      const meta = CATEGORY_META[id]
                      const Icon = meta.icon
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => set('category', id)}
                          className={cn(
                            'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all',
                            form.category === id ? cn('ring-2 ring-emerald-500', meta.tile) : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                          )}
                        >
                          <Icon size={16} /> {meta.label}
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Objectif principal" hint="Optionnel, aide les futurs membres">
                    <input className={inputCls} placeholder="Ex : Financer une voiture, un voyage…" value={form.goal} onChange={(event) => set('goal', event.target.value)} maxLength={255} />
                  </Field>
                  <Field label="Ville" hint="Optionnel, affichée dans l'Explorer">
                    <input className={inputCls} placeholder="Ex : Paris" value={form.city} onChange={(event) => set('city', event.target.value)} maxLength={120} />
                  </Field>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="step1" {...slide} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Cotisation par tour (€) *">
                    <div className="relative">
                      <Wallet size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                      <input type="number" min="1" step="0.01" className={cn(inputCls, 'pl-9')} placeholder="100" value={form.amount} onChange={(event) => set('amount', event.target.value)} />
                    </div>
                  </Field>
                  <Field label="Nombre de membres *">
                    <div className="relative">
                      <Hash size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                      <input type="number" min="2" max="200" className={cn(inputCls, 'pl-9')} placeholder="10" value={form.maxMembers} onChange={(event) => set('maxMembers', event.target.value)} />
                    </div>
                  </Field>
                </div>

                <Field label="Fréquence des cotisations *">
                  <div className="flex flex-wrap gap-2">
                    {FREQUENCIES.map((frequency) => (
                      <button
                        key={frequency}
                        type="button"
                        onClick={() => set('frequency', frequency)}
                        className={cn('flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-all', form.frequency === frequency ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                      >
                        <Calendar size={14} /> {cycleFrequencyLabels[frequency]}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date du premier tour *" hint="Les cotisations sont dues à chaque tour">
                    <input type="date" className={inputCls} value={form.startDate} onChange={(event) => set('startDate', event.target.value)} />
                  </Field>
                  <Field label="Durée du cycle (en tours)" hint="Calculée automatiquement : 1 tour par membre">
                    <div className={cn(inputCls, 'flex cursor-default items-center justify-between bg-slate-50 text-slate-500 select-none')}>
                      <span>{members >= 2 ? `${members} tours` : 'Renseignez le nombre de membres'}</span>
                      {members >= 2 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Auto</span>}
                    </div>
                  </Field>
                </div>

                {amount > 0 && members >= 2 && (
                  <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Total brut du tour</span>
                      <span className="text-sm font-semibold text-slate-600">{formatCurrencyAmount(quote.gross, 'EUR')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">
                        Frais Ndjoka ({quote.rate.toFixed(1).replace('.', ',')} %)
                        <span className="ml-1 text-xs text-slate-400">· {formatCurrencyAmount(quote.feeUnit, 'EUR')} × {members} membres</span>
                      </span>
                      <span className="text-sm text-slate-400">− {formatCurrencyAmount(quote.feeTotal, 'EUR')}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>dont fonds de solidarité (1/6)</span>
                      <span>{formatCurrencyAmount(quote.solidarity, 'EUR')}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-emerald-200 pt-2">
                      <span className="text-sm font-bold text-emerald-700">Levée estimée par bénéficiaire</span>
                      <span className="text-lg font-bold text-emerald-700">{formatCurrencyAmount(quote.net, 'EUR')}</span>
                    </div>
                    {quote.sepaOnly && <p className="text-xs text-amber-700">Au-delà de 300 € par cotisation, seul le prélèvement SEPA est proposé aux membres.</p>}
                  </div>
                )}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" {...slide} className="space-y-5">
                <Field label="Ordre de passage *">
                  <div className="space-y-2">
                    {ORDER_MODES.map((mode) => {
                      const meta = ORDER_MODE_META[mode]
                      const Icon = meta.icon
                      const selected = form.orderMode === mode
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => set('orderMode', mode)}
                          className={cn('flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all', selected ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200' : 'border-slate-200 hover:bg-slate-50')}
                        >
                          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500')}>
                            <Icon size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{meta.label}</p>
                            <p className="text-xs text-slate-400">{meta.description}</p>
                          </div>
                          {selected && <Check size={16} className="ml-auto shrink-0 text-emerald-600" />}
                        </button>
                      )
                    })}
                  </div>
                </Field>

                <Field label="Visibilité du groupe">
                  <div className="flex gap-3">
                    {([['public', 'Publique', Globe], ['invite', 'Sur invitation', Lock]] as const).map(([value, label, Icon]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => set('visibility', value)}
                        className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-all', form.visibility === value ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
                      >
                        <Icon size={15} /> {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {form.visibility === 'public' ? "Visible dans l'Explorer : les épargnants compatibles peuvent la rejoindre directement." : 'Les membres rejoignent uniquement via une invitation par e-mail.'}
                  </p>
                </Field>

                {form.visibility === 'public' && (
                  <Field label="Fiabilité exigée" hint="Réserve l'adhésion aux membres dont le score de fiabilité atteint ce niveau">
                    <select className={inputCls} value={form.minScore} onChange={(event) => set('minScore', event.target.value)}>
                      {SCORE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                )}

                <Field label="Pénalité de retard">
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Signaler les retards au groupe</p>
                      <p className="text-xs text-slate-400">Les retards sont visibles par tous les membres et pèsent sur le score</p>
                    </div>
                    <Toggle on={form.latePenalty} onClick={() => set('latePenalty', !form.latePenalty)} label="Pénalité de retard" />
                  </div>
                </Field>

                <Field label="Règlement personnalisé" hint="Optionnel : règles spécifiques à votre groupe">
                  <textarea rows={3} className={cn(inputCls, 'resize-none')} placeholder="Ex : Les membres doivent être présents à la réunion mensuelle…" value={form.rules} onChange={(event) => set('rules', event.target.value)} />
                </Field>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" {...slide} className="space-y-4">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="mb-1 text-xs font-bold tracking-wider text-emerald-600 uppercase">Prêt à créer</p>
                  <h3 className="text-lg font-bold text-slate-800">{form.name}</h3>
                  {form.description && <p className="mt-1 text-sm text-slate-500">{form.description}</p>}
                </div>

                {[
                  {
                    icon: CATEGORY_META[form.category || 'other'].icon, title: 'Informations',
                    rows: [
                      ['Catégorie', form.category ? CATEGORY_META[form.category].label : '—'],
                      form.goal ? ['Objectif', form.goal] : null,
                      form.city ? ['Ville', form.city] : null,
                    ],
                  },
                  {
                    icon: Wallet, title: 'Paramètres financiers',
                    rows: [
                      ['Cotisation', formatCurrencyAmount(amount, 'EUR')],
                      ['Fréquence', cycleFrequencyLabels[form.frequency]],
                      ['Membres', String(members)],
                      ['Premier tour', new Date(form.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })],
                      ['Pot brut par tour', formatCurrencyAmount(quote.gross, 'EUR')],
                      ['Frais Ndjoka par tour', `${formatCurrencyAmount(quote.feeTotal, 'EUR')} (${quote.rate.toFixed(1).replace('.', ',')} %)`],
                      ['Levée nette par bénéficiaire', formatCurrencyAmount(quote.net, 'EUR')],
                    ],
                  },
                  {
                    icon: Shield, title: 'Règles',
                    rows: [
                      ['Ordre de passage', ORDER_MODE_META[form.orderMode].label],
                      ['Visibilité', form.visibility === 'public' ? 'Publique' : 'Sur invitation'],
                      form.visibility === 'public' ? ['Fiabilité exigée', SCORE_OPTIONS.find((option) => option.value === form.minScore)?.label ?? 'Ouverte à tous'] : null,
                      ['Retards signalés', form.latePenalty ? 'Oui' : 'Non'],
                    ],
                  },
                ].map(({ icon: Icon, title, rows }) => (
                  <div key={title} className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                      <Icon size={14} className="text-slate-400" />
                      <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">{title}</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {rows.filter((row): row is string[] => row !== null).map((row) => (
                        <div key={row[0]} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                          <span className="text-slate-500">{row[0]}</span>
                          <span className="text-right font-semibold text-slate-700">{row[1]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-400">
                  La tontine est créée en phase de recrutement. Une fois les membres réunis, vous lancerez le cycle depuis sa fiche : l'ordre des tours sera alors établi selon la règle choisie.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 flex justify-between border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => (step > 0 ? setStep((value) => value - 1) : navigate('/tontines'))}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft size={15} /> {step === 0 ? 'Annuler' : 'Précédent'}
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((value) => value + 1)}
                disabled={!canNext()}
                className={cn('flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors', canNext() ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-100 text-slate-400')}
              >
                Suivant <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Créer la tontine
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
