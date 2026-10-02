import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, FileText, Pause, Play, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import GraphInspector from './GraphInspector';
import {
  ALPHA_DECAY, ALPHA_MIN, ALPHA_START, AUTO_EDGE_RGB, DIM_ALPHA, EASE_INSTRUMENTO, ENTRY_DURATION_MS,
  ENTRY_STAGGER_MS, FOCUS_DURATION_MS, LABEL_FONT, LABEL_FONT_STRONG, LARGE_GRAPH_THRESHOLD, MANUAL_EDGE,
  MONO_FONT, TAU, TYPE_STYLE, buildRawGraph, categoryTheme, clamp, clusterBuckets, computeAverageAffinity,
  computeCounts, computeDpr, computeNeighborSet, computeSelectedRelations, createFaviconCache, filterGraph,
  rgba, stepPhysics
} from '../graphEngine';
import '../graph.css';

/* =========================================================================
   INSTRUMENTO — design constants

   Everything shared with the extracted engine (physics, motion, node/edge
   styling, colors) lives in ../graphEngine; these are the canvas-only ones.
   ========================================================================= */

// Background: faint dot grid, composited once offscreen
const DOT_SPACING = 26, DOT_ALPHA = 0.035;
const ZOOM_MIN = 0.2, ZOOM_MAX = 3.5;
const LABEL_COLOR = '#a1a1aa', LABEL_COLOR_FOCUS = '#fafafa';

/* =========================================================================
   COMPONENT
   ========================================================================= */

