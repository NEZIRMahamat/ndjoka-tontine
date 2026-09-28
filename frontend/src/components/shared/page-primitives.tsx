import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { cn } from '@/lib/utils'

export function BackLink({ to, label }: { to?: string; label: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
    >
      <ArrowLeft size={15} /> {label}
    </button>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-slate-100 bg-white shadow-sm', className)}>{children}</div>
}

export function PanelHeader({ title, aside, className }: { title: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3', className)}>
      <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">{title}</h3>
      {aside}
    </div>
  )
}

export function InitialsAvatar({ name, className, tone = 'emerald' }: { name: string; className?: string; tone?: 'emerald' | 'slate' | 'blue' | 'amber' | 'red' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase() || '?'
  const tones = {
    emerald: 'bg-emerald-600 text-white',
    slate: 'bg-slate-300 text-white',
    blue: 'bg-blue-500 text-white',
    amber: 'bg-amber-400 text-white',
    red: 'bg-red-400 text-white',
  }
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-full text-xs font-bold', tones[tone], className ?? 'h-8 w-8')} aria-hidden>
      {initials}
    </div>
  )
}

export function ProgressRing({ value, total, size = 36, stroke = 3, children }: { value: number; total: number; size?: number; stroke?: number; children?: ReactNode }) {
  const radius = size / 2 - stroke - 1
  const circumference = 2 * Math.PI * radius
  const ratio = total === 0 ? 0 : Math.min(1, value / total)
  const color = ratio >= 1 ? '#10b981' : ratio > 0 ? '#f59e0b' : '#e2e8f0'
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          strokeLinecap="round"
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  )
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
          Réessayer
        </button>
      )}
    </div>
  )
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-100', className)} aria-hidden />
}

export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-emerald-500' : 'bg-slate-200')}
    >
      <span className={cn('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5')} />
    </button>
  )
}

export function StatusPill({ tone, children, className }: { tone: 'emerald' | 'amber' | 'red' | 'slate' | 'blue' | 'purple'; children: ReactNode; className?: string }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    slate: 'bg-slate-50 text-slate-500 border-slate-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  }
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', tones[tone], className)}>{children}</span>
}


export function scoreTone(score: number): 'emerald' | 'blue' | 'amber' | 'red' {
  if (score >= 80) return 'emerald'
  if (score >= 65) return 'blue'
  if (score >= 45) return 'amber'
  return 'red'
}

/** Pastille compacte « 82 » avec la couleur de la tranche de fiabilité. */
export function ScoreChip({ score, provisional, className }: { score: string | number | null | undefined; provisional?: boolean | null; className?: string }) {
  if (score === null || score === undefined) return null
  const value = Math.round(Number(score) * 100)
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  }
  return (
    <span
      title={`Score de fiabilité ${value}/100${provisional ? ' (provisoire)' : ''}`}
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums', tones[scoreTone(value)], provisional && 'border-dashed', className)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {value}
    </span>
  )
}
