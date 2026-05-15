import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
} from "d3";
import type { D3DragEvent, SimulationNodeDatum } from "d3";

import type { GraphConcept, GraphTopic, GraphTopicEdge } from "@/types";

type TopicNode = GraphTopic & {
  type: "topic";
  name: string;
  shortLabel: string;
};

type ConceptNode = GraphConcept & {
  type: "concept";
  name: string;
};

type GraphNode = TopicNode | ConceptNode;
type SimNode = GraphNode & SimulationNodeDatum;
type NodeDragEvent = D3DragEvent<SVGGElement, SimNode, SimNode>;
type GraphEdge = {
  source: string | SimNode;
  target: string | SimNode;
  type: "sequence" | "prerequisite" | "has_concept";
};
type ResolvedEdge = GraphEdge & {
  source: SimNode;
  target: SimNode;
};

const PAD = 5;

const STYLES = {
  colors: {
    topic: "hsl(var(--ink-medium))",
    concept: "hsl(var(--ink-soft))",
    sequence: "hsl(var(--ink-medium))",
    prerequisite: "hsl(var(--ink-medium))",
    hasConcept: "hsl(var(--ink-medium))",
    bg: "hsl(var(--background))",
    surface: "hsl(var(--card))",
    inverse: "hsl(var(--background))",
  },
  edges: {
    sequence: { opacity: 0.35, width: 1 },
    prerequisite: { opacity: 0.5, width: 0.5 },
    hasConcept: { opacity: 0.5, width: 0.25 },
    default: { opacity: 0.5, width: 0.5 },
    highlighted: { opacity: 0.75, width: 1 },
  },
  nodes: {
    topic: { radius: 30, fontSize: "12px", strokeWidth: 3 },
    concept: { radius: 7, fontSize: "10px", strokeWidth: 0.5 },
  },
  simulation: {
    distances: { sequence: 200, prerequisite: 200, concept: 50 },
    forces: { topicCharge: -100, conceptCharge: -25 },
  },
} as const;

const transformGraphData = (
  topics: GraphTopic[],
  topicEdges: GraphTopicEdge[],
  concepts: GraphConcept[],
) => {
  const nodes: SimNode[] = topics.map((topic) => ({
    ...topic,
    type: "topic",
    name: topic.title,
    shortLabel: topic.id,
  })) as SimNode[];

  const conceptNodes: SimNode[] = concepts.map((concept) => ({
    ...concept,
    type: "concept",
    name: concept.title,
  })) as SimNode[];

  nodes.push(...conceptNodes);

  const edges: GraphEdge[] = [
    ...topicEdges.map((edge) => ({
      source: edge.source_topic_id,
      target: edge.target_topic_id,
      type: edge.type,
    })),
    ...concepts.map((concept) => ({
      source: concept.topic_id,
      target: concept.id,
      type: "has_concept" as const,
    })),
  ];

  return { nodes, edges };
};

const getNodeRadius = (node: SimNode) =>
  node.type === "topic" ? STYLES.nodes.topic.radius : STYLES.nodes.concept.radius;

const getNodeStroke = (node: SimNode) =>
  node.type === "topic" ? STYLES.colors.topic : STYLES.colors.concept;

const getNodeStrokeWidth = (node: SimNode) =>
  node.type === "topic"
    ? STYLES.nodes.topic.strokeWidth
    : STYLES.nodes.concept.strokeWidth;

const getFontSize = (node: SimNode) =>
  node.type === "topic" ? STYLES.nodes.topic.fontSize : STYLES.nodes.concept.fontSize;

const getParent = (node: SimNode, nodeById: Map<string, SimNode>) =>
  node.type === "concept" ? nodeById.get(node.topic_id) : undefined;

