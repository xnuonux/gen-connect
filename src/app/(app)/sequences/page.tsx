"use client";

import { useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const initialNodes: Node[] = [
  {
    id: "send-1",
    type: "default",
    position: { x: 250, y: 100 },
    data: {
      label: (
        <div className="text-left">
          <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-lunari-neutral-400 mb-1">
            send · email
          </div>
          <div className="text-sm text-lunari-cream">
            first touch ... voice-matched
          </div>
        </div>
      ),
    },
    style: {
      background: "var(--lunari-surface)",
      border: "1px solid var(--gen-accent)",
      borderRadius: 8,
      padding: 12,
      width: 240,
      color: "var(--lunari-cream)",
    },
  },
];

const initialEdges: Edge[] = [];

export default function SequencesPage() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-6 border-b border-lunari-surface-elevated">
        <h1 className="text-2xl font-medium tracking-tight">sequences</h1>
        <p className="text-sm text-lunari-neutral-400 mt-1">
          drag, drop, branch, ship. xyflow canvas, gen-orchestrated.
        </p>
      </div>

      <div className="flex-1" style={{ background: "var(--lunari-black)" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--lunari-surface-elevated)" gap={24} />
          <Controls
            style={{
              background: "var(--lunari-surface)",
              border: "1px solid var(--lunari-surface-elevated)",
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
