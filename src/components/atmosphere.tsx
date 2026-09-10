"use client";

import type { CSSProperties } from "react";

/**
 * Soft wallpaper field — related shapes, same palette, slow drift.
 * Motion is CSS-only (transform/opacity) so mobile stays cheap.
 */

type Floater = {
  kind: "ring" | "frame" | "orb" | "dash" | "dot";
  className: string;
  style?: CSSProperties;
};

const FLOATERS: Floater[] = [
  { kind: "orb", className: "atmosphere__orb atmosphere__orb--a" },
  { kind: "orb", className: "atmosphere__orb atmosphere__orb--b" },
  { kind: "orb", className: "atmosphere__orb atmosphere__orb--c" },

  { kind: "ring", className: "atmosphere__ring atmosphere__ring--1" },
  { kind: "ring", className: "atmosphere__ring atmosphere__ring--2" },
  { kind: "ring", className: "atmosphere__ring atmosphere__ring--3" },
  { kind: "ring", className: "atmosphere__ring atmosphere__ring--4" },

  { kind: "frame", className: "atmosphere__frame atmosphere__frame--1" },
  { kind: "frame", className: "atmosphere__frame atmosphere__frame--2" },
  { kind: "frame", className: "atmosphere__frame atmosphere__frame--3" },
  { kind: "frame", className: "atmosphere__frame atmosphere__frame--4" },

  { kind: "dash", className: "atmosphere__dash atmosphere__dash--h1" },
  { kind: "dash", className: "atmosphere__dash atmosphere__dash--h2" },
  { kind: "dash", className: "atmosphere__dash atmosphere__dash--v1" },
  { kind: "dash", className: "atmosphere__dash atmosphere__dash--v2" },

  {
    kind: "dot",
    className: "atmosphere__dot",
    style: { left: "12%", top: "24%", ["--drift-x" as string]: "18px", ["--drift-y" as string]: "-14px", animationDuration: "22s", animationDelay: "-2s" },
  },
  {
    kind: "dot",
    className: "atmosphere__dot",
    style: { left: "28%", top: "62%", ["--drift-x" as string]: "-16px", ["--drift-y" as string]: "12px", animationDuration: "26s", animationDelay: "-7s" },
  },
  {
    kind: "dot",
    className: "atmosphere__dot",
    style: { left: "46%", top: "18%", ["--drift-x" as string]: "12px", ["--drift-y" as string]: "16px", animationDuration: "24s", animationDelay: "-11s" },
  },
  {
    kind: "dot",
    className: "atmosphere__dot",
    style: { left: "61%", top: "72%", ["--drift-x" as string]: "-20px", ["--drift-y" as string]: "-10px", animationDuration: "28s", animationDelay: "-4s" },
  },
  {
    kind: "dot",
    className: "atmosphere__dot",
    style: { left: "78%", top: "36%", ["--drift-x" as string]: "14px", ["--drift-y" as string]: "-18px", animationDuration: "23s", animationDelay: "-15s" },
  },
  {
    kind: "dot",
    className: "atmosphere__dot",
    style: { left: "86%", top: "58%", ["--drift-x" as string]: "-12px", ["--drift-y" as string]: "14px", animationDuration: "30s", animationDelay: "-9s" },
  },
  {
    kind: "dot",
    className: "atmosphere__dot",
    style: { left: "18%", top: "44%", ["--drift-x" as string]: "10px", ["--drift-y" as string]: "10px", animationDuration: "25s", animationDelay: "-18s" },
  },
  {
    kind: "dot",
    className: "atmosphere__dot",
    style: { left: "52%", top: "48%", ["--drift-x" as string]: "-14px", ["--drift-y" as string]: "-12px", animationDuration: "27s", animationDelay: "-5s" },
  },
];

export function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden>
      <div className="atmosphere__base" />
      <div className="atmosphere__grid" />

      {FLOATERS.map((item, i) => (
        <div key={i} className={item.className} style={item.style} />
      ))}

      <div className="atmosphere__vignette" />
      <div className="atmosphere__grain" />
    </div>
  );
}
