'use client';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

type DottedSurfaceProps = Omit<React.ComponentProps<'div'>, 'ref'> & {
  /**
   * When true, sizes the renderer to the container element instead of
   * the window and switches from `fixed` to `absolute` positioning.
   * Also tunes camera/particle settings for small card use.
   */
  fitContainer?: boolean;
};

export function DottedSurface({ className, fitContainer = false, ...props }: DottedSurfaceProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Grid parameters ──────────────────────────────────────
    // Denser, closer grid for card mode
    const SEPARATION = fitContainer ? 55  : 150;
    const AMOUNTX    = fitContainer ? 45  : 40;
    const AMOUNTY    = fitContainer ? 20  : 60;

    const getW = () => fitContainer ? container.offsetWidth  : window.innerWidth;
    const getH = () => fitContainer ? container.offsetHeight : window.innerHeight;

    // Allow the DOM to settle so offsetWidth/Height are accurate
    const W = Math.max(getW(), 300);
    const H = Math.max(getH(), 80);

    // ── Scene ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog   = new THREE.Fog(0xffffff, 2000, 10000);

    const camera = new THREE.PerspectiveCamera(65, W / H, 1, 10000);
    // Card mode: camera close and low-angle to show full grid
    camera.position.set(0, fitContainer ? 80 : 355, fitContainer ? 320 : 1220);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // ── Particles ────────────────────────────────────────────
    const positions: number[] = [];
    const colors: number[]    = [];

    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions.push(
          ix * SEPARATION - (AMOUNTX * SEPARATION) / 2,
          0,
          iy * SEPARATION - (AMOUNTY * SEPARATION) / 2,
        );
        if (fitContainer) {
          // Bright cyan-white for dark card background
          colors.push(0.72, 0.88, 1.0);
        } else if (resolvedTheme === 'dark') {
          colors.push(0.78, 0.78, 0.78);
        } else {
          colors.push(0.08, 0.08, 0.08);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));

    const material = new THREE.PointsMaterial({
      // Card mode: larger fixed-size dots; full-screen: size-attenuated
      size: fitContainer ? 5.5 : 8,
      vertexColors: true,
      transparent: true,
      opacity: fitContainer ? 1.0 : 0.85,
      sizeAttenuation: !fitContainer,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ── Animation loop ───────────────────────────────────────
    let rafId  = 0;
    let count  = 0;
    // Gentler amplitude in card mode so the wave reads clearly at small scale
    const AMP  = fitContainer ? 22 : 50;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const arr = geometry.attributes.position.array as Float32Array;
      let i = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          arr[i * 3 + 1] =
            Math.sin((ix + count) * 0.35) * AMP +
            Math.sin((iy + count) * 0.55) * AMP;
          i++;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      count += 0.06;
    };
    tick();

    // ── Resize ───────────────────────────────────────────────
    const handleResize = () => {
      const nW = Math.max(getW(), 300);
      const nH = Math.max(getH(), 80);
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
      renderer.setSize(nW, nH);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (fitContainer) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', handleResize);
    }

    // ── Cleanup ──────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver ? resizeObserver.disconnect() : window.removeEventListener('resize', handleResize);

      scene.traverse(obj => {
        if (obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme, fitContainer]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'pointer-events-none',
        fitContainer ? 'absolute inset-0 z-0' : 'fixed inset-0 -z-1',
        className,
      )}
      {...props}
    />
  );
}
