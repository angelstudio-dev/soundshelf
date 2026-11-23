"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

const stackStyles = `
.sc-shell{position:relative;width:100%;padding:14px 0 6px;overflow:hidden;
  background:radial-gradient(ellipse at 50% 40%,color-mix(in srgb,var(--accent,#c99b72) 8%,transparent),transparent 70%);
  border-radius:18px}
.sc-shell *{box-sizing:border-box}
.sc-stage{position:relative;height:var(--sc-h);display:flex;align-items:center;justify-content:center;
  perspective:1100px;transform-style:preserve-3d;touch-action:pan-y;user-select:none;cursor:grab;overflow:hidden}
.sc-stage[data-dragging]{cursor:grabbing}
.sc-card{position:absolute;top:50%;left:50%;display:block;padding:0;margin:0;border:5px solid #fff;
  border-radius:20px;overflow:hidden;background:var(--surface-2,#e9e5df);
  box-shadow:0 14px 30px rgba(0,0,0,.28),inset 0 0 0 1px rgba(0,0,0,.05);
  transform-style:preserve-3d;backface-visibility:hidden;cursor:pointer;
  transition:transform .6s cubic-bezier(.22,1,.36,1),width .6s cubic-bezier(.22,1,.36,1),
    opacity .45s ease,box-shadow .3s,border-color .3s;outline-offset:4px}
.sc-stage[data-dragging] .sc-card{transition:none}
.sc-card[data-active]{border-color:#fff;box-shadow:0 20px 44px rgba(0,0,0,.38)}
.sc-card:focus-visible{outline:2px solid var(--accent,#c99b72)}
.sc-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.sc-shade{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(to top,rgba(0,0,0,.82) 0%,rgba(0,0,0,.18) 42%,transparent 70%)}
.sc-title{position:absolute;left:0;right:0;bottom:14px;color:#fff;font-weight:700;font-size:15px;
  line-height:1.25;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.7);padding:0 8px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-sub{position:absolute;left:0;right:0;bottom:2px;color:rgba(255,255,255,.82);font-size:10px;
  text-align:center;text-shadow:0 1px 5px rgba(0,0,0,.7);padding:0 6px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-card:not([data-active]) .sc-title{writing-mode:vertical-rl;text-orientation:mixed;
  transform:rotate(180deg);left:auto;right:6px;top:10px;bottom:auto;width:auto;max-height:calc(100% - 20px);
  font-size:12px;white-space:normal;line-height:1.1;text-align:center}
.sc-card:not([data-active]) .sc-shade{background:linear-gradient(to left,rgba(0,0,0,.7),transparent 55%)}
.sc-controls{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:12px}
.sc-arrow{width:34px;height:34px;border-radius:50%;border:1px solid var(--border,#3a3937);
  background:var(--surface-2,#242426);color:var(--text,#eee);display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:background .16s,transform .16s}
.sc-arrow:hover{background:var(--accent,#c99b72);transform:scale(1.06)}
.sc-arrow:disabled{opacity:.35;cursor:default;transform:none}
.sc-dots{display:flex;gap:6px;align-items:center}
.sc-dot{width:6px;height:6px;border-radius:50%;background:var(--border,#555);border:0;padding:0;cursor:pointer;transition:background .2s,width .2s}
.sc-dot[data-active]{width:18px;border-radius:4px;background:var(--accent,#c99b72)}
@media(prefers-reduced-motion:reduce){.sc-card,.sc-arrow{transition:none}}
@media(max-width:600px){.sc-title{font-size:13px}.sc-card{border-width:4px}}
`;

export interface StackCarouselItem {
  id: string;
  title: string;
  subtitle: string;
  image: string;
}

export interface StackCarouselProps {
  items: StackCarouselItem[];
  label?: string;
  onOpenItem?: (item: StackCarouselItem, index: number) => void;
  autoPlay?: boolean;
  interval?: number;
}

const wrap = (value: number, length: number) => ((value % length) + length) % length;

