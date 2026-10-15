import { Link } from '@tanstack/react-router'
import { useId, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { DEFAULT_CATALOG_SEARCH } from '@/features/catalog/search-params'
import { cn } from '@/lib/utils'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { Icon, type IconName } from '@/shared/ui/Icon'

const services = [
  {
    mark: 'W',
    title: 'Segurança da carteira',
    text: 'Proteja sua carteira e colecione arte digital verificada com confiança.',
  },
  {
    mark: 'C',
    title: 'Criadores em destaque',
    text: 'Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.',
  },
  {
    mark: 'D',
    title: 'Alertas de lançamentos',
    text: 'Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.',
  },
]

const footerCollections = [
  { id: 'col_arte-digital', name: 'Arte digital' },
  { id: 'col_fotografia', name: 'Fotografia' },
  { id: 'col_musica', name: 'Música' },
  { id: 'col_arte-3d', name: 'Arte 3D' },
  { id: 'col_utilidade', name: 'Utilidade' },
]

const socials: { name: string; icon: IconName }[] = [
  { name: 'Facebook', icon: 'social-facebook' },
  { name: 'Instagram', icon: 'social-instagram' },
  { name: 'X (Twitter)', icon: 'social-twitter' },
  { name: 'LinkedIn', icon: 'social-linkedin' },
  { name: 'YouTube', icon: 'social-youtube' },
]

const linkClass =
  'rounded-sm text-body-14 leading-[30px] text-text-secondary outline-none hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring'
/** Items of the Figma that have no screen in the demo are shown as plain text. */
const plainClass = 'text-body-14 leading-[30px] text-text-secondary/70'

/** Footer of the Figma. The link columns are desktop-only; on mobile the tab bar covers them. */
export function SiteFooter() {
  return (
    <footer className="mx-auto mt-auto w-full max-w-[1200px] px-4 pb-6 md:px-6 xl:px-0">
      <div className="grid grid-cols-1 gap-8 bg-surface-card p-6 md:p-8 lg:grid-cols-[1fr_1fr_1fr_1.3fr]">
        {services.map((service, index) => (
          <div key={service.title} className={cn('flex flex-col gap-3', index > 0 && 'lg:border-l lg:border-brand/40 lg:pl-6')}>
            <span
              aria-hidden="true"
              className="flex size-[74px] items-center justify-center rounded-full bg-brand text-heading-24 font-bold text-ink"
            >
              {service.mark}
            </span>
            <h2 className="text-[17px] font-bold text-cream">{service.title}</h2>
            <p className="text-body-14 leading-[22px] text-text-secondary">{service.text}</p>
          </div>
        ))}
        <NewsletterForm />
      </div>

      <div className="grid grid-cols-1 gap-3 bg-surface-dark px-6 py-6 text-body-14 text-cream sm:grid-cols-2 md:px-8 lg:grid-cols-4 lg:items-center">
        <p className="font-bold tracking-[1.4px]">KURIO</p>
        <p className="whitespace-pre-line">{'Feito para colecionadores,\ncriadores e cultura'}</p>
        <a href="mailto:contato@email.com" className={cn(linkClass, 'text-cream')}>
          contato@email.com
        </a>
        <a href="tel:+551140028922" className={cn(linkClass, 'text-cream')}>
          +55 11 4002 8922
        </a>
      </div>

      <div className="grid grid-cols-1 gap-8 bg-surface-card p-6 md:p-8 lg:grid-cols-4">
        <nav aria-label="Rodapé" className="hidden gap-8 md:grid md:grid-cols-3 lg:col-span-3">
          <div>
            <h2 className="mb-2 text-body-18 font-bold text-cream">Meu perfil</h2>
            <ul>
              <li>
                <Link to="/account/profile" className={linkClass}>
                  Meu perfil
                </Link>
              </li>
              <li className={plainClass}>Minha coleção</li>
              <li className={plainClass}>Atividade</li>
              <li className={plainClass}>Estúdio do criador</li>
              <li>
                <Link to="/account/favorites" className={linkClass}>
                  Lista de interesse
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-body-18 font-bold text-cream">Central de ajuda</h2>
            <ul>
              <li className={plainClass}>Central de ajuda</li>
              <li className={plainClass}>Como comprar NFTs</li>
              <li>
                <Link to="/account/wallets" className={linkClass}>
                  Carteira e segurança
                </Link>
              </li>
              <li className={plainClass}>Política do mercado</li>
              <li className={plainClass}>Denunciar item</li>
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-body-18 font-bold text-cream">Coleções</h2>
            <ul>
              {footerCollections.map((collection) => (
                <li key={collection.id}>
                  <Link
                    to="/"
                    search={{ ...DEFAULT_CATALOG_SEARCH, collections: collection.id }}
                    hash="catalogo"
                    className={linkClass}
                  >
                    {collection.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-3 text-body-18 font-bold text-cream">Redes sociais</h2>
            <ul className="flex gap-2" aria-label="Kurio nas redes sociais">
              {socials.map((social) => (
                <li
                  key={social.name}
                  className="flex size-[30px] items-center justify-center rounded-[4px] border border-brand text-brand-accent"
                >
                  <Icon name={social.icon} className="size-4" />
                  <span className="sr-only">{social.name}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-body-18 font-bold text-cream">Carteiras compatíveis</h2>
            <p className="inline-block rounded-[4px] bg-surface-dark px-2 py-1 text-tiny-9 font-bold text-brand-accent">
              METAMASK • WALLETCONNECT • COINBASE
            </p>
          </div>
        </div>
      </div>
      <p className="pt-4 text-center text-caption-12 text-text-secondary">© 2026 Kurio. Propriedade digital para todos.</p>
    </footer>
  )
}

const emailSchema = z.email()

/**
 * Newsletter form of the Figma. There is no newsletter service in the demo, so a
 * valid address gets an honest message instead of a fake subscription.
 */
function NewsletterForm() {
  const id = useId()
  const errorId = useId()
  const announce = useAnnounce()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('email')
    if (!emailSchema.safeParse(String(value ?? '').trim()).success) {
      setError('Informe um e-mail válido.')
      return
    }
    setError(null)
    announce('A newsletter não faz parte desta demonstração: nenhum e-mail foi cadastrado.')
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3 lg:border-l lg:border-brand/40 lg:pl-6">
      <h2 className="text-body-18 font-bold text-cream">
        <label htmlFor={id}>Antecipe-se ao próximo lançamento</label>
      </h2>
      <div className="flex">
        <input
          id={id}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="digite seu e-mail..."
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-9 min-w-0 flex-1 rounded-l-[4px] border border-transparent bg-surface-dark px-3 text-body-14 text-cream outline-none placeholder:text-sand focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <button
          type="submit"
          className="h-9 rounded-r-[4px] bg-brand px-3 text-body-16 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          Enviar
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-caption-13 text-coral">
          {error}
        </p>
      ) : null}
      <p className="text-body-14 leading-[22px] text-text-secondary">
        Receba lançamentos selecionados, histórias de criadores e novidades do mercado.
      </p>
    </form>
  )
}
