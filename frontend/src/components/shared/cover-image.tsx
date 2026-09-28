import { useState } from 'react'

import { CATEGORY_META, coverImageFor } from '@/features/tontines/tontine-presentation'
import type { TontineCategory } from '@/features/tontines/tontines-api'
import { cn } from '@/lib/utils'

/**
 * Image de couverture d'une tontine avec repli élégant : si l'image distante
 * ne se charge pas, un dégradé aux couleurs de la catégorie prend le relais,
 * avec l'icône de la catégorie en filigrane. Aucune zone cassée à l'écran.
 */
export function CoverImage({ category, src, alt = '', className, imgClassName }: { category: TontineCategory; src: string | null; alt?: string; className?: string; imgClassName?: string }) {
  const url = coverImageFor(category, src)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const failed = failedUrl === url
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br', meta.gradient, className)} aria-hidden={alt === ''}>
      {!failed && (
        <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailedUrl(url)} className={cn('absolute inset-0 h-full w-full object-cover', imgClassName)} />
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-16 w-16 text-white/25" strokeWidth={1.5} />
        </div>
      )}
    </div>
  )
}
