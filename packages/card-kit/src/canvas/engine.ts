import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { Application, FederatedPointerEvent, Ticker } from "pixi.js";
import { cardAssetUrl } from "../cardAssets.ts";
import { cardKey } from "../cards.ts";
import type { Card } from "../cards.ts";
import { newDeck } from "../deck.ts";
import { createFireworks } from "../fireworks.ts";
import { focusAt, magnification } from "./magnify.ts";
import { cardHeight } from "./spec.ts";
import type { CardSpec, Point, SceneSpec, SlotSpec, TextSpec } from "./spec.ts";

// The card table on a Pixi canvas, shared by every game. A game hands it a
// SceneSpec - every card's key, face and place - whenever anything changes;
// the engine keeps one sprite per key and eases each toward its place every
// frame. So a card that moves zones slides, a card that turns over flips, a
// card that leaves fades (or flies to its exit), and a resize just retargets.
// It also turns pointer input into the spec's taps, drags and hand swipes.
//
// Grown out of Gin Rummy's scene, which still has its own copy.

// A sprite eases toward its target by exponential smoothing rather than a
// fixed-length tween, so a target that moves mid-flight is chased, not
// fought. These are time constants in ms; smaller is snappier.
const MOVE_TAU = 85;
const MAG_TAU = 45;
const FADE_MS = 180;
const EXIT_FADE_MS = 420;
const FLIP_MS = 240;
const SNAP_PX = 0.5; // within this of its target a sprite sits exactly on it
const FLIGHT_PX = 4; // farther than this from its target counts as in flight
// Movement before a press becomes a drag or a swipe rather than a tap.
const SLOP_PX = 8;

// Draw order on top of each card's own z: cards in flight above the table,
// a magnified card above its row, a dragged run above everything.
const Z_SLOT = -1000;
const Z_TEXT = 900;
const Z_FLIGHT = 1000;
const Z_MAG = 5000;
const Z_DRAG = 20000;
const Z_FIREWORKS = 30000;

const FACE_RESOLUTION = 2;

export interface CardScene {
  render(spec: SceneSpec): void;
  // Fireworks over the table (skipped for anyone asking for less motion).
  celebrate(): void;
  destroy(): void;
}

interface Node {
  key: string;
  spec: CardSpec;
  container: Container;
  shadow: Graphics;
  ring: Graphics;
  sprite: Sprite;
  face: Card | null;
  // Where the card rests now (eased toward tx/ty); the magnifier offsets
  // the drawn position from it.
  bx: number;
  by: number;
  tx: number;
  ty: number;
  w: number;
  drawn: string; // the w/ring the decorations were last drawn for
  mag: number;
  magTarget: number;
  // 0..1 across the card: the point the magnifier grows it from.
  origin: number;
  flip: { t: number; to: Texture } | null;
  leaving: boolean;
  dragging: boolean;
}

type Gesture =
  | { kind: "pending"; node: Node; start: Point; pointerType: string }
  | { kind: "swipe"; row: string; focusKey: string | null }
  | { kind: "drag"; node: Node; carry: Node[]; offsets: Point[]; at: Point };

