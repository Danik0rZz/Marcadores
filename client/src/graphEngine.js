import { getFaviconUrl } from './utils/favicon';

/* =========================================================================
   INSTRUMENTO — graph engine

   React-free core of the knowledge graph: the design constants, the data
   derivations, the physics step, the cluster geometry and the favicon cache.
   Extracted verbatim from components/GraphView.jsx, which now owns only the
   canvas, the drawing code and the React surface.
   ========================================================================= */

// Above this node count we drop halos and favicon bitmaps and only label the
// focused node plus its neighbours, so the frame budget stays flat.
export const LARGE_GRAPH_THRESHOLD = 200;
export const MAX_DPR = 2;
export const TAU = Math.PI * 2;
// Physics (custom, no library): alpha decays below ALPHA_MIN and the loop sleeps.
export const ALPHA_START = 1, ALPHA_DECAY = 0.985, ALPHA_MIN = 0.005;
export const REPULSION = 1800, REPULSION_RANGE = 400;
export const SPRING_LENGTH = 110, SPRING_STRENGTH = 0.04;
export const CENTER_GRAVITY = 0.005, DAMPING = 0.88, MAX_SPEED = 12;
// Motion
export const ENTRY_DURATION_MS = 420, ENTRY_STAGGER_MS = 18;
export const FOCUS_DURATION_MS = 180, DIM_ALPHA = 0.22;
export const LABEL_FONT = '11px "Outfit Variable", Outfit, system-ui, sans-serif';
export const LABEL_FONT_STRONG = '600 11px "Outfit Variable", Outfit, system-ui, sans-serif';
export const MONO_FONT = '10px "JetBrains Mono Variable", "JetBrains Mono", monospace';
// Semantic pair kept app-wide: cyan = bookmark, indigo = note.
export const TYPE_STYLE = {
  bookmark: { core: '#a5f3fc', mid: '#06b6d4', rim: '#0e7490', rgb: [6, 182, 212] },
  note: { core: '#c7d2fe', mid: '#818cf8', rim: '#4338ca', rgb: [129, 140, 248] }
};
export const MANUAL_EDGE = { rgb: [16, 185, 129], alpha: 0.55, width: 2.2 };
export const AUTO_EDGE_RGB = [148, 163, 184];

// cubic-bezier(.16, 1, .3, 1) — the app's --ease token, specialized as a canvas
// easing (coefficients of x(t) = ((.58t - .06)t + .48)t and y(t) = t³ - 3t² + 3t).
const EASE_AX = 0.58, EASE_BX = -0.06, EASE_CX = 0.48;
export const EASE_INSTRUMENTO = (x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 5; i += 1) {
    const error = ((EASE_AX * t + EASE_BX) * t + EASE_CX) * t - x;
    if (Math.abs(error) < 1e-4) break;
    const derivative = (3 * EASE_AX * t + 2 * EASE_BX) * t + EASE_CX;
    if (Math.abs(derivative) < 1e-6) break;
    t -= error / derivative;
  }
  return ((t - 3) * t + 3) * t;
};

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// HSL -> RGB so category colors can be built from a name-derived hue.
function hslToRgb(hue, saturation, lightness) {
  const channel = (n) => {
    const k = (n + hue * 12) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)];
}

const categoryThemeCache = new Map();
// Stable color per category NAME: adding or reordering categories never
// reshuffles colors that already existed (the old positional palette silently
// mapped unknown names to palette[0]).
export function categoryTheme(category) {
  const key = category || '';
  if (categoryThemeCache.has(key)) return categoryThemeCache.get(key);
  const theme = key ? { rgb: hslToRgb((hashString(key.toLowerCase()) % 360) / 360, 0.62, 0.6) } : { rgb: [100, 116, 139] };
  categoryThemeCache.set(key, theme);
  return theme;
}

export const rgba = (rgb, alpha) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/* -------------------------------- graph data ------------------------------- */

