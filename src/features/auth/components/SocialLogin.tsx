import facebookIcon from '@/assets/icons/facebook.svg'
import googleIcon from '@/assets/icons/google.svg'
import { cn } from '@/lib/utils'

interface SocialLoginProps {
  /** Gap between the buttons: 12px in the login modal, 16px in signup and mobile. */
  gapClass: string
  sidePaddingClass: string
  onUnavailable: (message: string) => void
}

const providers = [
  { name: 'Google', icon: googleIcon },
  { name: 'Facebook', icon: facebookIcon },
]

/**
 * Social login is out of the demo scope: the buttons keep the Figma composition but
 * report that they are unavailable instead of pretending to sign in.
 */
export function SocialLogin({ gapClass, sidePaddingClass, onUnavailable }: SocialLoginProps) {
  return (
    <div className={cn('flex flex-col', gapClass)}>
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border-field" />
        <span className="text-caption-13 text-cream">Ou continue com</span>
        <span className="h-px flex-1 bg-border-field" />
      </div>
      <p className="sr-only">Ou continue com</p>
      <div className={cn('flex flex-col', gapClass, sidePaddingClass)}>
        {providers.map((provider) => (
          <button
            key={provider.name}
            type="button"
            onClick={() => onUnavailable(`Login com ${provider.name} indisponível na demonstração.`)}
            className="flex h-10 w-full items-center justify-center gap-3 rounded-[5px] border border-border-field text-caption-13 font-medium text-text-secondary outline-none transition-colors hover:border-brand focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src={provider.icon} alt="" aria-hidden className="size-5" />
            Continuar com {provider.name}
          </button>
        ))}
      </div>
    </div>
  )
}
