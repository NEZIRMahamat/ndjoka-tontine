import { useEffect, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { CheckCircle2, CreditCard, Landmark, Loader2, Plus, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { useConfirm } from '@/components/shared/confirm-dialog'
import { BackLink, ErrorNotice, SkeletonBlock } from '@/components/shared/page-primitives'
import { addPaymentMethod, listPaymentMethods, PAYMENT_METHOD_LABELS, removePaymentMethod, setDefaultPaymentMethod, type PaymentMethod, type PaymentMethodType } from '@/features/profile/payment-methods-api'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

const ICONS = { card: CreditCard, sepa: Landmark, mobile_money: Smartphone }
const TONES = { card: 'bg-blue-50 text-blue-600', sepa: 'bg-emerald-50 text-emerald-600', mobile_money: 'bg-orange-50 text-orange-500' }
const PLACEHOLDERS: Record<PaymentMethodType, { label: string; identifier: string; hint: string }> = {
  card: { label: 'Visa, Mastercard…', identifier: '4242 4242 4242 4242', hint: 'Seuls les 4 derniers chiffres sont conservés.' },
  sepa: { label: 'Compte courant', identifier: 'FR76 3000 6000 0112 3456 7890 189', hint: "L'IBAN n'est jamais stocké par Ndjoka : seule sa terminaison est conservée." },
  mobile_money: { label: 'Orange Money, Wave…', identifier: '+33 6 12 34 56 78', hint: 'Numéro associé à votre compte Mobile Money.' },
}
const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition-all focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 focus:outline-none'

export default function PaymentMethodsPage() {
  const { getAccessTokenSilently } = useAuth0()
  const confirm = useConfirm()
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState<PaymentMethodType>('card')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const items = await listPaymentMethods(token, controller.signal)
        if (active) setMethods(items)
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Moyens de paiement indisponibles.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload])

  async function run(key: string, work: (token: string) => Promise<unknown>, success: string) {
    setBusy(key)
    try {
      const token = await getAccessTokenSilently()
      await work(token)
      toast.success(success)
      setReload((value) => value + 1)
    } catch (caught) {
      toast.error(messageOf(caught, 'Action impossible.'))
    } finally {
      setBusy('')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run('add', (token) => addPaymentMethod(token, {
      type,
      label: String(data.get('label') ?? '').trim(),
      identifier: String(data.get('identifier') ?? '').trim(),
      make_default: data.get('default') === 'on',
    }), 'Moyen de paiement ajouté')
    setAdding(false)
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <BackLink to="/profile" label="Mon Profil" />
      {error && <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />}

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
          <h2 className="font-bold text-slate-800">Moyens de paiement</h2>
          <p className="mt-0.5 text-xs text-slate-400">Gérez vos cartes, comptes SEPA et Mobile Money</p>
        </div>

        {!methods ? (
          <div className="space-y-3 p-5"><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /></div>
        ) : methods.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Aucun moyen de paiement déclaré pour le moment.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {methods.map((method) => {
              const Icon = ICONS[method.type]
              return (
                <div key={method.id} className="flex items-center gap-4 px-5 py-4">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES[method.type])}><Icon size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700">{method.label}</p>
                    <p className="text-xs text-slate-400">{PAYMENT_METHOD_LABELS[method.type]} · {method.type === 'mobile_money' ? `•••• ${method.last4}` : `•••• •••• •••• ${method.last4}`}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {method.is_default ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600"><CheckCircle2 size={12} /> Par défaut</span>
                    ) : (
                      <button type="button" disabled={busy !== ''} onClick={() => void run(method.id, (token) => setDefaultPaymentMethod(token, method.id), 'Méthode par défaut mise à jour')} className="text-xs text-slate-400 transition-colors hover:text-emerald-600">Définir par défaut</button>
                    )}
                    <button
                      type="button"
                      disabled={busy !== ''}
                      onClick={async () => { if (await confirm({ title: `Supprimer ${method.label} ?`, destructive: true, confirmLabel: 'Supprimer' })) void run(method.id, (token) => removePaymentMethod(token, method.id), 'Méthode supprimée') }}
                      className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-400"
                      aria-label="Supprimer"
                    >
                      {busy === method.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="px-5 pt-3 pb-5">
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} disabled={(methods?.length ?? 0) >= 5} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-400 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50">
              <Plus size={16} /> Ajouter un moyen de paiement
            </button>
          ) : (
            <form onSubmit={submit} className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(ICONS) as PaymentMethodType[]).map((value) => {
                  const Icon = ICONS[value]
                  return (
                    <button key={value} type="button" onClick={() => setType(value)} className={cn('flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all', type === value ? 'border-emerald-400 bg-white text-emerald-700 ring-1 ring-emerald-200' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')}>
                      <Icon size={16} /> {PAYMENT_METHOD_LABELS[value]}
                    </button>
                  )
                })}
              </div>
              <input name="label" required minLength={2} maxLength={60} placeholder={`Libellé (ex : ${PLACEHOLDERS[type].label})`} className={inputCls} />
              <input name="identifier" required minLength={4} maxLength={64} placeholder={PLACEHOLDERS[type].identifier} className={inputCls} autoComplete="off" />
              <p className="text-xs text-slate-500">{PLACEHOLDERS[type].hint}</p>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="default" className="h-4 w-4 accent-emerald-600" /> Utiliser par défaut</label>
              <div className="flex gap-2">
                <button type="submit" disabled={busy === 'add'} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{busy === 'add' && <Loader2 size={14} className="animate-spin" />} Ajouter</button>
                <button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600">Annuler</button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-4 text-xs text-slate-500 shadow-sm">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        <p>Ndjoka ne stocke aucun numéro de carte ni IBAN complet. Le traitement des paiements est confié à un prestataire agréé ; les cotisations vont directement au bénéficiaire du tour. Au-delà de 300 € par cotisation, seul le prélèvement SEPA est proposé.</p>
      </div>
    </div>
  )
}
