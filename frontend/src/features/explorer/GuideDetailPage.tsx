import { BookOpen, ChevronRight, Clock } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { BackLink } from '@/components/shared/page-primitives'
import { GUIDES, getGuide, guideImageFor } from '@/features/explorer/guides-content'
import { cn } from '@/lib/utils'

export default function GuideDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const guide = getGuide(slug ?? '')

  if (!guide) {
    return (
      <div className="py-20 text-center text-slate-400">
        <p>Article introuvable.</p>
        <button type="button" onClick={() => navigate('/explore')} className="mt-4 text-sm text-emerald-600 hover:underline">Retour</button>
      </div>
    )
  }

  const others = GUIDES.filter((item) => item.id !== guide.id).slice(0, 2)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink to="/explore" label="Conseils Tontine" />

      <div className="relative h-56 overflow-hidden rounded-2xl shadow-sm sm:h-72">
        <img src={guideImageFor(guide)} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute right-5 bottom-5 left-5">
          <span className={cn('rounded-full border px-3 py-1 text-xs font-bold', guide.categoryColor)}>{guide.category}</span>
          <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">{guide.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/60"><Clock size={12} /> {guide.readMinutes} min de lecture</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-6 border-b border-slate-100 pb-6 text-base leading-relaxed font-medium text-slate-600">{guide.excerpt}</p>
        <div className="space-y-5">
          {guide.content.map((block, index) => (
            <div key={index}>
              {block.heading && (
                <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-800">
                  <span className="inline-block h-5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {block.heading}
                </h2>
              )}
              <p className="text-sm leading-relaxed text-slate-600">{block.body}</p>
            </div>
          ))}
        </div>
      </div>

      {others.length > 0 && (
        <div>
          <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-800"><BookOpen size={16} className="text-slate-400" /> Autres conseils</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {others.map((item) => (
              <Link key={item.id} to={`/guides/${item.slug}`} className="group flex overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="w-24 shrink-0 overflow-hidden">
                  <img src={guideImageFor(item)} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
                  <div>
                    <span className={cn('rounded-full border px-2 py-0.5 text-xs font-bold', item.categoryColor)}>{item.category}</span>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-700 transition-colors group-hover:text-emerald-700">{item.title}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600">Lire <ChevronRight size={12} /></div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