const getLinkStyle = (edge: GraphEdge, highlighted = false) => {
  const stroke =
    edge.type === "sequence"
      ? STYLES.colors.sequence
      : edge.type === "prerequisite"
      ? STYLES.colors.prerequisite
      : STYLES.colors.concept;

  const base =
    edge.type === "sequence"
      ? STYLES.edges.sequence
      : edge.type === "prerequisite"
      ? STYLES.edges.prerequisite
      : edge.type === "has_concept"
      ? STYLES.edges.hasConcept
      : STYLES.edges.default;

  return highlighted ? { stroke, ...STYLES.edges.highlighted } : { stroke, ...base };
};

type GraphCanvasProps = {
  topics: GraphTopic[];
  topicEdges: GraphTopicEdge[];
  concepts: GraphConcept[];
};

export const GraphCanvas = memo(function GraphCanvas({
  topics,
  topicEdges,
  concepts,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  const graphData = useMemo(
    () => transformGraphData(topics, topicEdges, concepts),
    [topics, topicEdges, concepts],
  );

  const setupVisualization = useCallback(
    (svgElement: SVGSVGElement) => {
      const svg = select(svgElement).attr("style", `background:${STYLES.colors.bg}`);
      svg.selectAll("*").remove();

      const layer = svg.append("g");
      let { width, height } = svgElement.getBoundingClientRect();
      let simulation: ReturnType<typeof forceSimulation<SimNode>> | null = null;

      const { nodes, edges } = graphData;
      const nodeById = new Map(nodes.map((node) => [node.id, node]));
      const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));

      const clampNodeX = (x: number, radius: number) => {
        const minX = radius;
        const maxX = width - radius;
        if (minX > maxX) {
          return width / 2;
        }
        return Math.max(minX, Math.min(maxX, x));
      };

      const resizeObserver = new ResizeObserver(([entry]) => {
        ({ width, height } = entry.contentRect);
        svg.attr("width", width).attr("height", height);
        simulation
          ?.force("center", forceCenter(width / 2, height / 2))
          .alpha(0.3)
          .restart();
      });
      resizeObserver.observe(svgElement);

      const resolvedEdges = edges
        .map((edge) => {
          const source = nodeById.get(edge.source as string);
          const target = nodeById.get(edge.target as string);
          if (!source || !target) {
            return null;
          }

          adjacency.get(source.id)?.add(target.id);
          adjacency.get(target.id)?.add(source.id);
          return { ...edge, source, target };
        })
        .filter(Boolean) as ResolvedEdge[];

      if (selectedIdRef.current && !nodeById.has(selectedIdRef.current)) {
        selectedIdRef.current = null;
      }

      const link = layer
        .append("g")
        .attr("class", "links")
        .selectAll<SVGPathElement, ResolvedEdge>("path")
        .data(resolvedEdges)
        .join("path")
        .attr("fill", "none")
        .attr("stroke", (edge: ResolvedEdge) => getLinkStyle(edge).stroke)
        .attr("stroke-opacity", (edge: ResolvedEdge) => getLinkStyle(edge).opacity)
        .attr("stroke-width", (edge: ResolvedEdge) => getLinkStyle(edge).width);

      const node = layer
        .append("g")
        .attr("class", "nodes")
        .selectAll<SVGGElement, SimNode>("g")
        .data(nodes)
        .join("g")
        .attr("data-id", (item) => item.id)
        .style("cursor", "pointer");

      node
        .append("circle")
        .attr("r", getNodeRadius)
        .attr("fill", STYLES.colors.surface)
        .attr("stroke", getNodeStroke)
        .attr("stroke-width", getNodeStrokeWidth);

      const nameLabel = node
        .append("text")
        .attr("class", "name-label")
        .attr("font-size", (item: SimNode) => getFontSize(item))
        .attr("font-family", "'Avenir Next','Avenir',sans-serif")
        .attr("font-weight", (item: SimNode) => (item.type === "topic" ? "500" : "300"))
        .attr("dominant-baseline", "middle")
        .attr("fill", getNodeStroke)
        .text((item: SimNode) => item.name)
        .style("display", "block")
        .style("pointer-events", "none");

      node
        .filter((item: SimNode) => item.type === "topic")
        .append("text")
        .attr("class", "id-tag")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14px")
        .attr("font-family", "'Avenir Next Ultra Light','Avenir Next','Avenir',sans-serif")
        .attr("fill", STYLES.colors.topic)
        .text((item: SimNode) => (item as TopicNode).shortLabel)
        .style("pointer-events", "none");

      simulation = forceSimulation<SimNode>(nodes)
        .force(
          "charge",
          forceManyBody<SimNode>().strength((item: SimNode) =>
            item.type === "topic"
              ? STYLES.simulation.forces.topicCharge
              : STYLES.simulation.forces.conceptCharge,
          ),
        )
        .force("center", forceCenter(width / 2, height / 2))
        .force("collide", forceCollide<SimNode>().radius((item: SimNode) => getNodeRadius(item) + PAD))
        .force(
          "link",
          forceLink<SimNode, ResolvedEdge>(resolvedEdges)
            .id((item: SimNode) => item.id)
            .distance((edge: ResolvedEdge) =>
              edge.type === "sequence"
                ? STYLES.simulation.distances.sequence
                : edge.type === "prerequisite"
                ? STYLES.simulation.distances.prerequisite
                : STYLES.simulation.distances.concept,
            )
            .strength(1),
        )
        .on("tick", () => {
          nodes.forEach((item) => {
            const radius = getNodeRadius(item) + PAD;
            item.x = clampNodeX(item.x ?? 0, radius);
            item.y = Math.max(radius, Math.min(height - radius, item.y ?? 0));
          });

          link.attr("d", (edge: ResolvedEdge) => {
            const source = edge.source;
            const target = edge.target;
            const dx = (target.x ?? 0) - (source.x ?? 0);
            const dy = (target.y ?? 0) - (source.y ?? 0);
            const distance = Math.hypot(dx, dy) || 1;
            const sourceRadius = getNodeRadius(source) + PAD + 3;
            const targetRadius = getNodeRadius(target) + PAD + 3;
            const sx = (source.x ?? 0) + (dx / distance) * sourceRadius;
            const sy = (source.y ?? 0) + (dy / distance) * sourceRadius;
            const tx = (target.x ?? 0) - (dx / distance) * targetRadius;
            const ty = (target.y ?? 0) - (dy / distance) * targetRadius;
            return `M${sx},${sy}L${tx},${ty}`;
          });

          node.attr("transform", (item: SimNode) => `translate(${item.x},${item.y})`);

          nameLabel
            .attr("text-anchor", (item: SimNode) => {
              const parent = getParent(item, nodeById);
              const anchorX = parent?.x ?? width / 2;
              const anchorY = parent?.y ?? height / 2;
              const angle = Math.atan2((item.y ?? 0) - anchorY, (item.x ?? 0) - anchorX);
              return Math.cos(angle) >= 0 ? "start" : "end";
            })
            .attr("x", (item: SimNode) => {
              const radius = getNodeRadius(item) + (item.type === "topic" ? 10 : 7);
              const parent = getParent(item, nodeById);
              const anchorX = parent?.x ?? width / 2;
              const anchorY = parent?.y ?? height / 2;
              const angle = Math.atan2((item.y ?? 0) - anchorY, (item.x ?? 0) - anchorX);
              return Math.cos(angle) >= 0 ? radius : -radius;
            });
        });

      node.call(
        drag<SVGGElement, SimNode>()
          .on("start", (event: NodeDragEvent, item: SimNode) => {
            if (!event.active) {
              simulation?.alphaTarget(0.3).restart();
            }
            item.fx = item.x;
            item.fy = item.y;
          })
          .on("drag", (event: NodeDragEvent, item: SimNode) => {
            const radius = getNodeRadius(item) + PAD;
            item.fx = clampNodeX(event.x, radius);
            item.fy = Math.max(radius, Math.min(height - radius, event.y));
          })
          .on("end", (event: NodeDragEvent, item: SimNode) => {
            if (!event.active) {
              simulation?.alphaTarget(0);
            }
            item.fx = null;
            item.fy = null;
          }),
      );

      const resetHighlight = () => {
        node
          .select<SVGCircleElement>("circle")
          .attr("fill", STYLES.colors.surface)
          .attr("stroke", getNodeStroke)
          .attr("opacity", 1)
          .attr("stroke-width", getNodeStrokeWidth);

        node
          .select<SVGTextElement>("text.name-label")
          .style("display", "block")
          .attr("opacity", 1);

        node
          .select<SVGTextElement>("text.id-tag")
          .attr("fill", getNodeStroke)
          .attr("opacity", 1);

        link
          .attr("stroke", (edge: ResolvedEdge) => getLinkStyle(edge).stroke)
          .attr("stroke-opacity", (edge: ResolvedEdge) => getLinkStyle(edge).opacity)
          .attr("stroke-width", (edge: ResolvedEdge) => getLinkStyle(edge).width);
      };

      const highlight = (nodeId: string | null) => {
        if (!nodeId || !nodeById.has(nodeId)) {
          resetHighlight();
          selectedIdRef.current = null;
          return;
        }

        const activeNode = nodeById.get(nodeId)!;
        const visible = new Set<string>([activeNode.id, ...(adjacency.get(activeNode.id) ?? [])]);

        node
          .select<SVGCircleElement>("circle")
          .attr("fill", STYLES.colors.surface)
          .attr("stroke", getNodeStroke)
          .attr("stroke-width", getNodeStrokeWidth)
          .attr("opacity", (item: SimNode) => (visible.has(item.id) ? 1 : 0.15));

        node
          .select<SVGTextElement>("text.id-tag")
          .attr("fill", getNodeStroke)
          .attr("opacity", (item: SimNode) => (visible.has(item.id) ? 1 : 0.15));

        nameLabel
          .filter((item: SimNode) => visible.has(item.id))
          .style("display", "block")
          .attr("opacity", 1);

        nameLabel
          .filter((item: SimNode) => !visible.has(item.id))
          .style("display", "none");

        node
          .filter((item: SimNode) => item.id === activeNode.id)
          .select<SVGCircleElement>("circle")
          .attr("fill", getNodeStroke(activeNode))
          .attr("stroke", getNodeStroke(activeNode))
          .attr("opacity", 1);

        node
          .filter((item: SimNode) => item.id === activeNode.id && item.type === "topic")
          .select<SVGTextElement>("text.id-tag")
          .attr("fill", STYLES.colors.inverse)
          .attr("opacity", 1);

        link
          .attr("stroke", (edge: ResolvedEdge) => {
            const highlighted =
              edge.source.id === activeNode.id || edge.target.id === activeNode.id;
            return getLinkStyle(edge, highlighted).stroke;
          })
          .attr("stroke-opacity", (edge: ResolvedEdge) => {
            const highlighted =
              edge.source.id === activeNode.id || edge.target.id === activeNode.id;
            return highlighted ? getLinkStyle(edge, highlighted).opacity : 0.1;
          })
          .attr("stroke-width", (edge: ResolvedEdge) => {
            const highlighted =
              edge.source.id === activeNode.id || edge.target.id === activeNode.id;
            return getLinkStyle(edge, highlighted).width;
          });

        selectedIdRef.current = activeNode.id;
      };

      node.on("click", (event: MouseEvent, item: SimNode) => {
        event.stopPropagation();
        highlight(selectedIdRef.current === item.id ? null : item.id);
      });

      svg.on("click", () => highlight(null));

      if (selectedIdRef.current) {
        highlight(selectedIdRef.current);
      }

      return () => {
        resizeObserver.disconnect();
        simulation?.stop();
        svg.selectAll("*").remove();
      };
    },
    [graphData],
  );

  useLayoutEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) {
      return undefined;
    }
    return setupVisualization(svgElement);
  }, [setupVisualization]);

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <svg ref={svgRef} className="h-full w-full" />
    </div>
  );
});
