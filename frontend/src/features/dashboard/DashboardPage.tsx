import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowRight, Archive, Plus, TrendingUp, Waypoints } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useCurrentUser } from '@/app/current-user-context'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { listTontines, type TontinePage } from '@/features/tontines/tontines-api'
import { messageOf } from '@/lib/http'

export default function DashboardPage() {
  const profile = useCurrentUser()
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const [page, setPage] = useState<TontinePage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const result = await listTontines(token, 0, controller.signal)
        if (active) setPage(result)
      } catch (caught) {
        if (active) setError(messageOf(caught, 'Chargement impossible'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently])

  const active = page?.items.filter((item) => item.status === 'active').length ?? 0
  const draft = page?.items.filter((item) => item.status === 'draft').length ?? 0
  const archived = page?.items.filter((item) => item.status === 'archived').length ?? 0
  const name = profile.display_name?.split(' ')[0] ?? profile.email?.split('@')[0] ?? 'membre'

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(120deg,#14532d,#1da35a)] p-6 text-white shadow-xl shadow-emerald-900/10 sm:p-8">
        <div className="relative z-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-emerald-100 uppercase">Vue d’ensemble</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Bonjour, {name} <span aria-hidden>👋</span></h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-emerald-50/90">Gardez le cap sur vos objectifs et retrouvez vos groupes en un clin d’œil.</p>
          </div>
          <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={() => navigate('/tontines')}><Plus /> Nouvelle tontine</Button>
        </div>
        <div className="absolute -right-16 -bottom-24 h-64 w-64 rounded-full border-[30px] border-white/10" />
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Waypoints}
          tone="blue"
          label="Tontines accessibles"
          value={page?.total ?? null}
          hint="Comme propriétaire ou membre actif"
        />
        <StatCard
          icon={TrendingUp}
          tone="green"
          label="Groupes actifs"
          value={page ? active : null}
          hint={`${draft} brouillon${draft > 1 ? 's' : ''} à préparer`}
        />
        <StatCard
          icon={Archive}
          tone="purple"
          label="Archives"
          value={page ? archived : null}
          hint="Conservées en lecture seule"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Derniers groupes</p>
            <CardTitle className="mt-1 text-base">Vos tontines</CardTitle>
          </div>
          <Button variant="link" className="h-auto p-0" onClick={() => navigate('/tontines')}>
            Tout gérer <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {!page ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : page.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Créez votre première tontine pour commencer.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {page.items.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/tontines/${item.id}`)}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {item.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.currency} · {item.max_members ?? '∞'} membres
                    </span>
                  </span>
                  <StatusBadge status={item.status} />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="h-fit border-violet-200 bg-[linear-gradient(145deg,#fff,#f5f3ff)]">
        <CardContent className="p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white"><span className="text-lg">✦</span></div>
          <h3 className="mt-4 text-lg font-bold text-foreground">Un doute sur votre prochaine tontine ?</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Ndjoka AI vous aide à comparer un budget, un objectif et un rythme d’épargne avant de vous engager.</p>
          <Button variant="outline" className="mt-5 border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => navigate('/ndjoka-ai')}>Parler à Ndjoka AI</Button>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

const toneClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  purple: 'bg-violet-50 text-violet-600',
} as const

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof TrendingUp
  tone: keyof typeof toneClasses
  label: string
  value: number | null
  hint: string
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          {value === null ? (
            <Skeleton className="mt-2 h-7 w-10" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  )
}
