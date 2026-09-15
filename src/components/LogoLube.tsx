/** Marca da Lube em SVG — nítida em qualquer tamanho e sem depender de arquivo externo. */
export function LogoLube({ tamanho = 34 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="lube-azul" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a50c7" />
          <stop offset="100%" stopColor="#16225f" />
        </linearGradient>
        <linearGradient id="lube-vermelho" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff3b43" />
          <stop offset="100%" stopColor="#c40f18" />
        </linearGradient>
      </defs>
      {/* o "L" da marca */}
      <path
        d="M10 8h13v33h18v15H10z"
        fill="url(#lube-azul)"
        stroke="rgba(255,255,255,.22)"
        strokeWidth="1.2"
      />
      {/* bloco vermelho arredondado */}
      <path
        d="M27 8h14a13 13 0 0 1 0 26H27z"
        fill="url(#lube-vermelho)"
        stroke="rgba(255,255,255,.22)"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** Assinatura completa: marca + nome. */
export function MarcaLube({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoLube tamanho={compacto ? 30 : 38} />
      {!compacto && (
        <div className="leading-none">
          <div className="text-[17px] font-extrabold tracking-tight text-white">
            LUBE <span className="text-[#ff5a60]">DISTRIBUIDORA</span>
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-lube-300/80">
            Gestão de TI
          </div>
        </div>
      )}
    </div>
  );
}
