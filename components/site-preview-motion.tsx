"use client";
import { useEffect } from "react";

/**
 * Scroll reveals for the public preview. Content stays visible without
 * JavaScript: the hidden starting state only applies once this has run.
 */
export function PreviewMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-preview]");
    if (!root || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.dataset.motion = "on";
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.shown = "true";
            seen.unobserve(entry.target);
          }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    root
      .querySelectorAll("[data-reveal]")
      .forEach((element) => seen.observe(element));
    // Gentle parallax on the hero photo, driven by scroll position.
    const photo = root.querySelector<HTMLElement>("[data-parallax]");
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (photo)
          photo.style.setProperty(
            "--shift",
            `${Math.min(window.scrollY, 900) * -0.08}px`,
          );
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      seen.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
