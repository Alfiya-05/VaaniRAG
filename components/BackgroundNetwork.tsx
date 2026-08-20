'use client';

import { useEffect, useRef } from 'react';

export default function BackgroundNetwork({ subdued = false }: { subdued?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const homeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const home = homeRef.current;
    if (!canvas || !home) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const precisePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    let reducedMotion = reducedMotionQuery.matches;
    let precisePointer = precisePointerQuery.matches;
    let visible = !document.hidden;
    let frame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    const pointer = { x: -1000, y: -1000, targetX: -1000, targetY: -1000, active: false };
    const opacityScale = subdued ? 0.72 : 1;
    const nodes = Array.from({ length: 42 }, (_, index) => {
      const seed = (index * 9301 + 49297) % 233280;
      const random = seed / 233280;
      const rawX = ((seed * 19) % 233280) / 233280;
      const rawY = ((seed * 17) % 233280) / 233280;
      const centerAvoided = rawX > 0.24 && rawX < 0.76 && rawY > 0.12 && rawY < 0.62;
      return {
        x: centerAvoided ? (index % 2 === 0 ? 0.06 + random * 0.15 : 0.79 + random * 0.15) : rawX,
        y: rawY,
        phase: random * Math.PI * 2,
        speed: 0.45 + (index % 5) * 0.12,
        direction: index % 2 === 0 ? 1 : -1,
        radius: index % 7 === 0 ? 3.4 : index % 3 === 0 ? 2.25 : 1.25,
        opacity: index % 7 === 0 ? 0.42 : index % 3 === 0 ? 0.29 : 0.19,
      };
    });
    const particles = Array.from({ length: 70 }, (_, index) => {
      const seed = (index * 7919 + 17389) % 233280;
      return { x: ((seed * 13) % 233280) / 233280, y: ((seed * 29) % 233280) / 233280, phase: seed * 0.0001, direction: index % 2 ? 1 : -1 };
    });

    const resize = () => {
      width = window.innerWidth;
      height = Math.max(home.scrollHeight, window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const wrap = (value: number, max: number) => ((value % max) + max) % max;
    const draw = (time: number) => {
      if (!visible) return;
      context.clearRect(0, 0, width, height);
      pointer.x += (pointer.targetX - pointer.x) * 0.055;
      pointer.y += (pointer.targetY - pointer.y) * 0.055;
      const cursorRadius = 220;
      const cursorY = pointer.y + window.scrollY;
      const points = nodes.map((node) => {
        const driftX = reducedMotion ? 0 : time * 0.0000025 * node.speed * node.direction + Math.sin(time * 0.00008 + node.phase) * 8;
        const driftY = reducedMotion ? 0 : Math.cos(time * 0.00006 + node.phase) * 7;
        const baseX = wrap(node.x * (width + 180) - 90 + driftX, width + 180) - 90;
        const baseY = wrap(node.y * (height + 150) - 75 + driftY, height + 150) - 75;
        const distance = Math.hypot(baseX - pointer.x, baseY - cursorY);
        const rawInfluence = pointer.active && precisePointer && !reducedMotion ? Math.max(0, 1 - distance / cursorRadius) : 0;
        const influence = Math.pow(rawInfluence, 0.72);
        return { node, x: baseX + (baseX - pointer.x) * influence * 0.045, y: baseY + (baseY - cursorY) * influence * 0.045, influence };
      });

      if (pointer.active && precisePointer && !reducedMotion) {
        const glow = context.createRadialGradient(pointer.x, cursorY, 0, pointer.x, cursorY, cursorRadius);
        glow.addColorStop(0, `rgba(45, 212, 191, ${0.08 * opacityScale})`);
        glow.addColorStop(1, 'rgba(45, 212, 191, 0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(pointer.x, cursorY, cursorRadius, 0, Math.PI * 2);
        context.fill();
      }

      context.save();
      context.strokeStyle = `rgba(45, 212, 191, ${0.07 * opacityScale})`;
      context.lineWidth = 0.65;
      context.setLineDash([2, 9]);
      context.beginPath();
      context.ellipse(width * 0.18, height * 0.42, Math.min(180, width * 0.16), Math.min(330, height * 0.32), -0.12, 0, Math.PI * 2);
      context.ellipse(width * 0.82, height * 0.55, Math.min(210, width * 0.18), Math.min(360, height * 0.34), 0.15, 0, Math.PI * 2);
      context.stroke();
      context.restore();

      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i];
          const b = points[j];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          const localInfluence = Math.max(a.influence, b.influence);
          const connectionLimit = localInfluence > 0.08 ? 205 : 145;
          if (distance > connectionLimit) continue;
          const opacity = (0.105 + localInfluence * 0.22) * opacityScale;
          context.strokeStyle = `rgba(45, 212, 191, ${opacity})`;
          context.lineWidth = localInfluence > 0.16 ? 1 : 0.65;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }

      points.forEach(({ node, x, y, influence }) => {
        const opacity = Math.min(0.7, node.opacity + influence * 0.38) * opacityScale;
        context.fillStyle = node.radius > 3 ? `rgba(251, 146, 60, ${opacity})` : `rgba(45, 212, 191, ${opacity})`;
        if (node.radius > 3 || influence > 0.2) {
          context.shadowColor = node.radius > 3 ? `rgba(251, 146, 60, ${Math.min(0.24, 0.08 + influence * 0.22) * opacityScale})` : `rgba(45, 212, 191, ${Math.min(0.24, 0.08 + influence * 0.22) * opacityScale})`;
          context.shadowBlur = influence > 0.1 ? 14 : 8;
        }
        context.beginPath();
        context.arc(x, y, node.radius + influence * 1.4, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      });

      particles.forEach((particle) => {
        const x = wrap(particle.x * width + time * 0.000005 * particle.direction * 20 + Math.sin(time * 0.00007 + particle.phase) * 10, width);
        const y = wrap(particle.y * height + Math.cos(time * 0.00006 + particle.phase) * 9, height);
        const distance = Math.hypot(x - pointer.x, y - cursorY);
        const influence = pointer.active && precisePointer && !reducedMotion ? Math.max(0, 1 - distance / cursorRadius) : 0;
        context.fillStyle = `rgba(94, 234, 212, ${(0.14 + influence * 0.32) * opacityScale})`;
        context.beginPath();
        context.arc(x + (x - pointer.x) * influence * 0.02, y + (y - cursorY) * influence * 0.02, 0.8 + influence * 0.7, 0, Math.PI * 2);
        context.fill();
      });
      if (precisePointer && !reducedMotion && visible) frame = window.requestAnimationFrame(draw);
    };

    const updatePointer = (event: PointerEvent) => {
      if (!precisePointer) return;
      pointer.targetX = event.clientX;
      pointer.targetY = event.clientY;
      pointer.active = true;
      const offsetX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      const offsetY = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
      home.style.setProperty('--vaani-parallax-x', `${offsetX * 1.5}px`);
      home.style.setProperty('--vaani-parallax-y', `${offsetY * 1.5}px`);
    };
    const clearPointer = () => { pointer.active = false; home.style.setProperty('--vaani-parallax-x', '0px'); home.style.setProperty('--vaani-parallax-y', '0px'); };
    const visibilityChanged = () => {
      visible = !document.hidden;
      if (visible && precisePointer && !reducedMotion && !frame) frame = window.requestAnimationFrame(draw);
      if (!visible && frame) { window.cancelAnimationFrame(frame); frame = 0; }
    };
    const motionChanged = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      if (reducedMotion && frame) { window.cancelAnimationFrame(frame); frame = 0; }
      if (!reducedMotion && precisePointer && visible && !frame) frame = window.requestAnimationFrame(draw);
    };
    const pointerChanged = (event: MediaQueryListEvent) => {
      precisePointer = event.matches;
      if (!precisePointer && frame) { window.cancelAnimationFrame(frame); frame = 0; }
      if (precisePointer && !reducedMotion && visible && !frame) frame = window.requestAnimationFrame(draw);
      if (!precisePointer || reducedMotion) draw(0);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerleave', clearPointer);
    document.addEventListener('visibilitychange', visibilityChanged);
    reducedMotionQuery.addEventListener('change', motionChanged);
    precisePointerQuery.addEventListener('change', pointerChanged);
    if (precisePointer && !reducedMotion) frame = window.requestAnimationFrame(draw);
    else draw(0);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('pointerleave', clearPointer);
      document.removeEventListener('visibilitychange', visibilityChanged);
      reducedMotionQuery.removeEventListener('change', motionChanged);
      precisePointerQuery.removeEventListener('change', pointerChanged);
      home.style.removeProperty('--vaani-parallax-x');
      home.style.removeProperty('--vaani-parallax-y');
    };
  }, [subdued]);

  return <canvas ref={(node) => { canvasRef.current = node; homeRef.current = node?.parentElement as HTMLDivElement | null; }} className={`vaani-fx-canvas${subdued ? ' vaani-fx-canvas-subdued' : ''}`} aria-hidden="true" />;
}
