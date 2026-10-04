import { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import { createCardScene } from "./engine.ts";
import type { CardScene } from "./engine.ts";
import type { SceneSpec } from "./spec.ts";

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

// Owns the one Pixi Application for a game's table and fills its parent.
// The game lays out from the size reported through onSize and passes the
// resulting spec back in; this pushes each new spec to the engine.
//
// StrictMode runs mount effects twice and Pixi's init() is async, so
// cleanup waits for its own init to settle before destroying, and the
// canvas only attaches if this mount is still live when init resolves.
export function CardCanvas({
  spec,
  onSize,
  celebrate
}: {
  spec: SceneSpec | null;
  onSize: (size: CanvasSize) => void;
  // Fireworks each time this changes to a new non-null value.
  celebrate?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CardScene | null>(null);
  const specRef = useRef(spec);
  const onSizeRef = useRef(onSize);

  useEffect(() => {
    onSizeRef.current = onSize;
  }, [onSize]);

  useEffect(() => {
    specRef.current = spec;
    if (spec) sceneRef.current?.render(spec);
    // Lets the dev harness find cards on the canvas by key.
    if (import.meta.env.DEV) (window as { __cardSpec?: SceneSpec | null }).__cardSpec = spec;
  }, [spec]);

  useEffect(() => {
    if (celebrate) sceneRef.current?.celebrate();
  }, [celebrate]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app = new Application();
    let live = true;
    const report = () => onSizeRef.current({ width: app.screen.width, height: app.screen.height });
    const ready = app
      .init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
      })
      .then(async () => {
        if (!live) return;
        app.canvas.style.display = "block";
        host.appendChild(app.canvas);
        app.renderer.on("resize", report);
        report();
        const scene = await createCardScene(app);
        if (!live) {
          scene.destroy();
          return;
        }
        sceneRef.current = scene;
        if (specRef.current) scene.render(specRef.current);
      });
    return () => {
      live = false;
      const scene = sceneRef.current;
      sceneRef.current = null;
      void ready.then(() => {
        app.renderer?.off("resize", report);
        scene?.destroy();
        app.destroy(true, { children: true });
      });
    };
  }, []);

  // Styled inline so it works without the kit's table.css. touch-action
  // none: a drag or swipe across the table must not scroll or zoom the
  // page under it.
  return <div ref={hostRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />;
}
