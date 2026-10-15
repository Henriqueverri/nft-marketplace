interface PlaceholderPageProps {
  title: string
  phase: string
  children?: React.ReactNode
}

/** Provisional screen used until the real screen lands in its phase. */
export function PlaceholderPage({ title, phase, children }: PlaceholderPageProps) {
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-12">
      <h1 className="text-heading-28 font-bold text-cream">{title}</h1>
      <p className="text-body-14 text-text-secondary">
        Tela provisória. A implementação desta tela está prevista para a fase {phase}.
      </p>
      {children}
    </section>
  )
}
