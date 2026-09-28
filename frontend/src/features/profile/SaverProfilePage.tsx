import { BackLink } from '@/components/shared/page-primitives'
import SaverProfileSection from '@/features/profile/SaverProfileSection'

export default function SaverProfilePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink to="/profile" label="Mon Profil" />
      <SaverProfileSection />
    </div>
  )
}
