import React from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  MarkerType,
  useEdgesState,
  useNodesState,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { Badge, Box, HStack, Text } from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { getDashboardUi } from "../../../dashboard/uiTokens";

type RawAny = any;

function makeId(v: any, fallback: string) {
  if (!v) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v.cnic) return String(v.cnic);
  if (v.id) return String(v.id);
  return fallback;
}

function labelFor(v: any) {
  return v?.name || v?.fullName || v?.cnic || v?.id || "Person";
}

function extractTree(candidate: RawAny): { root: any; relations: Array<{ from: any; to: any; type: string }> } | null {
  const data = candidate?.tree || candidate?.familyTree || candidate?.data || candidate;
  if (!data) return null;

  // If already hierarchical with children
  const root = data.root || data;
  const relations: Array<{ from: any; to: any; type: string }> = [];

  const visited = new Set<any>();
  const walk = (node: any) => {
    if (!node || visited.has(node)) return;
    visited.add(node);

    const childrenKeys = ["children", "family", "nodes", "members", "descendants"];
    for (const k of childrenKeys) {
      const kids = node[k];
      if (Array.isArray(kids)) {
        for (const c of kids) {
          relations.push({ from: node, to: c, type: "child" });
          walk(c);
        }
      }
    }

    const objLinks: Array<[string, string]> = [
      ["father", "father"],
      ["mother", "mother"],
      ["spouse", "spouse"],
      ["husband", "spouse"],
      ["wife", "spouse"],
    ];
    for (const [key, type] of objLinks) {
      const v = node[key];
      if (v && typeof v === "object") {
        relations.push({ from: node, to: v, type });
        walk(v);
      }
    }

    const arrLinks: Array<[string, string]> = [
      ["siblings", "sibling"],
      ["brothers", "sibling"],
      ["sisters", "sibling"],
    ];
    for (const [key, type] of arrLinks) {
      const v = node[key];
      if (Array.isArray(v)) {
        for (const s of v) {
          relations.push({ from: node, to: s, type });
          walk(s);
        }
      }
    }
  };

  // ensure root has something meaningful
  if (typeof root !== "object") return null;
  walk(root);
  return { root, relations };
}

function buildGraph(input: any) {
  // Find first usable tree from any OK API
  const ok = (input?.results || []).find((r: any) => r?.ok && r?.data);
  const tree = extractTree(ok?.data);
  if (!tree) {
    return { nodes: [], edges: [] };
  }

  const nodeMap = new Map<string, any>();
  const edges: Edge[] = [];
  const pushNode = (obj: any) => {
    const id = makeId(obj?.cnic || obj?.id || obj?.mobile || obj?.regNo, `node_${Math.random().toString(16).slice(2)}`);
    if (!nodeMap.has(id)) nodeMap.set(id, obj);
    return id;
  };

  const rootId = pushNode(tree.root);
  for (const rel of tree.relations) {
    const from = pushNode(rel.from);
    const to = pushNode(rel.to);
    edges.push({
      id: `${from}-${to}-${rel.type}`,
      source: from,
      target: to,
      animated: rel.type === "spouse",
      markerEnd: { type: MarkerType.ArrowClosed },
      label: rel.type === "child" ? "" : rel.type,
      style: { opacity: 0.85 },
    });
  }

  // layout with dagre
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 30, ranksep: 50, marginx: 20, marginy: 20 });

  const nodes: Node[] = Array.from(nodeMap.entries()).map(([id, obj]) => ({
    id,
    data: { label: labelFor(obj), raw: obj },
    position: { x: 0, y: 0 },
    type: "default",
    style: {
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.06)",
      color: "white",
      padding: 10,
      minWidth: 160,
    },
  }));

  nodes.forEach((n) => g.setNode(n.id, { width: 180, height: 52 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  nodes.forEach((n) => {
    const p = g.node(n.id);
    n.position = { x: p.x - 90, y: p.y - 26 };
  });

  return { nodes, edges, rootId };
}

function FamilyTreeGraphInner({ payload }: { payload: any }) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const built = React.useMemo(() => buildGraph(payload), [payload]);
  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges);

  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setNodes(
      built.nodes.map((node) => ({
        ...node,
        style: {
          ...node.style,
          border: `1px solid ${ui.surface.borderStrong}`,
          background: ui.surface.card,
          color: ui.text.primary,
          boxShadow: muiTheme.palette.mode === "dark" ? "0 12px 28px rgba(0,0,0,0.22)" : "0 12px 28px rgba(15,23,42,0.08)",
        },
      })),
    );
    setEdges(built.edges);
    setCollapsed(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, ui.surface.borderStrong, ui.surface.card, ui.text.primary, muiTheme.palette.mode]);

  const adjacency = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of edges) {
      // Collapse works only on "child" edges (we encode by empty label and non-animated)
      // Safer: treat all edges as expandable, but only hide outgoing edges/nodes.
      const arr = map.get(e.source) || [];
      arr.push(e.target);
      map.set(e.source, arr);
    }
    return map;
  }, [edges]);

  const computeHidden = React.useCallback(
    (root: string, nowCollapsed: Set<string>) => {
      // Nodes hidden if they are descendants of any collapsed node.
      const hidden = new Set<string>();
      for (const c of nowCollapsed) {
        const stack = [...(adjacency.get(c) || [])];
        while (stack.length) {
          const id = stack.pop()!;
          if (hidden.has(id)) continue;
          hidden.add(id);
          (adjacency.get(id) || []).forEach((t) => stack.push(t));
        }
      }
      // Never hide root
      hidden.delete(root);
      return hidden;
    },
    [adjacency]
  );

  const rootId = built.rootId || nodes[0]?.id;
  const hiddenSet = React.useMemo(() => computeHidden(rootId, collapsed), [collapsed, computeHidden, rootId]);

  const displayNodes = React.useMemo(() => nodes.map((n) => ({ ...n, hidden: hiddenSet.has(n.id) })), [nodes, hiddenSet]);
  const displayEdges = React.useMemo(
    () => edges.map((e) => ({ ...e, hidden: hiddenSet.has(e.source) || hiddenSet.has(e.target) })),
    [edges, hiddenSet]
  );

  if (!displayNodes.length) {
    return (
      <Box py={12} textAlign="center">
        <Text fontWeight="800" fontSize="lg">No family tree data found</Text>
        <Text opacity={0.75} mt={2}>Configure a Family Tree API under Admin and assign it to Mix Family Tree.</Text>
      </Box>
    );
  }

  return (
    <Box h={{ base: "70vh", md: "72vh" }} borderRadius="2xl" overflow="hidden" border={`1px solid ${ui.surface.borderStrong}`}>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        onNodeClick={(_, n) => {
          const next = new Set(collapsed);
          if (next.has(n.id)) next.delete(n.id);
          else next.add(n.id);
          setCollapsed(next);
        }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>

      <Box position="absolute" top={3} left={3} pointerEvents="none">
        <HStack spacing={2}>
          <Badge colorScheme="purple" borderRadius="999px" px={3} py={1}>
            Click a node to collapse/expand
          </Badge>
          <Badge colorScheme="blue" borderRadius="999px" px={3} py={1}>
            Nodes: {nodes.length}
          </Badge>
        </HStack>
      </Box>
    </Box>
  );
}

export default function FamilyTreeGraph({ payload }: { payload: any }) {
  return (
    <ReactFlowProvider>
      <FamilyTreeGraphInner payload={payload} />
    </ReactFlowProvider>
  );
}
