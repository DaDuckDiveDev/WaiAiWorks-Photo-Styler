/** Kaiel Systems wordmark — the K rendered as a breaking wave. */
export function LogoMark({ label = "KAIEL STYLER" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" aria-label={`Kaiel Systems — ${label}`}>
      <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/70 bg-white/35 shadow-glass backdrop-blur-2xl">
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-7 w-7" fill="none">
          <defs>
            <linearGradient
              id="kwave"
              x1="10"
              y1="38"
              x2="40"
              y2="10"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#004E8A" />
              <stop offset="0.55" stopColor="#19BFD3" />
              <stop offset="1" stopColor="#3BBFF2" />
            </linearGradient>
          </defs>
          <path d="M14 9v30" stroke="url(#kwave)" strokeLinecap="round" strokeWidth="3.6" />
          <path
            d="M14 25c6-1.5 8.5-6 12-10.5 2.4-3 5.5-4.6 9-4.5"
            stroke="url(#kwave)"
            strokeLinecap="round"
            strokeWidth="3.6"
          />
          <path
            d="M14 25c6 1.5 8.5 6 12 10.5 2.4 3 5.5 4.6 9 4.5"
            stroke="#3BBFF2"
            strokeLinecap="round"
            strokeWidth="3.6"
          />
        </svg>
      </div>
      <span className="text-sm font-semibold tracking-[0.18em] text-pacific">{label}</span>
    </div>
  );
}
