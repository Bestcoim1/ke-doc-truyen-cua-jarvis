"use client";

import * as Dialog from "@radix-ui/react-dialog";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ExternalLink,
  ListTree,
  LoaderCircle,
  PinOff,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { loadStoryHierarchyForGraph } from "@/lib/graph/actions";
import {
  buildGraphFocus,
  buildStoryHierarchyGraph,
  filterGraphData,
  mergeGraphData,
  relationshipGraphLink,
  shouldRenderGraphNodeLabel,
  storyNodeId,
} from "@/lib/graph/transform";
import type {
  GraphData,
  GraphLink,
  GraphNode,
  StoredRelationshipType,
  StoryGraphShell,
  StoryOption,
  StoryRelationship,
} from "@/lib/graph/types";

import { GraphAccessibleList } from "./graph-accessible-list";
import { GraphControls } from "./graph-controls";
import { LinkStoryDialog } from "./link-story-dialog";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center" role="status">
      <LoaderCircle className="animate-spin" />
      <span className="sr-only">Đang tải canvas graph</span>
    </div>
  ),
}) as typeof import("react-force-graph-2d").default;

type CanvasNode = GraphNode & {
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
};

type CanvasLink = Omit<GraphLink, "source" | "target"> & {
  source: GraphNode["id"] | CanvasNode;
  target: GraphNode["id"] | CanvasNode;
};

type ThemeColors = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  binding: string;
  gilt: string;
  accent: string;
};

const FALLBACK_COLORS: ThemeColors = {
  background: "#f2eadc",
  surface: "#fffaf0",
  text: "#241f1a",
  muted: "#7d715f",
  binding: "#29483f",
  gilt: "#b98532",
  accent: "#8f3f31",
};

function colorWithAlpha(color: string, alpha: number): string {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/iu)?.[1];
  if (!hex) return color;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function graphWithoutStory(graph: GraphData, storyId: string): GraphData {
  const nodes = graph.nodes.filter((node) => node.storyId !== storyId);
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    links: graph.links.filter(
      (link) => nodeIds.has(link.source) && nodeIds.has(link.target),
    ),
  };
}

function graphWithoutRelationship(
  graph: GraphData,
  relationshipId: string,
): GraphData {
  return {
    nodes: graph.nodes,
    links: graph.links.filter(
      (link) => link.relationshipId !== relationshipId,
    ),
  };
}