export function buildRawGraph({ bookmarks, notes, relations }) {
  const nodes = [];
  const nodeMap = new Map();
  const addNode = (node) => { nodes.push(node); nodeMap.set(node.id, node); };
  const buildNode = (source, type, idPrefix, extra) => ({
    id: `${idPrefix}${source.id}`, originalId: source.id, type,
    title: source.title, category: source.category, subcategory: source.subcategory,
    theme: source.theme, tags: source.tags || [],
    // Deterministic phyllotaxis seed: stable layout across renders (no
    // Math.random during render) that the physics then settles.
    x: Math.cos(nodes.length * 2.399963) * (24 + nodes.length * 2.2),
    y: Math.sin(nodes.length * 2.399963) * (24 + nodes.length * 2.2),
    vx: 0, vy: 0, radius: 12, degree: 0, focus: 0,
    ...extra
  });

  bookmarks.forEach((b) => addNode(buildNode(b, 'bookmark', 'bm_', { url: b.url, favicon: b.favicon })));
  notes.forEach((n) => addNode(buildNode(n, 'note', 'nt_', { content: n.content, created_at: n.created_at, updated_at: n.updated_at })));

  const links = [];
  const seenPair = new Set();
  relations.forEach((r) => {
    const sourceId = `bm_${r.bookmarkId}`;
    const targetId = `nt_${r.noteId}`;
    const pairKey = `${sourceId}---${targetId}`;
    if (!nodeMap.has(sourceId) || !nodeMap.has(targetId) || seenPair.has(pairKey)) return;
    seenPair.add(pairKey);
    const source = nodeMap.get(sourceId);
    const target = nodeMap.get(targetId);
    source.degree += 1;
    target.degree += 1;
    links.push({
      sourceId, targetId, source, target,
      score: r.relationship.score || 20,
      isManual: Boolean(r.relationship.isManual),
      themes: r.relationship.matchThemes || []
    });
  });

  // Radius encodes connectivity: clamp(9 + degree * 2.2, 9, 26)
  nodes.forEach((n) => { n.radius = clamp(9 + n.degree * 2.2, 9, 26); });
  return { nodes, links };
}

export function filterGraph(graph, { selectedCategory, searchQuery }) {
  const query = searchQuery.trim().toLowerCase();
  const validNodeIds = new Set();
  graph.nodes.forEach((n) => {
    const matchCategory = !selectedCategory || (n.category && n.category.toLowerCase() === selectedCategory.toLowerCase());
    const matchQuery = !query || n.title.toLowerCase().includes(query) || (n.tags || []).some((t) => t.toLowerCase().includes(query));
    if (matchCategory && matchQuery) validNodeIds.add(n.id);
  });
  return {
    nodes: graph.nodes.filter((n) => validNodeIds.has(n.id)),
    links: graph.links.filter((l) => validNodeIds.has(l.sourceId) && validNodeIds.has(l.targetId))
  };
}

export function computeCounts(graph) {
  const categorySet = new Set();
  let manual = 0;
  graph.nodes.forEach((n) => { if (n.category) categorySet.add(n.category); });
  graph.links.forEach((l) => { if (l.isManual) manual += 1; });
  return { nodes: graph.nodes.length, links: graph.links.length, categories: categorySet.size, manual };
}

export function computeNeighborSet(graph, nodeId) {
  if (!nodeId) return null;
  const set = new Set([nodeId]);
  graph.links.forEach((l) => {
    if (l.sourceId === nodeId) set.add(l.targetId);
    if (l.targetId === nodeId) set.add(l.sourceId);
  });
  return set;
}

export function computeSelectedRelations(graph, nodeId) {
  if (!nodeId) return [];
  return graph.links
    .filter((l) => l.sourceId === nodeId || l.targetId === nodeId)
    .map((l) => ({
      key: `${l.sourceId}->${l.targetId}`,
      neighbor: l.sourceId === nodeId ? l.target : l.source,
      score: l.score, themes: l.themes, isManual: l.isManual
    }))
    .sort((a, b) => b.score - a.score);
}

export function computeAverageAffinity(relations) {
  return relations.length
    ? Math.round(relations.reduce((sum, r) => sum + r.score, 0) / relations.length)
    : 0;
}

/* --------------------------------- physics --------------------------------- */

// One integration step. The drag target arrives on sim (`draggedNode`), set by
// the caller from the camera's live drag state, so the step stays a pure
// function of its input.
// Repulsion between one pair; beyond REPULSION_RANGE it is exactly zero.
function repel(n1, n2, dragged) {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  const distSq = dx * dx + dy * dy + 100;
  const dist = Math.sqrt(distSq);
  if (dist >= REPULSION_RANGE) return;
  const force = REPULSION / distSq;
  const fx = (dx / dist) * force;
  const fy = (dy / dist) * force;
  if (n1 !== dragged) { n1.vx -= fx; n1.vy -= fy; }
  if (n2 !== dragged) { n2.vx += fx; n2.vy += fy; }
}