export default function GraphView({
  bookmarks = [], notes = [], relations = [], categories = [],
  onOpenNoteDetail, onViewRelatedBookmark, onViewRelatedNote
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const inspectorRef = useRef(null);
  const shouldRestoreFocusRef = useRef(false);

  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLabels, setShowLabels] = useState(true);
  const [isPhysicsRunning, setIsPhysicsRunning] = useState(true);
  // Ids, not node objects: each data refetch builds new node objects, and the
  // nodes are looked up from the current graph during render.
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const setHoveredNode = useCallback((node) => setHoveredId(node ? node.id : null), []);
  const setSelectedNode = useCallback((node) => setSelectedId(node ? node.id : null), []);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, visible: false });

  const simulationRef = useRef({ nodes: [], links: [], alpha: 0, frameId: null, dirty: true, focusRamp: 0, lastFrame: 0, generationKey: undefined, draggedNode: null });
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1, isDragging: false, dragStartX: 0, dragStartY: 0, draggedNode: null });
  const viewRef = useRef({ cssWidth: 0, cssHeight: 0, dpr: 1 });
  const hasCenteredRef = useRef(false);
  const faviconCacheRef = useRef(null);
  const reducedMotionRef = useRef(false);
  // Volatile render inputs live in refs: the rAF effect must never restart
  // because of hover, selection, neighbour, label or physics changes.
  const volatileRef = useRef({ hoveredNode: null, selectedNode: null, neighborSet: null, showLabels: true, isPhysicsRunning: true });
  const invalidateRef = useRef(() => {});
  const controlsRef = useRef({ zoomBy: () => {}, resetCamera: () => {} });

  /* ------------------------------ graph data ------------------------------ */

  const rawGraphData = useMemo(
    () => buildRawGraph({ bookmarks, notes, relations }),
    [bookmarks, notes, relations]
  );

  const filteredGraph = useMemo(
    () => filterGraph(rawGraphData, { selectedCategory, searchQuery }),
    [rawGraphData, selectedCategory, searchQuery]
  );

  const counts = useMemo(() => computeCounts(filteredGraph), [filteredGraph]);

  // A node filtered out or deleted simply resolves to null: no ghost inspector.
  const nodeById = useMemo(() => new Map(filteredGraph.nodes.map((n) => [n.id, n])), [filteredGraph]);
  const hoveredNode = nodeById.get(hoveredId) ?? null;
  const selectedNode = nodeById.get(selectedId) ?? null;

  const neighborSet = useMemo(
    () => computeNeighborSet(filteredGraph, (hoveredNode || selectedNode)?.id ?? null),
    [hoveredNode, selectedNode, filteredGraph]
  );

  const selectedRelations = useMemo(
    () => computeSelectedRelations(filteredGraph, selectedNode?.id ?? null),
    [selectedNode, filteredGraph]
  );

  const averageAffinity = useMemo(() => computeAverageAffinity(selectedRelations), [selectedRelations]);

  /* ---------------- render loop (owns the canvas, rAF and listeners) --------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const ctx = canvas.getContext('2d');
    const sim = simulationRef.current;
    const cam = cameraRef.current;
    const view = viewRef.current;
    const background = { canvas: document.createElement('canvas'), width: 0, height: 0, dpr: 0 };

    const ensureFrame = () => { if (sim.frameId === null) sim.frameId = requestAnimationFrame(frame); };
    const scheduleFrame = () => { if (!document.hidden) ensureFrame(); }; // paused while hidden
    const invalidate = () => { sim.dirty = true; scheduleFrame(); };
    invalidateRef.current = invalidate;

    // The favicon cache owns its url -> Image map and the ref guard keeps it warm across
    // a dev remount instead of refetching. It invalidates through the ref, never through
    // this mount's closure, so an image that loads after a remount still repaints on the
    // live loop (the unmount cleanup points the ref at a no-op).
    if (!faviconCacheRef.current) faviconCacheRef.current = createFaviconCache(() => invalidateRef.current());
    const favicons = faviconCacheRef.current;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = motionQuery.matches;
    const handleMotionChange = (event) => { reducedMotionRef.current = event.matches; invalidate(); };
    motionQuery.addEventListener('change', handleMotionChange);

    const buildBackground = (width, height, dpr) => {
      background.width = width;
      background.height = height;
      background.dpr = dpr;
      background.canvas.width = Math.max(1, Math.round(width * dpr));
      background.canvas.height = Math.max(1, Math.round(height * dpr));
      const bg = background.canvas.getContext('2d');
      bg.setTransform(dpr, 0, 0, dpr, 0, 0);
      bg.clearRect(0, 0, width, height);
      // Soft radial vignette from the app background tone.
      const vignette = bg.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.42, Math.max(width, height) * 0.72);
      vignette.addColorStop(0, 'rgba(32,32,36,0.95)');
      vignette.addColorStop(1, 'rgba(9,9,11,1)');
      bg.fillStyle = vignette;
      bg.fillRect(0, 0, width, height);
      // The dot grid is composited once here: thousands of arcs are far too
      // costly to redraw per frame, so each frame blits this bitmap instead.
      bg.fillStyle = `rgba(255,255,255,${DOT_ALPHA})`;
      for (let x = DOT_SPACING / 2; x < width; x += DOT_SPACING) {
        for (let y = DOT_SPACING / 2; y < height; y += DOT_SPACING) {
          bg.beginPath();
          bg.arc(x, y, 1, 0, TAU);
          bg.fill();
        }
      }
    };

    const resizeCanvas = () => {
      // Content box, not the border-box rect: the shell has a 1px border with
      // box-sizing: border-box, so the rect would oversize the canvas and clip it.
      const cssWidth = Math.max(1, Math.round(container.clientWidth));
      const cssHeight = Math.max(1, Math.round(container.clientHeight));
      const dpr = computeDpr();
      const previousWidth = view.cssWidth;
      const previousHeight = view.cssHeight;
      // CSS size stays in CSS pixels; only the backing store scales with the DPR.
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.cssWidth = cssWidth;
      view.cssHeight = cssHeight;
      view.dpr = dpr;
      if (background.width !== cssWidth || background.height !== cssHeight || background.dpr !== dpr) {
        buildBackground(cssWidth, cssHeight, dpr);
      }
      if (!hasCenteredRef.current) {
        // First frame with a real canvas size, after sizing: the camera lands on
        // the true center instead of the stale 300x150 default.
        cam.x = cssWidth / 2;
        cam.y = cssHeight / 2;
        cam.zoom = 1;
        hasCenteredRef.current = true;
      } else if (previousWidth > 0 && previousHeight > 0) {
        // Keep the world point that was centered before the resize centered after it.
        cam.x += (cssWidth - previousWidth) / 2;
        cam.y += (cssHeight - previousHeight) / 2;
      }
      invalidate();
    };

    const zoomAt = (anchorX, anchorY, factor) => {
      const nextZoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      cam.x = anchorX - (anchorX - cam.x) * (nextZoom / cam.zoom);
      cam.y = anchorY - (anchorY - cam.y) * (nextZoom / cam.zoom);
      cam.zoom = nextZoom;
      invalidate();
    };
    // Zoom buttons re-anchor on the canvas center, never on the world origin.
    controlsRef.current = {
      zoomBy: (factor) => zoomAt(view.cssWidth / 2, view.cssHeight / 2, factor),
      resetCamera: () => { cam.x = view.cssWidth / 2; cam.y = view.cssHeight / 2; cam.zoom = 1; invalidate(); }
    };

    const handleWheel = (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.12 : 0.88);
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        sim.lastFrame = 0;
        scheduleFrame();
        return;
      }
      if (sim.frameId !== null) cancelAnimationFrame(sim.frameId);
      sim.frameId = null;
    };

    let dprQuery = null;
    const handleDprChange = () => { bindDprListener(); resizeCanvas(); };
    const bindDprListener = () => {
      if (dprQuery) dprQuery.removeEventListener('change', handleDprChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener('change', handleDprChange);
    };

    // Truncation is measured, never counted in characters.
    const fitLabel = (text, maxWidth) => {
      if (!text) return '';
      if (ctx.measureText(text).width <= maxWidth) return text;
      let lo = 1;
      let hi = text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
        else hi = mid - 1;
      }
      return `${text.slice(0, lo)}…`;
    };

    const drawNodeGlyph = (x, y, radius) => {
      // Deliberate canvas primitive: a minimal document glyph for notes. Three
      // raw strokes instead of an icon-library glyph, so it stays crisp at any
      // node radius and needs no extra asset or bitmap.
      const half = radius * 0.42;
      ctx.strokeStyle = 'rgba(250,250,250,0.92)';
      ctx.lineWidth = Math.max(1, radius * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - half, y - radius * 0.26);
      ctx.lineTo(x + half, y - radius * 0.26);
      ctx.moveTo(x - half, y);
      ctx.lineTo(x + half, y);
      ctx.moveTo(x - half, y + radius * 0.26);
      ctx.lineTo(x + half * 0.45, y + radius * 0.26);
      ctx.stroke();
    };

    const drawClusters = (nodes) => {
      clusterBuckets(nodes).forEach(({ category, cx, cy, radius, radiusY, count }) => {
        const theme = categoryTheme(category);
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius, radiusY, 0, 0, TAU);
        ctx.fillStyle = rgba(theme.rgb, 0.045);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(theme.rgb, 0.14);
        ctx.stroke();
        ctx.font = MONO_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = rgba(theme.rgb, 0.6);
        ctx.fillText(`${category || 'Sin categoría'} · ${count}`, cx, cy - radiusY - 8);
      });
    };

    const drawLinks = (links, activeId, dimFactor) => {
      ctx.lineCap = 'round';
      links.forEach((l) => {
        const { source: s, target: t } = l;
        if (!s || !t) return;
        const isHighlighted = activeId !== null && (l.sourceId === activeId || l.targetId === activeId);
        const alphaFactor = activeId !== null && !isHighlighted ? dimFactor : 1;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const distance = Math.hypot(dx, dy) || 1;
        // Perpendicular control point at ~8% of the distance: a soft symmetric
        // bow instead of a straight chord. No arrowheads: affinity is symmetric.
        const controlX = (s.x + t.x) / 2 + (-dy / distance) * distance * 0.08;
        const controlY = (s.y + t.y) / 2 + (dx / distance) * distance * 0.08;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(controlX, controlY, t.x, t.y);
        if (l.isManual) {
          ctx.lineWidth = MANUAL_EDGE.width;
          ctx.strokeStyle = rgba(MANUAL_EDGE.rgb, MANUAL_EDGE.alpha * alphaFactor);
        } else {
          const weight = Math.min(1, (l.score || 20) / 100);
          ctx.lineWidth = 0.7 + 1.4 * weight;
          ctx.strokeStyle = rgba(AUTO_EDGE_RGB, (0.1 + 0.32 * weight) * alphaFactor);
        }
        ctx.stroke();
      });
    };

    const drawNodes = (nodes, activeId, selectedId, neighbors, now, largeGraph, dimFactor) => {
      const reduced = reducedMotionRef.current;
      const focusActive = activeId !== null;
      nodes.forEach((n) => {
        const style = TYPE_STYLE[n.type] || TYPE_STYLE.note;
        const isActive = activeId === n.id;
        const isNeighbor = neighbors ? neighbors.has(n.id) : true;
        const focus = n.focus || 0;
        // Entry reveal: staggered scale 0.6 -> 1 and alpha 0 -> 1.
        const entry = EASE_INSTRUMENTO(clamp(reduced ? 1 : (now - (n.entryStart ?? now)) / ENTRY_DURATION_MS, 0, 1));
        if (entry <= 0) return;
        const alpha = entry * (focusActive && !isNeighbor ? dimFactor : 1);
        if (alpha <= 0.01) return;
        const radius = n.radius * (0.6 + 0.4 * entry) * (1 + 0.12 * focus);
        const { x, y } = n;

        const isSelected = selectedId === n.id;
        // Selection reads as a stronger glow rather than a stroked ring, so the bubble
        // keeps a clean silhouette. The halo is still drawn for the selected node above
        // the large-graph threshold, where per-node halos are skipped for cost.
        if (!largeGraph || isSelected) {
          const haloScale = isSelected ? 2.7 : 2.1;
          const haloAlpha = (isSelected ? 0.34 : 0.2) * (0.35 + 0.65 * focus);
          const halo = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * haloScale);
          halo.addColorStop(0, rgba(style.rgb, haloAlpha));
          halo.addColorStop(1, rgba(style.rgb, 0));
          ctx.beginPath();
          ctx.arc(x, y, radius * haloScale, 0, TAU);
          ctx.fillStyle = halo;
          ctx.fill();
        }

        ctx.globalAlpha = alpha;
        const body = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.1, x, y, radius);
        body.addColorStop(0, style.core);
        body.addColorStop(0.55, style.mid);
        body.addColorStop(1, style.rim);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fillStyle = body;
        ctx.fill();
        // No stroke on the bubble: the radial gradient rim plus the halo already define
        // the silhouette, and a hairline outline reads as a cheap border.

        let drewFavicon = false;
        if (n.type === 'bookmark' && !largeGraph && alpha > 0.4) {
          const image = favicons.get(n);
          if (image && image.complete && image.naturalWidth > 0) {
            // Never read pixels back (getImageData/toDataURL): cross-origin
            // favicons would taint the canvas.
            const fr = radius * 0.62;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, fr, 0, TAU);
            ctx.clip();
            ctx.drawImage(image, x - fr, y - fr, fr * 2, fr * 2);
            ctx.restore();
            drewFavicon = true;
          }
        }
        if (!drewFavicon) {
          if (n.type === 'note') drawNodeGlyph(x, y, radius);
          else {
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, TAU);
            ctx.fillStyle = '#fafafa';
            ctx.fill();
          }
        }

        // Above the large-graph threshold only focus and neighbours are labelled.
        const labelled = isActive || isNeighbor || (volatileRef.current.showLabels && !largeGraph);
        if (labelled && alpha > 0.25) {
          ctx.font = isActive ? LABEL_FONT_STRONG : LABEL_FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.globalAlpha = isActive ? 1 : alpha;
          ctx.fillStyle = isActive ? LABEL_COLOR_FOCUS : LABEL_COLOR;
          ctx.fillText(fitLabel(n.title, clamp(radius * 6, 72, 168)), x, y + radius + 6);
        }
        ctx.globalAlpha = 1;
      });
    };

    const draw = (now) => {
      const { cssWidth, cssHeight, dpr } = view;
      if (!cssWidth || !cssHeight) return;
      const v = volatileRef.current;
      const activeId = (v.hoveredNode || v.selectedNode)?.id ?? null;
      const dimFactor = 1 - (1 - DIM_ALPHA) * sim.focusRamp;
      // Everything below draws in CSS pixels; the DPR transform is already set.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.drawImage(background.canvas, 0, 0, cssWidth, cssHeight);
      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.zoom, cam.zoom);
      drawClusters(sim.nodes); // clusters sit beneath the edges
      drawLinks(sim.links, activeId, dimFactor);
      drawNodes(sim.nodes, activeId, v.selectedNode?.id ?? null, v.neighborSet, now, sim.nodes.length > LARGE_GRAPH_THRESHOLD, dimFactor);
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const frame = (now) => {
      sim.frameId = null;
      const v = volatileRef.current;
      const dt = sim.lastFrame ? Math.min(64, now - sim.lastFrame) : 16;
      sim.lastFrame = now;
      const activeId = (v.hoveredNode || v.selectedNode)?.id ?? null;
      const focusTarget = v.hoveredNode || v.selectedNode ? 1 : 0;
      const reduced = reducedMotionRef.current;
      const focusStep = reduced ? 1 : Math.min(1, dt / FOCUS_DURATION_MS);
      let animating = false;

      if (Math.abs(sim.focusRamp - focusTarget) > 0.001) {
        sim.focusRamp += (focusTarget - sim.focusRamp) * focusStep;
        if (Math.abs(sim.focusRamp - focusTarget) <= 0.001) sim.focusRamp = focusTarget;
        animating = true;
      }
      sim.nodes.forEach((n) => {
        const target = activeId === n.id ? 1 : 0;
        if (Math.abs((n.focus || 0) - target) > 0.001) {
          n.focus = (n.focus || 0) + (target - (n.focus || 0)) * focusStep;
          animating = true;
        }
        // The entry reveal is pinned to its end state under reduced motion, so
        // waiting out the window would only redraw identical frames.
        if (!reduced && n.entryStart !== undefined && now < n.entryStart + ENTRY_DURATION_MS) animating = true;
      });

      let stepped = false;
      if (v.isPhysicsRunning && sim.alpha > ALPHA_MIN) {
        // The engine step reads the drag target from sim: mirror the camera's live
        // drag state once per step so a dragged node is still never pushed.
        sim.draggedNode = cam.draggedNode;
        stepPhysics(sim);
        sim.alpha *= ALPHA_DECAY;
        stepped = true;
      }
      if (stepped || sim.dirty || animating) {
        sim.dirty = false;
        draw(now);
      }
      // Sleep once settled and nothing animates; invalidate() restarts the loop.
      if ((v.isPhysicsRunning && sim.alpha > ALPHA_MIN) || animating) ensureFrame();
      else sim.lastFrame = 0;
    };

    bindDprListener();
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resizeCanvas()) : null;
    if (resizeObserver) resizeObserver.observe(container);
    resizeCanvas();

    return () => {
      if (sim.frameId !== null) cancelAnimationFrame(sim.frameId);
      sim.frameId = null;
      motionQuery.removeEventListener('change', handleMotionChange);
      if (dprQuery) dprQuery.removeEventListener('change', handleDprChange);
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('wheel', handleWheel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (resizeObserver) resizeObserver.disconnect();
      invalidateRef.current = () => {};
      controlsRef.current = { zoomBy: () => {}, resetCamera: () => {} };
    };
  }, []);

  /* ---------------- state -> refs sync (repaint only, never a restart) ------- */

  // Layout effect on purpose: the reconciliation below must land in the same
  // commit as the new graph, so the inspector never paints the previous node
  // object for one frame after a refetch.
  useLayoutEffect(() => {
    const sim = simulationRef.current;
    // Content-based generation key: node ids plus link endpoint pairs, both
    // order-insensitive, so a same-cardinality refetch is still detected.
    const nodeKey = filteredGraph.nodes.map((n) => n.id).slice().sort().join(',');
    const linkKey = filteredGraph.links.map((l) => `${l.sourceId}>${l.targetId}`).slice().sort().join(',');
    const generationKey = `${nodeKey}::${linkKey}`;
    const topologyChanged = sim.generationKey !== generationKey;
    sim.generationKey = generationKey;

    // Positions survive across generations by node id: editing a note must not
    // shake a settled layout, and a removed node is simply dropped.
    const previousById = new Map();
    sim.nodes.forEach((n) => previousById.set(n.id, n));
    const now = performance.now();
    const newNodes = [];
    filteredGraph.nodes.forEach((n) => {
      const previousNode = previousById.get(n.id);
      if (previousNode) {
        n.x = previousNode.x;
        n.y = previousNode.y;
        n.vx = previousNode.vx;
        n.vy = previousNode.vy;
        n.focus = previousNode.focus || 0;
        n.entryStart = previousNode.entryStart;
      } else {
        n.focus = 0;
        newNodes.push(n);
      }
    });
    sim.nodes = filteredGraph.nodes;
    sim.links = filteredGraph.links;
    // Only genuinely new nodes replay the staggered reveal; keep the whole
    // stagger around a second even when many nodes appear at once.
    const stagger = Math.min(ENTRY_STAGGER_MS, 600 / Math.max(1, newNodes.length));
    newNodes.forEach((n, index) => { n.entryStart = now + index * stagger; });
    // Only a real topology change re-heats the physics; a same-topology refetch
    // keeps the settled layout and just repaints.
    if (topologyChanged) sim.alpha = ALPHA_START;
    sim.dirty = true;
    invalidateRef.current();
  }, [filteredGraph]);

  useEffect(() => {
    const v = volatileRef.current;
    v.hoveredNode = hoveredNode;
    v.selectedNode = selectedNode;
    v.neighborSet = neighborSet;
    v.showLabels = showLabels;
    invalidateRef.current();
  }, [hoveredNode, selectedNode, neighborSet, showLabels]);

  // Only a pause/resume toggle re-heats the layout; hover and selection never do.
  useEffect(() => {
    const v = volatileRef.current;
    v.isPhysicsRunning = isPhysicsRunning;
    if (isPhysicsRunning) simulationRef.current.alpha = ALPHA_START;
    invalidateRef.current();
  }, [isPhysicsRunning]);

  /* ------------------ focus management & keyboard (Escape) ------------------ */

  useEffect(() => {
    if (selectedNode) {
      shouldRestoreFocusRef.current = true;
      inspectorRef.current?.focus({ preventScroll: true });
    } else if (shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      canvasRef.current?.focus({ preventScroll: true });
    }
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode) return undefined;
    // Scoped to the graph shell instead of window: the shell wraps the canvas, the
    // HUD and the inspector, so Escape works wherever focus sits inside the panel,
    // while the note modal (a sibling overlay rendered by App) stays outside and
    // cannot also clear the canvas selection.
    const shell = containerRef.current;
    if (!shell) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') setSelectedNode(null); };
    shell.addEventListener('keydown', handleKeyDown);
    return () => shell.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, setSelectedNode]);

  /* ------------------------------ interaction ------------------------------- */

  const screenToWorld = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    return { x: (clientX - rect.left - cam.x) / cam.zoom, y: (clientY - rect.top - cam.y) / cam.zoom };
  };

  const findNodeAt = (worldX, worldY) => {
    const nodes = simulationRef.current.nodes;
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      const hit = n.radius + 6;
      if (dx * dx + dy * dy <= hit * hit) return n;
    }
    return null;
  };

  const handleMouseDown = (event) => {
    if (event.button !== 0) return;
    const cam = cameraRef.current;
    const { x: worldX, y: worldY } = screenToWorld(event.clientX, event.clientY);
    const hitNode = findNodeAt(worldX, worldY);
    if (hitNode) {
      cam.draggedNode = hitNode;
      setSelectedNode(hitNode);
      simulationRef.current.alpha = ALPHA_START; // dragging perturbs the layout
    } else {
      cam.isDragging = true;
      cam.dragStartX = event.clientX - cam.x;
      cam.dragStartY = event.clientY - cam.y;
    }
    invalidateRef.current();
  };

  const handleMouseMove = (event) => {
    const cam = cameraRef.current;
    const { x: worldX, y: worldY } = screenToWorld(event.clientX, event.clientY);
    if (cam.isDragging) {
      cam.x = event.clientX - cam.dragStartX;
      cam.y = event.clientY - cam.dragStartY;
      invalidateRef.current();
      return;
    }
    if (cam.draggedNode) {
      cam.draggedNode.x = worldX;
      cam.draggedNode.y = worldY;
      cam.draggedNode.vx = 0;
      cam.draggedNode.vy = 0;
      invalidateRef.current();
      return;
    }
    const hitNode = findNodeAt(worldX, worldY);
    if (volatileRef.current.hoveredNode !== hitNode) setHoveredNode(hitNode);
    if (hitNode) setTooltipPos({ x: event.clientX, y: event.clientY, visible: true });
    else setTooltipPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  };

  const handleMouseUp = () => {
    const cam = cameraRef.current;
    cam.isDragging = false;
    cam.draggedNode = null;
  };

  /* ---------------------- node -> callback payload bridge -------------------- */

  const buildNodePayload = (node) => ({
    id: node.originalId,
    title: node.title,
    category: node.category,
    subcategory: node.subcategory,
    theme: node.theme,
    type: node.type,
    tags: node.tags,
    ...(node.type === 'bookmark'
      ? { url: node.url, favicon: node.favicon }
      : { content: node.content, created_at: node.created_at, updated_at: node.updated_at })
  });

  const handleOpenNote = (node) => { if (onOpenNoteDetail) onOpenNoteDetail(buildNodePayload(node)); };

  const handleViewRelated = (node) => {
    const payload = buildNodePayload(node);
    if (node.type === 'bookmark') {
      if (onViewRelatedBookmark) onViewRelatedBookmark(payload);
    } else if (onViewRelatedNote) onViewRelatedNote(payload);
  };

  const handleWikiLinkClick = (title) => {
    const clean = String(title).trim().toLowerCase();
    if (!clean) return;
    const targetNote = notes.find((n) => n.title.toLowerCase() === clean)
      || notes.find((n) => n.title.toLowerCase().includes(clean));
    if (!targetNote) return;
    const graphNode = simulationRef.current.nodes.find((n) => n.id === `nt_${targetNote.id}`);
    if (graphNode) setSelectedNode(graphNode);
    else if (onOpenNoteDetail) onOpenNoteDetail(targetNote);
  };

  const graphSummary = `${counts.nodes} nodos, ${counts.links} enlaces, ${counts.categories} categorías, ${counts.manual} vínculos manuales`;

  return (
    <div
      ref={containerRef}
      className={`graph-shell${selectedNode ? ' has-inspector' : ''}`}
      tabIndex={-1}
    >
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        role="img"
        tabIndex={0}
        aria-label={`Grafo de conocimiento interactivo. ${graphSummary}.`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Live summary so the bitmap is not opaque to screen readers. */}
      <p className="graph-sr-only" role="status" aria-live="polite">
        {selectedNode ? `${graphSummary}. Nodo seleccionado: ${selectedNode.title}.` : `${graphSummary}.`}
      </p>

      <div className="graph-hud">
        <div className="graph-bar">
          <div className="graph-search">
            <Search className="graph-icon" aria-hidden="true" />
            <input
              type="text"
              aria-label="Buscar nodo en el grafo"
              placeholder="Buscar nodo en el grafo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <label className="graph-field">
            <span className="graph-sr-only">Filtrar por categoría</span>
            <select aria-label="Filtrar por categoría" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <span className="graph-sep" aria-hidden="true" />
          <div className="graph-controls">
            <button type="button" className="graph-btn graph-btn-icon" onClick={() => controlsRef.current.zoomBy(1.25)} aria-label="Acercar">
              <ZoomIn className="graph-icon" aria-hidden="true" />
            </button>
            <button type="button" className="graph-btn graph-btn-icon" onClick={() => controlsRef.current.zoomBy(0.8)} aria-label="Alejar">
              <ZoomOut className="graph-icon" aria-hidden="true" />
            </button>
            <button type="button" className="graph-btn graph-btn-icon" onClick={() => controlsRef.current.resetCamera()} aria-label="Centrar y reajustar vista">
              <RotateCcw className="graph-icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`graph-btn ${isPhysicsRunning ? 'graph-btn-on' : ''}`}
              onClick={() => setIsPhysicsRunning((prev) => !prev)}
              aria-pressed={isPhysicsRunning}
            >
              {isPhysicsRunning ? <Pause className="graph-icon" aria-hidden="true" /> : <Play className="graph-icon" aria-hidden="true" />}
              <span>{isPhysicsRunning ? 'Física activa' : 'Pausada'}</span>
            </button>
            <button
              type="button"
              className={`graph-btn ${showLabels ? 'graph-btn-on' : ''}`}
              onClick={() => setShowLabels((prev) => !prev)}
              aria-pressed={showLabels}
            >
              Etiquetas
            </button>
          </div>
          <dl className="graph-counters">
            <div><dt>Nodos</dt><dd>{counts.nodes}</dd></div>
            <div><dt>Enlaces</dt><dd>{counts.links}</dd></div>
            <div><dt>Categorías</dt><dd>{counts.categories}</dd></div>
            <div><dt>Manuales</dt><dd>{counts.manual}</dd></div>
          </dl>
        </div>

        <div className="graph-legend">
          <span className="graph-legend-item">
            <span className="graph-swatch graph-swatch-bookmark" aria-hidden="true" />
            Marcador
          </span>
          <span className="graph-legend-item">
            <span className="graph-swatch graph-swatch-note" aria-hidden="true" />
            Nota
          </span>
          <span className="graph-legend-item">
            <span className="graph-swatch graph-swatch-link" aria-hidden="true" />
            Vínculo manual
          </span>
        </div>
      </div>

      <p className="graph-hint">scroll zoom · arrastrar para mover · clic para inspeccionar</p>

      {tooltipPos.visible && hoveredNode && (
        <div className="graph-tooltip" style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}>
          <div className="graph-tooltip-head">
            {hoveredNode.type === 'bookmark' ? (
              <span className="graph-tooltip-type is-bookmark"><Bookmark className="graph-icon" aria-hidden="true" />Marcador</span>
            ) : (
              <span className="graph-tooltip-type is-note"><FileText className="graph-icon" aria-hidden="true" />Nota</span>
            )}
            <span aria-hidden="true">•</span>
            <span className="graph-tooltip-category">{hoveredNode.category}</span>
          </div>
          <div className="graph-tooltip-title">{hoveredNode.title}</div>
          {hoveredNode.theme && <div className="graph-tooltip-theme">Tema: {hoveredNode.theme}</div>}
          <div className="graph-tooltip-foot">
            <span>Conexiones: {hoveredNode.degree}</span>
            <span className="is-accent">Clic para inspeccionar</span>
          </div>
        </div>
      )}

      {selectedNode && (
        <GraphInspector
          node={selectedNode}
          relations={selectedRelations}
          averageAffinity={averageAffinity}
          panelRef={inspectorRef}
          onClose={() => setSelectedNode(null)}
          onSelectRelated={setSelectedNode}
          onOpenNote={handleOpenNote}
          onViewRelated={handleViewRelated}
          onWikiLinkClick={handleWikiLinkClick}
        />
      )}
    </div>
  );
}
