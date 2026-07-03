interface FsNode {
  name: string;
  type: "directory" | "file";
  path: string;
  children?: FsNode[];
  size?: number;
}

export function renderTree(tree: FsNode, indent = "  "): string {
  const lines: string[] = [];

  const walk = (node: FsNode, depth: number): void => {
    const isDir = node.type === "directory" || node.children !== undefined;
    const pad = indent.repeat(depth);
    lines.push(`${pad}${node.name}${isDir ? "/" : ""}`);
    if (node.children) {
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    }
  };

  // Start from the root's children so the synthetic "/" isn't printed
  // and its contents sit at depth 0.
  for (const child of tree.children ?? []) {
    walk(child, 0);
  }

  return lines.join("\n");
}

export function flattenJSON(obj: any): string {
  const parts: string[] = [];

  function flatten(item: any, prefix = ""): void {
    if (item === null || item === undefined) {
      parts.push(`${prefix}:${item}`);
    } else if (typeof item === "object" && !Array.isArray(item)) {
      for (const key in item) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          const newKey = prefix ? `${prefix}.${key}` : key;
          const val = item[key];
          if (typeof val === "object" && val !== null && !Array.isArray(val)) {
            flatten(val, newKey);
          } else if (val === null) {
            parts.push(`${newKey}:null`);
          } else if (val === undefined) {
            parts.push(`${newKey}:undefined`);
          } else if (typeof val === "string") {
            parts.push(`${newKey}:"${val}"`);
          } else if (Array.isArray(val)) {
            parts.push(`${newKey}:${JSON.stringify(val)}`);
          } else {
            parts.push(`${newKey}:${val}`);
          }
        }
      }
    } else if (Array.isArray(item)) {
      parts.push(`${prefix}:${JSON.stringify(item)}`);
    } else {
      parts.push(`${prefix}:${item}`);
    }
  }

  flatten(obj);
  return parts.join(",");
}