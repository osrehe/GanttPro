import { EngineError } from "./errors";
import type { DependencyEdge } from "./types";

/**
 * Busca un ciclo en el grafo de dependencias.
 *
 * Devuelve los ids del ciclo en orden de recorrido, repitiendo el primero al final
 * (`["A", "B", "C", "A"]`), o `null` si el grafo es acíclico. El recorrido es determinista:
 * sigue el orden de aparición de las dependencias.
 */
export function detectCycle(dependencies: readonly DependencyEdge[]): string[] | null {
  const adjacency = buildAdjacency(dependencies);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const onStackIndex = new Map<string, number>();

  const visit = (start: string): string[] | null => {
    // DFS iterativo con pila explícita de iteradores para soportar grafos grandes.
    const iterators: Array<{ node: string; next: number }> = [{ node: start, next: 0 }];
    color.set(start, GRAY);
    stack.push(start);
    onStackIndex.set(start, 0);

    while (iterators.length > 0) {
      const frame = iterators[iterators.length - 1] as { node: string; next: number };
      const successors = adjacency.get(frame.node) ?? [];
      if (frame.next < successors.length) {
        const next = successors[frame.next] as string;
        frame.next++;
        const state = color.get(next) ?? WHITE;
        if (state === GRAY) {
          const from = onStackIndex.get(next) as number;
          return [...stack.slice(from), next];
        }
        if (state === WHITE) {
          color.set(next, GRAY);
          onStackIndex.set(next, stack.length);
          stack.push(next);
          iterators.push({ node: next, next: 0 });
        }
      } else {
        color.set(frame.node, BLACK);
        stack.pop();
        onStackIndex.delete(frame.node);
        iterators.pop();
      }
    }
    return null;
  };

  for (const node of adjacency.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Orden topológico (algoritmo de Kahn) de los nodos indicados respecto a las dependencias.
 * Los nodos sin dependencias conservan su orden relativo de entrada. Las dependencias que
 * referencian nodos ajenos a la lista se ignoran.
 *
 * Lanza `EngineError("CYCLE")` con `details.cycle` (ids) si existe un ciclo.
 */
export function topologicalOrder(
  nodeIds: readonly string[],
  dependencies: readonly DependencyEdge[],
): string[] {
  const nodes = new Set(nodeIds);
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  for (const id of nodeIds) {
    indegree.set(id, 0);
    successors.set(id, []);
  }
  const relevant: DependencyEdge[] = [];
  for (const dep of dependencies) {
    if (!nodes.has(dep.predecessorId) || !nodes.has(dep.successorId)) continue;
    relevant.push(dep);
    (successors.get(dep.predecessorId) as string[]).push(dep.successorId);
    indegree.set(dep.successorId, (indegree.get(dep.successorId) as number) + 1);
  }

  const queue: string[] = [];
  for (const id of nodeIds) if (indegree.get(id) === 0) queue.push(id);

  const order: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++] as string;
    order.push(id);
    for (const succ of successors.get(id) as string[]) {
      const remaining = (indegree.get(succ) as number) - 1;
      indegree.set(succ, remaining);
      if (remaining === 0) queue.push(succ);
    }
  }

  if (order.length !== nodeIds.length) {
    const cycle = detectCycle(relevant) ?? [];
    throw new EngineError("CYCLE", `Las dependencias forman un ciclo: ${cycle.join(" → ")}`, {
      cycle,
    });
  }
  return order;
}

/** Formatea un ciclo para mostrarlo: `"1.2 → 2.1 → 3 → 1.2"`. */
export function formatCycle(
  cycle: readonly string[],
  labelOf: (id: string) => string = (id) => id,
): string {
  return cycle.map(labelOf).join(" → ");
}

function buildAdjacency(dependencies: readonly DependencyEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const dep of dependencies) {
    if (!adjacency.has(dep.predecessorId)) adjacency.set(dep.predecessorId, []);
    if (!adjacency.has(dep.successorId)) adjacency.set(dep.successorId, []);
    (adjacency.get(dep.predecessorId) as string[]).push(dep.successorId);
  }
  return adjacency;
}
