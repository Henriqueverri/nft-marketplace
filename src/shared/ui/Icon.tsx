import arrowDown from '@/assets/icons/arrow-down.svg'
import arrowLeft from '@/assets/icons/arrow-left.svg'
import arrowRight from '@/assets/icons/arrow-right.svg'
import cart from '@/assets/icons/cart.svg'
import chevronRight from '@/assets/icons/chevron-right.svg'
import close from '@/assets/icons/close.svg'
import deleteIcon from '@/assets/icons/delete.svg'
import filter from '@/assets/icons/filter.svg'
import heartSolid from '@/assets/icons/heart-solid.svg'
import heart from '@/assets/icons/heart.svg'
import login from '@/assets/icons/login.svg'
import minus from '@/assets/icons/minus.svg'
import plus from '@/assets/icons/plus.svg'
import search from '@/assets/icons/search.svg'
import shareLinkedin from '@/assets/icons/share-linkedin.svg'
import shareMessage from '@/assets/icons/share-message.svg'
import shareTwitter from '@/assets/icons/share-twitter.svg'
import socialFacebook from '@/assets/icons/social-facebook.svg'
import socialInstagram from '@/assets/icons/social-instagram.svg'
import socialLinkedin from '@/assets/icons/social-linkedin.svg'
import socialTwitter from '@/assets/icons/social-twitter.svg'
import socialYoutube from '@/assets/icons/social-youtube.svg'
import star from '@/assets/icons/star.svg'
import tabHeart from '@/assets/icons/tab-heart.svg'
import tabHome from '@/assets/icons/tab-home.svg'
import tabScan from '@/assets/icons/tab-scan.svg'
import tabShop from '@/assets/icons/tab-shop.svg'
import tabUser from '@/assets/icons/tab-user.svg'
import zoom from '@/assets/icons/zoom.svg'
import { cn } from '@/lib/utils'

/** Icons exported from the Figma file (scripts/export-figma-assets.mjs). */
const icons = {
  'arrow-down': arrowDown,
  'arrow-left': arrowLeft,
  'arrow-right': arrowRight,
  cart,
  'chevron-right': chevronRight,
  close,
  delete: deleteIcon,
  filter,
  heart,
  'heart-solid': heartSolid,
  login,
  minus,
  plus,
  search,
  'share-linkedin': shareLinkedin,
  'share-message': shareMessage,
  'share-twitter': shareTwitter,
  'social-facebook': socialFacebook,
  'social-instagram': socialInstagram,
  'social-linkedin': socialLinkedin,
  'social-twitter': socialTwitter,
  'social-youtube': socialYoutube,
  star,
  'tab-heart': tabHeart,
  'tab-home': tabHome,
  'tab-scan': tabScan,
  'tab-shop': tabShop,
  'tab-user': tabUser,
  zoom,
} as const

export type IconName = keyof typeof icons

/**
 * Decorative icon painted with `currentColor`: the SVG is used as a mask, so one
 * asset serves every state (default, hover, active) through the text color tokens.
 * The accessible name always comes from the control that contains it.
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  const url = `url("${icons[name]}")`
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-5 shrink-0 bg-current', className)}
      style={{ maskImage: url, WebkitMaskImage: url, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }}
    />
  )
}
