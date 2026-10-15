import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-4 px-4 py-16">
      <p className="text-caption-13 font-medium tracking-widest text-brand-accent">ERRO 404</p>
      <h1 className="text-heading-28 font-bold text-cream">Página não encontrada</h1>
      <p className="text-body-14 text-text-secondary">
        O endereço acessado não existe ou foi removido.
      </p>
      <Button asChild size="lg">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </section>
  )
}