// Half of the 8 neighbours: each pair of adjacent cells is visited once.
const FORWARD_CELLS = [[1, 0], [-1, 1], [0, 1], [1, 1]];

// Repulsion has a finite range, so a uniform grid with cells of that size
// finds every interacting pair by looking only at adjacent cells: the same
// forces as comparing all pairs, but ~O(n) instead of O(n²) per frame.
function applyRepulsion(nodes, dragged) {
  const grid = new Map();
  for (const node of nodes) {
    const cx = Math.floor(node.x / REPULSION_RANGE);
    const cy = Math.floor(node.y / REPULSION_RANGE);
    const key = `${cx},${cy}`;
    let cell = grid.get(key);
    if (!cell) {
      cell = { cx, cy, nodes: [] };
      grid.set(key, cell);
    }
    cell.nodes.push(node);
  }

  grid.forEach(({ cx, cy, nodes: cellNodes }) => {
    for (let i = 0; i < cellNodes.length; i += 1) {
      for (let j = i + 1; j < cellNodes.length; j += 1) repel(cellNodes[i], cellNodes[j], dragged);
    }
    for (const [ox, oy] of FORWARD_CELLS) {
      const other = grid.get(`${cx + ox},${cy + oy}`);
      if (!other) continue;
      for (const a of cellNodes) {
        for (const b of other.nodes) repel(a, b, dragged);
      }
    }
  });
}

export function stepPhysics(sim) {
  const { nodes, links } = sim;
  const dragged = sim.draggedNode;
  applyRepulsion(nodes, dragged);
  links.forEach((link) => {
    const { source: s, target: t } = link;
    if (!s || !t) return;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Higher affinity pulls the pair closer.
    const force = (dist - Math.max(50, SPRING_LENGTH - Math.min(40, (link.score || 20) * 0.2))) * SPRING_STRENGTH;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (s !== dragged) { s.vx += fx; s.vy += fy; }
    if (t !== dragged) { t.vx -= fx; t.vy -= fy; }
  });
  nodes.forEach((n) => {
    if (n === dragged) return;
    n.vx = (n.vx - n.x * CENTER_GRAVITY) * DAMPING;
    n.vy = (n.vy - n.y * CENTER_GRAVITY) * DAMPING;
    const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
    if (speed > MAX_SPEED) { n.vx = (n.vx / speed) * MAX_SPEED; n.vy = (n.vy / speed) * MAX_SPEED; }
    n.x += n.vx;
    n.y += n.vy;
  });
}

/* --------------------------- cluster geometry ------------------------------ */

// One entry per drawn cluster, in first-appearance order of the category, with
// the exact numbers drawClusters consumes. Singletons are not clusters.
export function clusterBuckets(nodes) {
  const clusters = new Map();
  nodes.forEach((n) => {
    const bucket = clusters.get(n.category);
    if (bucket) { bucket.sumX += n.x; bucket.sumY += n.y; bucket.count += 1; }
    else clusters.set(n.category, { sumX: n.x, sumY: n.y, count: 1 });
  });
  const buckets = [];
  clusters.forEach((bucket, category) => {
    if (bucket.count < 2) return;
    const cx = bucket.sumX / bucket.count;
    const cy = bucket.sumY / bucket.count;
    let spread = 0;
    nodes.forEach((n) => { if (n.category === category) spread += Math.hypot(n.x - cx, n.y - cy); });
    spread /= bucket.count;
    const radius = Math.max(70, spread * 1.6 + bucket.count * 8);
    const radiusY = radius * 0.74;
    buckets.push({ category, cx, cy, radius, radiusY, count: bucket.count });
  });
  return buckets;
}

/* ------------------------------- environment ------------------------------- */

export function computeDpr() {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

// url -> Image cache. A decoded favicon mutates what the canvas must draw, so
// every async load asks the renderer to repaint.
export function createFaviconCache(invalidate) {
  const images = new Map();
  return {
    get(node) {
      const src = node.url ? getFaviconUrl(node.url) : '';
      if (!src) return null;
      let image = images.get(src);
      if (!image) {
        image = new Image();
        image.decoding = 'async';
        image.onload = () => invalidate(); // async favicon loads need their own repaint
        image.src = src;
        images.set(src, image);
      }
      return image;
    }
  };
}
