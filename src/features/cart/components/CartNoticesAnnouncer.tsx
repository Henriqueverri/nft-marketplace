import { useEffect } from 'react'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { useCart } from '../queries'

const announced = new Set<string>()
const appStartedAt = Date.now()

/**
 * Reads out what the server changed in the cart on its own (merge, price, stock,
 * coupon) on whatever page the user is. Notices from before this page load were
 * already announced then; they stay listed on the cart page until dismissed.
 */
export function useCartNoticesAnnouncer(): void {
  const { cart } = useCart()
  const announce = useAnnounce()
  const notices = cart?.notices

  useEffect(() => {
    if (!notices) return
    const fresh = notices.filter((notice) => !announced.has(notice.id) && Date.parse(notice.createdAt) >= appStartedAt - 1_000)
    for (const notice of notices) announced.add(notice.id)
    if (fresh.length === 0) return
    announce(fresh.length === 1 ? fresh[0].message : `Seu carrinho mudou: ${fresh.map((notice) => notice.message).join(' ')}`)
  }, [notices, announce])
}