export default function StackCarousel({
  items, label = "继续听", onOpenItem, autoPlay = false, interval = 5200
}: StackCarouselProps) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);
  const gesture = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!autoPlay || reduced || hovered || dragging || items.length < 2) return;
    const timer = setTimeout(() => setIndex((current) => current + 1), interval);
    return () => clearTimeout(timer);
  }, [autoPlay, reduced, hovered, dragging, index, interval, items.length]);

  if (!items.length) return null;

  const select = (next: number) => { setIndex(wrap(next, items.length)); setDrag(0); };

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    gesture.current = { x: event.clientX, y: event.clientY, horizontal: false };
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.horizontal && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
    if (!start.horizontal && Math.abs(dx) > 8) {
      start.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    if (start.horizontal) setDrag(Math.max(-1, Math.min(1, dx / 160)));
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>, cancel = false) => {
    const start = gesture.current;
    gesture.current = null;
    if (start?.horizontal) {
      const dx = event.clientX - start.x;
      if (!cancel && Math.abs(dx) > 42) setIndex((current) => current + (dx < 0 ? 1 : -1));
      suppressClickUntil.current = performance.now() + 320;
    }
    setDrag(0);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const activeW = 196;
  const sideW = 52;
  const gap = 8;
  const height = 296;
  const span = Math.min(3, Math.max(1, Math.floor((items.length - 1) / 2)));
  const slots = Array.from({ length: span * 2 + 1 }, (_, position) => index + position - span);

  return (
    <section className="sc-shell" aria-label={label} aria-roledescription="carousel"
      style={{ "--sc-h": `${height}px` } as CSSProperties}>
      <style>{stackStyles}</style>
      <div className="sc-stage" data-dragging={dragging || undefined}
        onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={(event) => pointerUp(event)} onPointerCancel={(event) => pointerUp(event, true)}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        {slots.map((slot) => {
          const d = slot - index;
          const item = items[wrap(slot, items.length)];
          const isActive = d === 0;
          const depth = Math.abs(d);
          const sideCenter = activeW / 2 + gap + (depth - 1) * (sideW + gap) + sideW / 2;
          const x = d === 0 ? 0 : (d > 0 ? sideCenter : -sideCenter) - drag * activeW;
          const rotateY = d === 0 ? 0 : (d > 0 ? -16 : 16);
          const translateZ = d === 0 ? 46 : -depth * 34;
          const scale = d === 0 ? 1 : 1 - depth * 0.035;
          const opacity = depth > span ? 0 : isActive ? 1 : Math.max(0.22, 1 - (depth - 1) * 0.2);
          return (
            <button key={slot} type="button" className="sc-card" data-active={isActive || undefined}
              tabIndex={isActive ? 0 : -1}
              aria-label={isActive ? `打开《${item.title}》` : `切换到《${item.title}》`}
              aria-current={isActive ? "true" : undefined}
              aria-hidden={depth > span || undefined}
              onClick={() => {
                if (performance.now() < suppressClickUntil.current) return;
                if (isActive) onOpenItem?.(item, wrap(slot, items.length));
                else select(slot);
              }}
              style={{
                width: isActive ? activeW : sideW,
                height,
                transform: `translate(-50%,-50%) translateX(${x}px) rotateY(${rotateY}deg) translateZ(${translateZ}px) scale(${scale})`,
                opacity,
                zIndex: 30 - depth,
                pointerEvents: opacity === 0 ? "none" : undefined,
              } as CSSProperties}>
              <img className="sc-media" src={item.image} alt="" draggable={false}
                loading={depth < 2 ? "eager" : "lazy"} />
              <span className="sc-shade" />
              <span className="sc-title">{item.title}</span>
              {isActive && <span className="sc-sub">{item.subtitle}</span>}
            </button>
          );
        })}
      </div>
      <div className="sc-controls">
        <button type="button" className="sc-arrow" onClick={() => select(index - 1)} aria-label="上一本"
          disabled={items.length < 2}>‹</button>
        <div className="sc-dots">
          {items.map((item, position) => (
            <button key={item.id} type="button" className="sc-dot" data-active={position === wrap(index, items.length) || undefined}
              aria-label={`第 ${position + 1} 本：${item.title}`} onClick={() => select(position)} />
          ))}
        </div>
        <button type="button" className="sc-arrow" onClick={() => select(index + 1)} aria-label="下一本"
          disabled={items.length < 2}>›</button>
      </div>
    </section>
  );
}
