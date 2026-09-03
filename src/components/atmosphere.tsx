"use client";

const DOTS = [
  { x: "14%", y: "22%", d: 3, delay: "0s" },
  { x: "28%", y: "68%", d: 2, delay: "1.4s" },
  { x: "41%", y: "18%", d: 2, delay: "2.8s" },
  { x: "57%", y: "74%", d: 3, delay: "0.6s" },
  { x: "72%", y: "32%", d: 2, delay: "3.2s" },
  { x: "86%", y: "58%", d: 3, delay: "1.9s" },
  { x: "18%", y: "48%", d: 2, delay: "4.1s" },
  { x: "63%", y: "44%", d: 2, delay: "2.2s" },
] as const;

/** Flat monochrome canvas + quiet geometric elements. */
export function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden>
      <div className="atmosphere__base" />
      <div className="atmosphere__grid" />
      <div className="atmosphere__orb atmosphere__orb--a" />
      <div className="atmosphere__orb atmosphere__orb--b" />

      <div className="atmosphere__ring atmosphere__ring--a" />
      <div className="atmosphere__ring atmosphere__ring--b" />
      <div className="atmosphere__frame atmosphere__frame--a" />
      <div className="atmosphere__frame atmosphere__frame--b" />
      <div className="atmosphere__line atmosphere__line--h" />
      <div className="atmosphere__line atmosphere__line--v" />

      {DOTS.map((dot, i) => (
        <span
          key={i}
          className="atmosphere__dot"
          style={{
            left: dot.x,
            top: dot.y,
            width: dot.d,
            height: dot.d,
            animationDelay: dot.delay,
          }}
        />
      ))}

      <div className="atmosphere__vignette" />
      <div className="atmosphere__grain" />
    </div>
  );
}
