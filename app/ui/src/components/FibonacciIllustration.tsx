import { useEffect, useRef } from "react";

const CONFIG = {
  pointCount: 360,
  goldenAngle: Math.PI * (3 - Math.sqrt(5)),
  pointRadius: 1.15,
  maxLinkDistance: 38,
  activeLinkDistance: 20,
  spiralScale: 10.5,
  driftAmplitude: 7,
  driftSpeed: 0.0012,
  rotationSpeed: 0.00008,
  angleWarpAmplitude: 0.055,
  radialWarpAmplitude: 1.9,
  lineAlpha: 0.16,
  activeLineAlpha: 0.28,
  pointAlpha: 0.84,
  pulseThreshold: 0.76,
  pulseRadiusBoost: 1.05,
  minVisibility: 0.32,
  peakGlowThreshold: 0.78,
  peakGlowRadius: 11,
  peakGlowAlpha: 0.1,
  strokeColor: "70,70,70",
  activeStrokeColor: "14,14,14",
  pointColor: "12,12,12",
  glowColor: "96,96,96",
};

type BasePoint = {
  angle: number;
  radius: number;
  seed: number;
  pulseRateA: number;
  pulseRateB: number;
  pulseOffsetA: number;
  pulseOffsetB: number;
};

export function FibonacciIllustration() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let centerX = 0;
    let centerY = 0;
    let basePoints: BasePoint[] = [];
    let animationFrameId: number | null = null;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const buildBasePoints = () => {
      basePoints = [];

      for (let i = 0; i < CONFIG.pointCount; i += 1) {
        const angle = i * CONFIG.goldenAngle;
        const radius = CONFIG.spiralScale * Math.sqrt(i);

        basePoints.push({
          angle,
          radius,
          seed: i * 0.173,
          pulseRateA: 0.0011 + (i % 11) * 0.00007,
          pulseRateB: 0.0018 + (i % 7) * 0.00009,
          pulseOffsetA: i * 0.91,
          pulseOffsetB: i * 1.37,
        });
      }
    };

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width || 490;
      height = rect.height || 400;
      dpr = Math.max(1, window.devicePixelRatio || 1);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      centerX = width / 2;
      centerY = height / 2;
      buildBasePoints();
    };

    const getAnimatedPoints = (time: number) => {
      const t = time * CONFIG.driftSpeed;
      const rotation = prefersReducedMotion ? 0 : time * CONFIG.rotationSpeed;

      return basePoints.map((point) => {
        const baseX = Math.cos(point.angle) * point.radius;
        const baseY = Math.sin(point.angle) * point.radius;

        const flowA = Math.sin(baseX * 0.018 + t * 0.83 + point.seed * 1.7);
        const flowB = Math.cos(baseY * 0.015 - t * 0.61 + point.seed * 2.3);
        const flowC = Math.sin((baseX + baseY) * 0.01 + t * 0.37 + point.seed * 0.8);

        const wanderRadius = prefersReducedMotion
          ? 0
          : CONFIG.driftAmplitude *
            (0.38 + 0.62 * ((Math.sin(t * 0.23 + point.seed * 5.1) + 1) / 2));

        const flowAngle = flowA * 1.8 + flowB * 1.25 + flowC * 0.95;
        const driftX = prefersReducedMotion
          ? 0
          : Math.cos(flowAngle) * wanderRadius +
            Math.sin(t * 0.49 + point.seed * 4.7 + flowB) * (CONFIG.driftAmplitude * 0.22);

        const driftY = prefersReducedMotion
          ? 0
          : Math.sin(flowAngle) * wanderRadius +
            Math.cos(t * 0.43 + point.seed * 3.9 + flowA) * (CONFIG.driftAmplitude * 0.22);

        const angle = point.angle + rotation;
        const angleWarp = prefersReducedMotion
          ? 0
          : Math.sin(t * 0.41 + point.seed * 1.9 + flowB) * CONFIG.angleWarpAmplitude;
        const radialWarp = prefersReducedMotion
          ? 0
          : (flowA + flowC) * CONFIG.radialWarpAmplitude;

        const pulseA = (Math.sin(time * point.pulseRateA + point.pulseOffsetA) + 1) / 2;
        const pulseB = (Math.sin(time * point.pulseRateB + point.pulseOffsetB) + 1) / 2;
        const pulseRaw = pulseA * pulseB;
        const pulseBase = prefersReducedMotion
          ? 0
          : Math.max(0, (pulseRaw - CONFIG.pulseThreshold) / (1 - CONFIG.pulseThreshold));
        const pulse = pulseBase > 0 ? Math.pow(pulseBase, 0.72) : 0;
        const visibility = prefersReducedMotion
          ? 1
          : CONFIG.minVisibility + pulse * (1 - CONFIG.minVisibility);

        return {
          x: centerX + Math.cos(angle + angleWarp) * (point.radius + radialWarp) + driftX,
          y: centerY + Math.sin(angle + angleWarp) * (point.radius + radialWarp) + driftY,
          radius: point.radius,
          pulse,
          visibility,
        };
      });
    };

    const drawLinks = (points: Array<{ x: number; y: number; radius: number; pulse: number; visibility: number }>) => {
      ctx.lineWidth = 1;

      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];

        for (let j = i + 1; j < points.length; j += 1) {
          const b = points[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);

          if (dist > CONFIG.maxLinkDistance) continue;

          const visibilityCoupling = Math.min(a.visibility, b.visibility);
          const alpha =
            (1 - dist / CONFIG.maxLinkDistance) *
            CONFIG.lineAlpha *
            (0.34 + visibilityCoupling * 0.66);

          if (alpha <= 0.008) continue;

          ctx.strokeStyle = `rgba(${CONFIG.strokeColor}, ${alpha})`;

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          if (dist > CONFIG.activeLinkDistance) continue;

          const proximity = 1 - dist / CONFIG.activeLinkDistance;
          const pulseCoupling = Math.max(a.pulse, b.pulse) * 0.7 + Math.min(a.pulse, b.pulse) * 0.3;
          const liveAlpha =
            proximity *
            CONFIG.activeLineAlpha *
            (0.45 + pulseCoupling) *
            (0.55 + visibilityCoupling * 0.45);

          if (liveAlpha <= 0.02) continue;

          ctx.lineWidth = 1.3;
          ctx.strokeStyle = `rgba(${CONFIG.activeStrokeColor}, ${liveAlpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }
    };

    const drawPoints = (points: Array<{ x: number; y: number; radius: number; pulse: number; visibility: number }>) => {
      for (const point of points) {
        const edgeFade = Math.max(
          0.2,
          1 - Math.max(0, point.radius - Math.min(width, height) * 0.28) / 180,
        );

        const pulseRadius =
          CONFIG.pointRadius * (0.62 + point.visibility * 0.38) +
          point.pulse * CONFIG.pulseRadiusBoost;
        const alpha = CONFIG.pointAlpha * edgeFade * (0.34 + point.visibility * 0.66);

        if (alpha <= 0.015) continue;

        ctx.fillStyle = `rgba(${CONFIG.pointColor}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, pulseRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawPeakGlow = (points: Array<{ x: number; y: number; radius: number; pulse: number; visibility: number }>) => {
      for (const point of points) {
        if (point.pulse <= CONFIG.peakGlowThreshold) continue;

        const glowStrength =
          (point.pulse - CONFIG.peakGlowThreshold) / (1 - CONFIG.peakGlowThreshold);
        const radius =
          CONFIG.peakGlowRadius * (0.72 + glowStrength * 0.9);

        const gradient = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          radius,
        );

        gradient.addColorStop(
          0,
          `rgba(${CONFIG.glowColor}, ${CONFIG.peakGlowAlpha * glowStrength})`,
        );
        gradient.addColorStop(1, `rgba(${CONFIG.glowColor}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const points = getAnimatedPoints(time);
      drawLinks(points);
      drawPeakGlow(points);
      drawPoints(points);

      if (!prefersReducedMotion) {
        animationFrameId = window.requestAnimationFrame(render);
      }
    };

    resizeCanvas();
    if (animationFrameId) window.cancelAnimationFrame(animationFrameId);

    if (prefersReducedMotion) {
      render(0);
    } else {
      animationFrameId = window.requestAnimationFrame(render);
    }

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
      if (prefersReducedMotion) {
        render(0);
      }
    });

    resizeObserver.observe(canvas);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fibonacci-illustration"
      aria-hidden="true"
    />
  );
}
