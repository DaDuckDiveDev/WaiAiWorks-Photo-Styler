/**
 * Kaiel Systems lockup: the K Waveform mark (a stem and two wave strokes) next
 * to the lowercase "kaiel." wordmark with its coral dot, then the product name.
 *
 * `draw` strokes the mark in on mount — the same CSS stroke-draw the brand
 * uses for its page loader.
 */
export function LogoMark({
  product = "Styler",
  draw = false,
}: {
  product?: string;
  draw?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        className={`h-8 w-8 shrink-0 ${draw ? "k-draw" : ""}`}
        fill="none"
      >
        <defs>
          <linearGradient
            id="kaiel-wave"
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
        <path
          pathLength={1}
          d="M14 9v30"
          stroke="url(#kaiel-wave)"
          strokeLinecap="round"
          strokeWidth="3.6"
        />
        <path
          pathLength={1}
          d="M14 25c6-1.5 8.5-6 12-10.5 2.4-3 5.5-4.6 9-4.5"
          stroke="url(#kaiel-wave)"
          strokeLinecap="round"
          strokeWidth="3.6"
        />
        <path
          pathLength={1}
          d="M14 25c6 1.5 8.5 6 12 10.5 2.4 3 5.5 4.6 9 4.5"
          stroke="#3BBFF2"
          strokeLinecap="round"
          strokeWidth="3.6"
        />
      </svg>
      <span className="flex items-baseline gap-2">
        <span className="text-[1.0625rem] font-bold tracking-[-0.01em] text-pearl">
          kaiel<span className="text-coral">.</span>
        </span>
        <span className="semi-wide text-sm font-medium text-haze">{product}</span>
      </span>
    </div>
  );
}