export async function createCardScene(app: Application): Promise<CardScene> {
  const faces = new Map<string, Texture>();
  await Promise.all(
    newDeck().map(async (card) => {
      const texture = await Assets.load<Texture>({
        src: cardAssetUrl(card),
        data: { resolution: FACE_RESOLUTION }
      });
      faces.set(cardKey(card), texture);
    })
  );
  const back = backTexture();
  const textureFor = (face: Card | null) => (face ? faces.get(cardKey(face))! : back);

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const root = new Container();
  root.sortableChildren = true;
  app.stage.addChild(root);

  const fireworks = createFireworks(app, root, Z_FIREWORKS);

  let spec: SceneSpec = { cards: [] };
  const nodes = new Map<string, Node>();
  const slots = new Map<string, { frame: Graphics; label: Text; spec: SlotSpec }>();
  const texts = new Map<string, Text>();

  let gesture: Gesture | null = null;
  // Set once a press turns into a drag or swipe, so its release is not also
  // taken for a tap on whatever card it ends over.
  let suppressTap = false;

  // --- cards ---------------------------------------------------------------

  const createNode = (card: CardSpec): Node => {
    const container = new Container();
    const shadow = new Graphics();
    const ring = new Graphics();
    const sprite = new Sprite(textureFor(card.face));
    sprite.anchor.set(0.5);
    container.addChild(shadow, ring, sprite);
    const from = card.spawn ?? card;
    container.position.set(from.x, from.y);
    root.addChild(container);
    const node: Node = {
      key: card.key,
      spec: card,
      container,
      shadow,
      ring,
      sprite,
      face: card.face,
      bx: from.x,
      by: from.y,
      tx: card.x,
      ty: card.y,
      w: 0,
      drawn: "",
      mag: 1,
      magTarget: 1,
      origin: 0.5,
      flip: null,
      leaving: false,
      dragging: false
    };
    // Bound once; they read the node's latest spec when they fire.
    container.on("pointerdown", (event: FederatedPointerEvent) => onPointerDown(node, event));
    container.on("pointertap", () => {
      if (suppressTap) return;
      node.spec.onTap?.();
    });
    return node;
  };

  const applySpec = (node: Node, card: CardSpec) => {
    node.spec = card;
    node.tx = card.x;
    node.ty = card.y;
    if (card.face?.rank !== node.face?.rank || card.face?.suit !== node.face?.suit) {
      const to = textureFor(card.face);
      node.face = card.face;
      if (reducedMotion) node.sprite.texture = to;
      else node.flip = { t: node.flip ? 1 - node.flip.t : 0, to };
    }
    node.sprite.tint = card.tint ?? 0xffffff;
    const drawn = `${card.w}:${card.ring ?? ""}`;
    if (drawn !== node.drawn) {
      node.drawn = drawn;
      node.w = card.w;
      const h = cardHeight(card.w);
      node.sprite.width = card.w;
      node.sprite.height = h;
      const radius = card.w * 0.07;
      node.shadow
        .clear()
        .roundRect(-card.w / 2, -h / 2 + 2, card.w, h, radius)
        .fill({ color: 0x000000, alpha: 0.28 });
      node.ring.clear();
      if (card.ring != null) {
        const pad = 3;
        node.ring
          .roundRect(-card.w / 2 - pad, -h / 2 - pad, card.w + pad * 2, h + pad * 2, radius + pad)
          .stroke({ width: 3, color: card.ring });
      }
    }
    const interactive = !!(card.onTap || card.drag || card.row);
    node.container.eventMode = interactive ? "static" : "none";
    node.container.cursor = card.onTap || card.drag ? "pointer" : "default";
  };

  // --- slots and text ----------------------------------------------------

  const renderSlots = (wanted: readonly SlotSpec[]) => {
    const seen = new Set<string>();
    for (const slot of wanted) {
      seen.add(slot.key);
      let entry = slots.get(slot.key);
      if (!entry) {
        const frame = new Graphics();
        const label = new Text({ text: "", style: { fill: 0xffffff, fontFamily: "system-ui, sans-serif" } });
        label.anchor.set(0.5);
        frame.addChild(label);
        frame.zIndex = Z_SLOT;
        root.addChild(frame);
        const created = { frame, label, spec: slot };
        frame.on("pointertap", () => {
          if (!suppressTap) created.spec.onTap?.();
        });
        entry = created;
        slots.set(slot.key, entry);
      }
      entry.spec = slot;
      const h = cardHeight(slot.w);
      entry.frame
        .clear()
        .roundRect(-slot.w / 2, -h / 2, slot.w, h, slot.w * 0.07)
        .fill({ color: 0xffffff, alpha: 0.06 })
        .stroke({ width: 2, color: 0xffffff, alpha: 0.4 });
      entry.frame.position.set(slot.x, slot.y);
      entry.frame.eventMode = slot.onTap ? "static" : "none";
      entry.frame.cursor = slot.onTap ? "pointer" : "default";
      entry.label.text = slot.label ?? "";
      entry.label.style.fontSize = slot.w * 0.4;
      entry.label.style.fill = slot.labelColor ?? 0xffffff;
      entry.label.alpha = 0.45;
    }
    for (const [key, entry] of slots) {
      if (seen.has(key)) continue;
      entry.frame.destroy({ children: true });
      slots.delete(key);
    }
  };

  const renderTexts = (wanted: readonly TextSpec[]) => {
    const seen = new Set<string>();
    for (const item of wanted) {
      seen.add(item.key);
      let text = texts.get(item.key);
      if (!text) {
        text = new Text({ text: "", style: { fill: 0xffffff, fontFamily: "system-ui, sans-serif" } });
        text.anchor.set(0.5);
        text.alpha = 0.85;
        text.zIndex = Z_TEXT;
        text.eventMode = "none";
        root.addChild(text);
        texts.set(item.key, text);
      }
      text.text = item.text;
      text.style.fontSize = item.size;
      text.position.set(item.x, item.y);
    }
    for (const [key, text] of texts) {
      if (seen.has(key)) continue;
      text.destroy();
      texts.delete(key);
    }
  };

  const render = (next: SceneSpec) => {
    spec = next;
    const seen = new Set<string>();
    for (const card of next.cards) {
      seen.add(card.key);
      let node = nodes.get(card.key);
      if (!node) {
        node = createNode(card);
        nodes.set(card.key, node);
      } else if (node.leaving) {
        // A key can come back before its fade finishes (an opponent's hand
        // shrinking and growing across a turn): revive it in place.
        node.leaving = false;
        node.container.alpha = 1;
      }
      applySpec(node, card);
    }
    for (const [key, node] of nodes) {
      if (seen.has(key) || node.leaving) continue;
      node.leaving = true;
      node.dragging = false;
      node.magTarget = 1;
      node.container.eventMode = "none";
    }
    renderSlots(next.slots ?? []);
    renderTexts(next.texts ?? []);
  };

  // --- pointer input -----------------------------------------------------

  const local = (event: PointerEvent): Point => {
    const rect = app.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const rowNodes = (row: string) =>
    [...nodes.values()].filter((node) => !node.leaving && node.spec.row === row).sort((a, b) => a.tx - b.tx);

  const magnifyRow = (row: string, x: number): string | null => {
    const cards = rowNodes(row);
    if (cards.length === 0) return null;
    const lefts = cards.map((node) => node.tx - node.w / 2);
    const last = cards[cards.length - 1];
    const focus = focusAt(x, lefts, last.tx + last.w / 2);
    cards.forEach((node, index) => {
      node.magTarget = magnification(index, focus);
      node.origin = cards.length > 1 ? index / (cards.length - 1) : 0.5;
    });
    return cards[Math.min(Math.floor(focus), cards.length - 1)].key;
  };

  // A press starts on a card; the rest of the gesture is followed on the
  // window, so a drag or swipe that slides off its card - or off the
  // canvas - keeps going.
  const onPointerDown = (node: Node, event: FederatedPointerEvent) => {
    suppressTap = false;
    if (gesture) return;
    gesture = { kind: "pending", node, start: { x: event.global.x, y: event.global.y }, pointerType: event.pointerType };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!gesture) return;
    const at = local(event);
    if (gesture.kind === "pending") {
      const { node, start, pointerType } = gesture;
      if (Math.hypot(at.x - start.x, at.y - start.y) < SLOP_PX) return;
      suppressTap = true;
      const drag = node.spec.drag;
      if (drag) {
        const carry = drag.carry.map((key) => nodes.get(key)).filter((each): each is Node => !!each && !each.leaving);
        carry.forEach((each) => (each.dragging = true));
        gesture = {
          kind: "drag",
          node,
          carry,
          offsets: carry.map((each) => ({ x: each.bx - start.x, y: each.by - start.y })),
          at
        };
      } else if (node.spec.row && pointerType !== "mouse") {
        gesture = { kind: "swipe", row: node.spec.row, focusKey: null };
      } else {
        gesture = null;
        return;
      }
    }
    if (gesture.kind === "swipe") {
      gesture.focusKey = magnifyRow(gesture.row, at.x);
    } else if (gesture.kind === "drag") {
      const drag = gesture;
      drag.at = at;
      drag.carry.forEach((each, index) => {
        each.bx = at.x + drag.offsets[index].x;
        each.by = at.y + drag.offsets[index].y;
      });
    }
  };

  const onPointerUp = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    const finished = gesture;
    gesture = null;
    if (!finished) return;
    if (finished.kind === "swipe") {
      for (const node of rowNodes(finished.row)) node.magTarget = 1;
      if (finished.focusKey) spec.onSwipeEnd?.(finished.focusKey);
    } else if (finished.kind === "drag") {
      finished.carry.forEach((each) => (each.dragging = false));
      finished.node.spec.drag?.onDrop(finished.at);
    }
  };

  // --- motion ------------------------------------------------------------

  const tick = (ticker: Ticker) => {
    const dt = ticker.deltaMS;
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt / MOVE_TAU);
    const km = reducedMotion ? 1 : 1 - Math.exp(-dt / MAG_TAU);
    for (const [key, node] of nodes) {
      const { container } = node;
      if (node.leaving) {
        const exit = node.spec.exit;
        if (exit) {
          node.bx += (exit.x - node.bx) * k;
          node.by += (exit.y - node.by) * k;
        }
        container.alpha -= dt / (exit ? EXIT_FADE_MS : FADE_MS);
        if (container.alpha <= 0) {
          container.destroy({ children: true });
          nodes.delete(key);
          continue;
        }
      } else if (!node.dragging) {
        const dx = node.tx - node.bx;
        const dy = node.ty - node.by;
        if (dx * dx + dy * dy < SNAP_PX * SNAP_PX) {
          node.bx = node.tx;
          node.by = node.ty;
        } else {
          node.bx += dx * k;
          node.by += dy * k;
        }
      }

      node.mag += (node.magTarget - node.mag) * km;
      if (Math.abs(node.magTarget - node.mag) < 0.002) node.mag = node.magTarget;
      const grow = node.mag - 1;
      const h = cardHeight(node.w);
      // Grow from the bottom edge, and from the side the card sits toward,
      // so the swell stays on screen.
      container.position.set(node.bx + (0.5 - node.origin) * node.w * grow, node.by - (h / 2) * grow);

      let flipX = 1;
      if (node.flip) {
        node.flip.t += dt / FLIP_MS;
        if (node.flip.t >= 0.5 && node.sprite.texture !== node.flip.to) node.sprite.texture = node.flip.to;
        if (node.flip.t >= 1) node.flip = null;
        else flipX = Math.max(0.02, Math.abs(1 - 2 * node.flip.t));
      }
      container.scale.set(node.mag * flipX, node.mag);

      const far = (node.tx - node.bx) ** 2 + (node.ty - node.by) ** 2 > FLIGHT_PX * FLIGHT_PX;
      container.zIndex =
        node.spec.z +
        (node.dragging ? Z_DRAG : 0) +
        (grow > 0.01 ? Z_MAG + Math.round(grow * 100) : 0) +
        (far && !node.leaving ? Z_FLIGHT : 0);
    }
    fireworks.update(dt);
  };
  app.ticker.add(tick);

  return {
    render,
    celebrate() {
      if (!reducedMotion) fireworks.burst(app.screen.width, app.screen.height);
    },
    destroy() {
      onPointerUp();
      app.ticker.remove(tick);
      fireworks.destroy();
      root.destroy({ children: true });
      nodes.clear();
      slots.clear();
      texts.clear();
      back.destroy(true);
    }
  };
}

// The card back, matching the DOM table's: a white border round blue felt
// with a fine diagonal stripe. Drawn once on a 2D canvas at high resolution
// and scaled per sprite.
function backTexture(): Texture {
  const w = 334;
  const h = Math.round(w * 1.45);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const radius = w * 0.07;
  const rounded = (x: number, y: number, rw: number, rh: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, rw, rh, r);
  };
  rounded(0, 0, w, h, radius);
  ctx.fillStyle = "#f4f4f4";
  ctx.fill();
  const inset = w * 0.05;
  rounded(inset, inset, w - inset * 2, h - inset * 2, radius * 0.6);
  ctx.fillStyle = "#3a5aa0";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = w * 0.03;
  for (let x = -h; x < w + h; x += w * 0.07) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.stroke();
  }
  ctx.restore();
  return Texture.from(canvas);
}
