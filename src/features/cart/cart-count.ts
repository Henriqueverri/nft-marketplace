import { useCart } from './queries'

/** Units in the cart as the server last reported them; null while unknown. */
export function useCartCount(): number | null {
  const { cart } = useCart()
  return cart ? cart.itemCount : null
}

/** Accessible name of a cart link: the badge itself is decorative. */
export function cartLinkLabel(count: number | null): string {
  if (!count) return 'Carrinho'
  return `Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`
}
