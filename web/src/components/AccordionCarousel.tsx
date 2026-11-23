"use client";

import { useEffect, useRef, useState } from "react";

const accordionStyles = `
.ia-shell{position:relative;width:100%;padding:2px 0 4px}
.ia-shell *{box-sizing:border-box}
.ia-track{display:flex;gap:8px;height:var(--ia-h,300px);overflow:hidden}
.ia-card{position:relative;flex:0.7 1 0;min-width:40px;margin:0;padding:0;border:0;border-radius:18px;overflow:hidden;
  background:var(--surface-2,#242426);cursor:pointer;isolation:isolate;
  transition:flex-grow .55s cubic-bezier(.22,1,.36,1),box-shadow .3s ease,outline-color .2s;
  outline:2px solid transparent;outline-offset:2px;box-shadow:0 10px 22px rgba(0,0,0,.22)}
.ia-card[data-active]{flex-grow:3.2;box-shadow:0 16px 36px rgba(0,0,0,.3)}
.ia-card:focus-visible{outline-color:var(--accent)}
.ia-card:first-child{border-top-left-radius:20px;border-bottom-left-radius:20px}
.ia-card:last-child{border-top-right-radius:20px;border-bottom-right-radius:20px}
.ia-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;
  transition:transform .8s cubic-bezier(.22,1,.36,1)}
.ia-card[data-active] .ia-media{transform:scale(1.04)}
.ia-shade{position:absolute;inset:0;pointer-events:none;background:rgba(0,0,0,.5);
  transition:background .45s ease}
.ia-card[data-active] .ia-shade{background:linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.3) 42%,rgba(0,0,0,.05) 72%)}
.ia-spine{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;
  writing-mode:vertical-rl;text-orientation:mixed;white-space:nowrap;color:#fff;
  font-size:13px;font-weight:600;letter-spacing:.16em;line-height:1.1;
  text-shadow:0 1px 6px rgba(0,0,0,.55)}
.ia-card:not([data-active]) .ia-spine{opacity:1}
.ia-card[data-active] .ia-spine{opacity:0}
.ia-caption{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:4px;
  padding:16px 16px 15px;text-align:left;color:#fff;pointer-events:none;
  opacity:0;transform:translateY(10px);transition:opacity .35s ease .05s,transform .35s ease .05s}
.ia-card[data-active] .ia-caption{opacity:1;transform:none}
.ia-caption strong{font-size:16px;font-weight:600;line-height:1.3;text-shadow:0 2px 10px rgba(0,0,0,.6);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ia-caption small{font-size:11px;color:rgba(255,255,255,.82);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ia-play{position:absolute;right:14px;top:14px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;
  justify-content:center;background:rgba(255,255,255,.16);backdrop-filter:blur(8px);color:#fff;
  opacity:0;transform:scale(.9);transition:opacity .3s ease,transform .3s ease;pointer-events:none}
.ia-card[data-active] .ia-play{opacity:1;transform:none}
.ia-dots{display:flex;gap:6px;justify-content:center;margin-top:12px}
.ia-dot{width:6px;height:6px;border-radius:50%;border:0;padding:0;background:var(--border,#3a3937);cursor:pointer;transition:background .2s,width .2s}
.ia-dot[data-active]{width:18px;border-radius:4px;background:var(--accent,#c99b72)}
@media(max-width:600px){.ia-track{--ia-h:250px;gap:6px}.ia-caption{padding:12px 12px 12px}.ia-caption strong{font-size:14px}}
@media(prefers-reduced-motion:reduce){.ia-card,.ia-media,.ia-caption,.ia-spine,.ia-play{transition:none}}
`;

export interface AccordionItem {
  id: string;
  title: string;
  subtitle: string;
  image: string;
}

export interface AccordionCarouselProps {
  items: AccordionItem[];
  label?: string;
  onOpenItem?: (item: AccordionItem, index: number) => void;
  autoPlay?: boolean;
  interval?: number;
}

const wrap = (value: number, length: number) => ((value % length) + length) % length;

export default function AccordionCarousel({
  items, label = "继续听", onOpenItem, autoPlay = false, interval = 5200
}: AccordionCarouselProps) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!autoPlay || reduced || hovered || items.length < 2) return;
    const timer = setTimeout(() => setIndex((current) => current + 1), interval);
    return () => clearTimeout(timer);
  }, [autoPlay, reduced, hovered, index, interval, items.length]);

  if (!items.length) return null;

  const shown = items.slice(0, 5);
  const activeIndex = wrap(index, shown.length);
  const select = (next: number) => setIndex(wrap(next, shown.length));

  return (
    <section className="ia-shell" aria-label={label} aria-roledescription="carousel">
      <style>{accordionStyles}</style>
      <div className="ia-track" role="group" aria-label={label}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") { event.preventDefault(); select(activeIndex + 1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); select(activeIndex - 1); }
          if (event.key === "Home") { event.preventDefault(); select(0); }
          if (event.key === "End") { event.preventDefault(); select(shown.length - 1); }
        }}>
        {shown.map((item, position) => {
          const isActive = position === activeIndex;
          return (
            <button key={item.id} type="button" className="ia-card"
              data-active={isActive || undefined}
              tabIndex={isActive ? 0 : -1}
              aria-label={isActive ? `打开《${item.title}》` : `展开《${item.title}》`}
              aria-current={isActive ? "true" : undefined}
              onClick={() => {
                if (performance.now() < suppressClickUntil.current) return;
                if (isActive) onOpenItem?.(item, position);
                else { select(position); suppressClickUntil.current = performance.now() + 260; }
              }}
              onMouseEnter={() => { if (!isActive) select(position); }}
              onFocus={() => { if (!isActive) select(position); }}>
              <img className="ia-media" src={item.image} alt="" draggable={false}
                loading={Math.abs(position - activeIndex) < 2 ? "eager" : "lazy"} />
              <span className="ia-shade" />
              <span className="ia-spine" aria-hidden="true">{item.title}</span>
              <span className="ia-play" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
              </span>
              <span className="ia-caption" aria-hidden="true">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </span>
            </button>
          );
        })}
      </div>
      {shown.length > 1 && (
        <div className="ia-dots">
          {shown.map((item, position) => (
            <button key={item.id} type="button" className="ia-dot"
              data-active={position === activeIndex || undefined}
              aria-label={`第 ${position + 1} 本：${item.title}`} onClick={() => select(position)} />
          ))}
        </div>
      )}
    </section>
  );
}
