/**
 * Ambient background shared with the Kaiel Systems marketing site:
 * drifting caustics, morphing blobs, and a slow bubble column.
 * Purely decorative and non-interactive.
 */

const bubbles = [
  { left: "8%", size: 14, duration: 19, delay: 0, sway: "4vw" },
  { left: "22%", size: 9, duration: 24, delay: 6, sway: "-3vw" },
  { left: "37%", size: 18, duration: 17, delay: 3, sway: "5vw" },
  { left: "54%", size: 11, duration: 26, delay: 10, sway: "-4vw" },
  { left: "68%", size: 21, duration: 21, delay: 1, sway: "3vw" },
  { left: "81%", size: 8, duration: 28, delay: 8, sway: "-5vw" },
  { left: "93%", size: 15, duration: 18, delay: 5, sway: "4vw" },
];

export function OceanField() {
  return (
    <div aria-hidden="true">
      <div className="ocean-field" />
      <div className="caustics" />
      <div className="fluid-blob blob-a" />
      <div className="fluid-blob blob-b" />
      <div className="fluid-blob blob-c" />
      {bubbles.map((bubble) => (
        <span
          key={bubble.left}
          className="bubble"
          style={
            {
              left: bubble.left,
              height: bubble.size,
              width: bubble.size,
              animationDuration: `${bubble.duration}s`,
              animationDelay: `${bubble.delay}s`,
              "--sway": bubble.sway,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