export function StoryGraphView({ initialData }: { initialData: StoryGraphShell }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<
    ForceGraphMethods<GraphNode, GraphLink> | undefined
  >(undefined);
  const hierarchyCacheRef = useRef(new Map<string, GraphData>());
  const draggedAtRef = useRef<{ id: GraphNode["id"]; at: number } | null>(null);

  const [graph, setGraph] = useState(initialData.graph);
  const [relationships, setRelationships] = useState(
    initialData.relationships,
  );
  const [expandedStoryIds, setExpandedStoryIds] = useState(
    () => new Set([initialData.story.id]),
  );
  const [loadingStoryIds, setLoadingStoryIds] = useState(() => new Set<string>());
  const [selectedNodeId, setSelectedNodeId] = useState<GraphNode["id"] | null>(
    storyNodeId(initialData.story.id),
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<GraphNode["id"] | null>(null);
  const [showSections, setShowSections] = useState(true);
  const [showChapters, setShowChapters] = useState(true);
  const [focusMode, setFocusMode] = useState(true);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [themeColors, setThemeColors] = useState(FALLBACK_COLORS);
  const [isWide, setIsWide] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pinnedPositions, setPinnedPositions] = useState<
    Partial<Record<GraphNode["id"], { x: number; y: number }>>
  >({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({
        width: Math.max(1, Math.floor(width)),
        height: Math.max(1, Math.floor(height)),
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const wideQuery = window.matchMedia("(min-width: 1024px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setIsWide(wideQuery.matches);
      setReducedMotion(motionQuery.matches);
    };
    update();
    wideQuery.addEventListener("change", update);
    motionQuery.addEventListener("change", update);
    return () => {
      wideQuery.removeEventListener("change", update);
      motionQuery.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const readColors = () => {
      const element = containerRef.current;
      if (!element) return;
      const styles = getComputedStyle(element);
      setThemeColors({
        background: styles.getPropertyValue("--kd-bg").trim(),
        surface: styles.getPropertyValue("--kd-surface").trim(),
        text: styles.getPropertyValue("--kd-text").trim(),
        muted: styles.getPropertyValue("--kd-text-muted").trim(),
        binding: styles.getPropertyValue("--kd-binding").trim(),
        gilt: styles.getPropertyValue("--kd-gilt").trim(),
        accent: styles.getPropertyValue("--kd-accent").trim(),
      });
    };
    readColors();
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const collapsedGraph = useMemo(() => {
    const nodes = graph.nodes
      .filter(
        (node) =>
          node.type === "story" || expandedStoryIds.has(node.storyId),
      )
      .map((node) =>
        node.type === "story"
          ? { ...node, isExpanded: expandedStoryIds.has(node.storyId) }
          : node,
      );
    const nodeIds = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      links: graph.links.filter(
        (link) => nodeIds.has(link.source) && nodeIds.has(link.target),
      ),
    };
  }, [expandedStoryIds, graph]);

  const visibleGraph = useMemo(
    () =>
      filterGraphData(collapsedGraph, { showSections, showChapters }),
    [collapsedGraph, showChapters, showSections],
  );

  const canvasGraph = useMemo(() => {
    const nodes: CanvasNode[] = visibleGraph.nodes.map((node) => {
      const position = pinnedPositions[node.id];
      return position ? { ...node, fx: position.x, fy: position.y } : { ...node };
    });
    const links: CanvasLink[] = visibleGraph.links.map((link) => ({ ...link }));
    return { nodes, links };
  }, [pinnedPositions, visibleGraph]);

  const storyTitles = useMemo(
    () =>
      Object.fromEntries(
        graph.nodes
          .filter((node) => node.type === "story")
          .map((node) => [node.storyId, node.label]),
      ),
    [graph.nodes],
  );
  const selectedNode = visibleGraph.nodes.find(
    (node) => node.id === selectedNodeId,
  );
  const graphFocus = useMemo(
    () => buildGraphFocus(visibleGraph, focusMode ? selectedNodeId : null),
    [focusMode, selectedNodeId, visibleGraph],
  );
  const hasActiveFocus = focusMode && graphFocus.nodeIds.size > 0;

  function focusNode(node: GraphNode) {
    setSelectedNodeId(node.id);
    const canvasNode = canvasGraph.nodes.find((candidate) => candidate.id === node.id);
    if (canvasNode?.x !== undefined && canvasNode.y !== undefined) {
      graphRef.current?.centerAt(
        canvasNode.x,
        canvasNode.y,
        reducedMotion ? 0 : 500,
      );
      graphRef.current?.zoom(2.6, reducedMotion ? 0 : 500);
    }
  }

  function selectNodeFromList(node: GraphNode) {
    if (isWide) {
      focusNode(node);
      return;
    }
    setMobileListOpen(false);
    window.requestAnimationFrame(() => focusNode(node));
  }

  async function toggleStory(node: GraphNode) {
    if (node.type !== "story" || node.storyId === initialData.story.id) return;
    if (expandedStoryIds.has(node.storyId)) {
      setExpandedStoryIds((current) => {
        const next = new Set(current);
        next.delete(node.storyId);
        return next;
      });
      return;
    }
    if (visibleGraph.nodes.length > 800) {
      toast.warning(
        "Graph đang có hơn 800 node. Hãy thu gọn một tác phẩm trước khi mở rộng thêm.",
      );
      return;
    }
    if (hierarchyCacheRef.current.has(node.storyId)) {
      setExpandedStoryIds((current) => new Set(current).add(node.storyId));
      return;
    }

    setLoadingStoryIds((current) => new Set(current).add(node.storyId));
    const result = await loadStoryHierarchyForGraph(node.storyId);
    setLoadingStoryIds((current) => {
      const next = new Set(current);
      next.delete(node.storyId);
      return next;
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const addition = buildStoryHierarchyGraph(result.hierarchy);
    hierarchyCacheRef.current.set(node.storyId, addition);
    setGraph((current) => mergeGraphData(current, addition));
    setExpandedStoryIds((current) => new Set(current).add(node.storyId));
  }

  function optimisticCreate(
    targetStory: StoryOption,
    relationshipType: StoredRelationshipType,
  ) {
    const previousGraph = graph;
    const previousRelationships = relationships;
    const temporaryId = `optimistic-${Date.now()}`;
    let sourceStoryId = initialData.story.id;
    let targetStoryId = targetStory.id;
    if (
      relationshipType === "related" &&
      sourceStoryId.localeCompare(targetStoryId) > 0
    ) {
      [sourceStoryId, targetStoryId] = [targetStoryId, sourceStoryId];
    }
    const relationship: StoryRelationship = {
      id: temporaryId,
      sourceStoryId,
      targetStoryId,
      relationshipType,
    };
    setRelationships((current) => [...current, relationship]);
    setGraph((current) =>
      mergeGraphData(current, {
        nodes: [
          {
            id: storyNodeId(targetStory.id),
            entityId: targetStory.id,
            label: targetStory.title,
            type: "story",
            storyId: targetStory.id,
            isExpanded: false,
          },
        ],
        links: [relationshipGraphLink(relationship)],
      }),
    );
    return () => {
      setGraph(previousGraph);
      setRelationships(previousRelationships);
    };
  }

  function optimisticUpdate(
    relationship: StoryRelationship,
    relationshipType: StoredRelationshipType,
    reverseDirection: boolean,
  ) {
    const previousGraph = graph;
    const previousRelationships = relationships;
    let sourceStoryId = reverseDirection
      ? relationship.targetStoryId
      : relationship.sourceStoryId;
    let targetStoryId = reverseDirection
      ? relationship.sourceStoryId
      : relationship.targetStoryId;
    if (
      relationshipType === "related" &&
      sourceStoryId.localeCompare(targetStoryId) > 0
    ) {
      [sourceStoryId, targetStoryId] = [targetStoryId, sourceStoryId];
    }
    const updated = {
      ...relationship,
      sourceStoryId,
      targetStoryId,
      relationshipType,
    };
    setRelationships((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setGraph((current) =>
      mergeGraphData(current, {
        nodes: [],
        links: [relationshipGraphLink(updated)],
      }),
    );
    return () => {
      setGraph(previousGraph);
      setRelationships(previousRelationships);
    };
  }

  function optimisticDelete(relationship: StoryRelationship) {
    const previousGraph = graph;
    const previousRelationships = relationships;
    const otherStoryId =
      relationship.sourceStoryId === initialData.story.id
        ? relationship.targetStoryId
        : relationship.sourceStoryId;
    setRelationships((current) =>
      current.filter((item) => item.id !== relationship.id),
    );
    setGraph((current) =>
      graphWithoutStory(
        graphWithoutRelationship(current, relationship.id),
        otherStoryId,
      ),
    );
    setExpandedStoryIds((current) => {
      const next = new Set(current);
      next.delete(otherStoryId);
      return next;
    });
    return () => {
      setGraph(previousGraph);
      setRelationships(previousRelationships);
    };
  }

  const nodeCanvasObject = useCallback(
    (node: CanvasNode, context: CanvasRenderingContext2D, globalScale: number) => {
      if (node.x === undefined || node.y === undefined) return;
      const selected = node.id === selectedNodeId;
      const hovered = node.id === hoveredNodeId;
      const focused = !hasActiveFocus || graphFocus.nodeIds.has(node.id);
      const radius = node.type === "story" ? 8 : node.type === "section" ? 5 : 3;
      const fill =
        node.type === "story"
          ? themeColors.binding
          : node.type === "section"
            ? themeColors.gilt
            : themeColors.accent;

      context.save();
      context.globalAlpha = focused ? 1 : hovered ? 0.42 : 0.14;
      if (node.isPrimaryStory) {
        context.beginPath();
        context.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
        context.fillStyle = `${themeColors.gilt}55`;
        context.fill();
      }
      context.beginPath();
      context.arc(node.x, node.y, radius + (selected ? 2 : 0), 0, Math.PI * 2);
      context.fillStyle = fill;
      context.fill();
      if (selected || hovered) {
        context.lineWidth = 2 / globalScale;
        context.strokeStyle = themeColors.text;
        context.stroke();
      }

      const fontSize = Math.max(3, 12 / globalScale);
      context.font = `${node.type === "story" ? 700 : 600} ${fontSize}px sans-serif`;
      const measuredScreenWidth =
        context.measureText(node.label).width * globalScale;
      const drawLabel = shouldRenderGraphNodeLabel({
        nodeType: node.type,
        measuredScreenWidth,
        globalScale,
        nodeCount: visibleGraph.nodes.length,
        selected,
        hovered,
      });
      if (drawLabel) {
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillStyle = themeColors.text;
        context.fillText(node.label, node.x, node.y + radius + 3);
      }
      context.restore();
    },
    [
      graphFocus.nodeIds,
      hasActiveFocus,
      hoveredNodeId,
      selectedNodeId,
      themeColors,
      visibleGraph.nodes.length,
    ],
  );

  const linkColor = useCallback(
    (link: CanvasLink) => {
      const baseColor =
        link.type === "contains" ? themeColors.muted : themeColors.gilt;
      if (!hasActiveFocus) return baseColor;
      return graphFocus.linkIds.has(link.id)
        ? link.type === "contains"
          ? themeColors.text
          : themeColors.gilt
        : colorWithAlpha(baseColor, 0.12);
    },
    [graphFocus.linkIds, hasActiveFocus, themeColors],
  );

  const linkWidth = useCallback(
    (link: CanvasLink) => {
      if (!hasActiveFocus) return link.type === "contains" ? 0.65 : 2.4;
      if (!graphFocus.linkIds.has(link.id)) {
        return link.type === "contains" ? 0.25 : 0.6;
      }
      return link.type === "contains" ? 1.35 : 3.2;
    },
    [graphFocus.linkIds, hasActiveFocus],
  );

  const nodePointerAreaPaint = useCallback(
    (node: CanvasNode, color: string, context: CanvasRenderingContext2D) => {
      if (node.x === undefined || node.y === undefined) return;
      const radius = node.type === "story" ? 12 : node.type === "section" ? 9 : 7;
      context.fillStyle = color;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fill();
    },
    [],
  );

  function releaseSelectedPosition() {
    if (!selectedNodeId) return;
    setPinnedPositions((current) => {
      const next = { ...current };
      delete next[selectedNodeId];
      return next;
    });
    graphRef.current?.d3ReheatSimulation();
  }

  function resetLayout() {
    setPinnedPositions({});
    graphRef.current?.d3ReheatSimulation();
    graphRef.current?.zoomToFit(reducedMotion ? 0 : 500, 36);
  }

  function searchNode(query: string) {
    if (!query) return;
    const node = visibleGraph.nodes.find((candidate) =>
      candidate.label.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
    );
    if (!node) {
      toast.info("Không tìm thấy node phù hợp.");
      return;
    }
    focusNode(node);
  }

  const list = (
    <GraphAccessibleList
      graph={visibleGraph}
      primaryStoryId={initialData.story.id}
      relationships={relationships}
      storyTitles={storyTitles}
      selectedNodeId={selectedNodeId}
      onSelectNode={selectNodeFromList}
      onToggleStory={toggleStory}
      onOptimisticRelationshipUpdate={optimisticUpdate}
      onOptimisticRelationshipDelete={optimisticDelete}
    />
  );

  return (
    <div
      className={isWide ? "grid h-full grid-cols-[minmax(0,1fr)_22rem]" : "h-full"}
    >
      <section
        className="relative h-full min-h-0 overflow-hidden"
        aria-labelledby="graph-heading"
      >
        <h2 id="graph-heading" className="sr-only">
          Graph của {initialData.story.title}
        </h2>
        <p className="sr-only">
          Graph gồm tác phẩm, section, chương và các quan hệ một hop. Dùng danh
          sách graph để truy cập toàn bộ nội dung bằng bàn phím.
        </p>

        <div ref={containerRef} className="absolute inset-0">
          <ForceGraph2D<GraphNode, GraphLink>
            ref={graphRef}
            // The package's generic GraphData type recursively wraps LinkType,
            // while runtime accepts the standard {nodes, links} shape and then
            // mutates source/target to node objects. The cloned payload above is
            // intentionally the boundary where that mutation is allowed.
            graphData={canvasGraph as never}
            width={size.width}
            height={size.height}
            backgroundColor={themeColors.background}
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={nodePointerAreaPaint}
            nodeLabel={(node: CanvasNode) =>
              node.type === "story" ? node.label : ""
            }
            linkLabel={(link: CanvasLink) => link.label ?? "Chứa"}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkDirectionalArrowLength={(link: CanvasLink) =>
              link.type === "contains" || link.type === "related" ? 0 : 5
            }
            linkDirectionalArrowColor={linkColor}
            cooldownTicks={reducedMotion ? 0 : 140}
            warmupTicks={reducedMotion ? 0 : 20}
            onNodeHover={(node: CanvasNode | null) =>
              setHoveredNodeId(node?.id ?? null)
            }
            onNodeClick={(node: CanvasNode) => {
              const dragged = draggedAtRef.current;
              if (dragged?.id === node.id && Date.now() - dragged.at < 300) return;
              focusNode(node);
            }}
            onBackgroundClick={() => setSelectedNodeId(null)}
            onNodeDragEnd={(node: CanvasNode) => {
              if (node.x === undefined || node.y === undefined) return;
              node.fx = node.x;
              node.fy = node.y;
              setPinnedPositions((current) => ({
                ...current,
                [node.id]: { x: node.x!, y: node.y! },
              }));
              draggedAtRef.current = { id: node.id, at: Date.now() };
            }}
          />
        </div>

        <GraphControls
          showSections={showSections}
          showChapters={showChapters}
          focusMode={focusMode}
          onShowSectionsChange={setShowSections}
          onShowChaptersChange={setShowChapters}
          onFocusModeChange={setFocusMode}
          onZoomIn={() =>
            graphRef.current?.zoom(
              graphRef.current.zoom() * 1.35,
              reducedMotion ? 0 : 250,
            )
          }
          onZoomOut={() =>
            graphRef.current?.zoom(
              graphRef.current.zoom() / 1.35,
              reducedMotion ? 0 : 250,
            )
          }
          onFit={() =>
            graphRef.current?.zoomToFit(reducedMotion ? 0 : 500, 36)
          }
          onResetLayout={resetLayout}
          onSearch={searchNode}
          linkStoryControl={
            <LinkStoryDialog
              currentStory={initialData.story}
              availableStories={initialData.availableStories}
              onOptimisticCreate={optimisticCreate}
            />
          }
        />

        {!isWide ? (
          <div className="absolute right-3 top-3 z-20">
            <Dialog.Root open={mobileListOpen} onOpenChange={setMobileListOpen}>
              <Dialog.Trigger asChild>
                <Button variant="outline" className="min-h-11 rounded-full">
                  <ListTree size={16} />
                  Danh sách
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
                <Dialog.Content
                  className="fixed inset-y-0 right-0 z-50 w-[88%] max-w-sm outline-none"
                  style={{ background: "var(--kd-surface)" }}
                >
                  <Dialog.Title className="sr-only">Danh sách graph</Dialog.Title>
                  <Dialog.Description className="sr-only">
                    Danh sách tác phẩm, quan hệ, section và chương.
                  </Dialog.Description>
                  <Dialog.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Đóng danh sách"
                      className="absolute right-3 top-3 z-10"
                    >
                      <X size={18} />
                    </Button>
                  </Dialog.Close>
                  {list}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        ) : null}

        {visibleGraph.nodes.length > 800 ? (
          <p
            role="status"
            className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-bold"
            style={{
              background: "var(--kd-surface)",
              borderColor: "var(--kd-gilt)",
            }}
          >
            Graph lớn ({visibleGraph.nodes.length} node) — thu gọn bớt trước khi
            mở rộng thêm.
          </p>
        ) : null}

        {selectedNode ? (
          <div
            className="absolute bottom-3 left-3 right-3 z-20 max-h-[42dvh] overflow-y-auto rounded-2xl border p-3 pr-11 shadow-xl sm:left-auto sm:w-96"
            style={{
              background: "color-mix(in srgb, var(--kd-surface) 94%, transparent)",
              borderColor: "var(--kd-border)",
            }}
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Bỏ chọn node"
              className="absolute right-2 top-2"
              onClick={() => setSelectedNodeId(null)}
            >
              <X size={16} />
            </Button>
            <p className="text-xs font-bold uppercase" style={{ color: "var(--kd-gilt)" }}>
              {selectedNode.type === "story"
                ? "Tác phẩm"
                : selectedNode.type === "section"
                  ? "Section"
                  : "Chương"}
            </p>
            <p className="mt-1 break-words font-extrabold">
              {selectedNode.label}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedNode.type === "story" ? (
                <>
                  {selectedNode.storyId !== initialData.story.id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={loadingStoryIds.has(selectedNode.storyId)}
                      onClick={() => toggleStory(selectedNode)}
                    >
                      {loadingStoryIds.has(selectedNode.storyId)
                        ? "Đang tải…"
                        : selectedNode.isExpanded
                          ? "Thu gọn"
                          : "Mở rộng"}
                    </Button>
                  ) : null}
                  <Button asChild size="sm">
                    <Link href={`/read/${selectedNode.storyId}`}>
                      <ExternalLink size={14} />
                      Mở Reader
                    </Link>
                  </Button>
                </>
              ) : selectedNode.type === "chapter" ? (
                <Button asChild size="sm">
                  <Link
                    href={`/read/${selectedNode.storyId}/${selectedNode.entityId}`}
                  >
                    Mở chương
                  </Link>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={releaseSelectedPosition}
              >
                <PinOff size={14} />
                Thả vị trí
              </Button>
            </div>
          </div>
        ) : null}
      </section>
      {isWide ? list : null}
    </div>
  );
}
