import { useEffect, useMemo, useState } from 'react';
import type { Comparison } from '@gpeek/contracts';

type File = Comparison['files'][number];
interface Folder {
  name: string;
  path: string;
  folders: Map<string, Folder>;
  files: File[];
}
interface TreeNode {
  name: string;
  path: string;
  folders: TreeNode[];
  files: File[];
  count: number;
}
const collator = new Intl.Collator('pt-BR', { numeric: true });
// Maps preserve unusual Git names (including __proto__) without object-key collisions.
function buildTree(files: File[]): TreeNode {
  const root: Folder = { name: '', path: '', folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.newPath.split('/');
    let folder = root;
    for (const name of parts.slice(0, -1)) {
      let child = folder.folders.get(name);
      if (!child) {
        child = {
          name,
          path: folder.path ? `${folder.path}/${name}` : name,
          folders: new Map(),
          files: [],
        };
        folder.folders.set(name, child);
      }
      folder = child;
    }
    folder.files.push(file);
  }
  function compact(folder: Folder, isRoot = false): TreeNode {
    let name = folder.name;
    // Flatten folder chains like app/controllers/admin to save sidebar width.
    while (!isRoot && folder.files.length === 0 && folder.folders.size === 1) {
      folder = folder.folders.values().next().value!;
      name += '/' + folder.name;
    }
    const folders = [...folder.folders.values()]
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((child) => compact(child));
    const sortedFiles = [...folder.files].sort((a, b) =>
      collator.compare(a.newPath, b.newPath),
    );
    return {
      name,
      path: folder.path,
      folders,
      files: sortedFiles,
      count:
        sortedFiles.length +
        folders.reduce((sum, child) => sum + child.count, 0),
    };
  }
  return compact(root, true);
}
function folderPaths(tree: TreeNode): string[] {
  return tree.folders.flatMap((folder) => [
    folder.path,
    ...folderPaths(folder),
  ]);
}
function Icon({ folder, open = false }: { folder: boolean; open?: boolean }) {
  return (
    <svg
      className="tree-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {folder ? (
        open ? (
          <path d="M2.5 7V4.5h5l2 2H17v2M2.5 8.5H18l-2.5 7H2z" />
        ) : (
          <path d="M2.5 15.5v-11h5l2 2H17v9z" />
        )
      ) : (
        <>
          <path d="M5 2.5h6l4 4v11H5z" />
          <path d="M11 2.5v4h4M7.5 10h5M7.5 13h5" />
        </>
      )}
    </svg>
  );
}
const statusLabels: Record<string, string> = {
  A: 'Adicionado',
  D: 'Removido',
  M: 'Modificado',
  R: 'Renomeado',
  T: 'Tipo alterado',
  C: 'Copiado',
};
export function FileTree({
  files,
  selected,
  filter,
  onSelect,
}: {
  files: File[];
  selected: string;
  filter: string;
  onSelect: (id: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    // Searching exposes matching descendants; changing selection exposes its ancestors.
    const selectedPath = files.find((file) => file.id === selected)?.newPath;
    const paths = folderPaths(tree).filter(
      (path) => filter.length > 0 || selectedPath?.startsWith(path + '/'),
    );
    setCollapsed((previous) => {
      if (!paths.some((path) => previous.has(path))) return previous;
      const next = new Set(previous);
      for (const path of paths) next.delete(path);
      return next;
    });
  }, [filter, selected, tree, files]);
  function toggle(path: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  const selectedPath = files.find((file) => file.id === selected)?.newPath;
  function renderContents(node: TreeNode) {
    return (
      <ul className="tree-group">
        {node.folders.map((folder) => {
          const open = !collapsed.has(folder.path);
          const containsSelection =
            selectedPath?.startsWith(folder.path + '/') ?? false;
          return (
            <li key={folder.path} className="folder-node">
              <button
                className={`folder-button${containsSelection ? ' contains-selection' : ''}`}
                aria-label={`Pasta ${folder.path}`}
                aria-expanded={open}
                title={folder.path}
                onClick={() => toggle(folder.path)}
              >
                <span
                  className={`tree-chevron${open ? ' open' : ''}`}
                  aria-hidden="true"
                >
                  ›
                </span>
                <Icon folder open={open} />
                <span className="folder-name">{folder.name}</span>
                <span
                  className="folder-count"
                  aria-label={`${folder.count} arquivos`}
                >
                  {folder.count}
                </span>
              </button>
              {open && renderContents(folder)}
            </li>
          );
        })}
        {node.files.map((file) => {
          const name = file.newPath.slice(file.newPath.lastIndexOf('/') + 1);
          const status = file.status[0] ?? '';
          return (
            <li key={file.id}>
              <button
                className={`file-button${selected === file.id ? ' selected' : ''}`}
                aria-pressed={selected === file.id}
                aria-label={`${file.newPath} — ${statusLabels[status] ?? file.status}`}
                title={
                  file.oldPath !== file.newPath
                    ? `${file.oldPath} → ${file.newPath}`
                    : file.newPath
                }
                onClick={() => onSelect(file.id)}
              >
                <Icon folder={false} />
                <span className="file-name">{name}</span>
                <span
                  className="file-stats"
                  aria-label={`${file.additions ?? 'indisponível'} adições, ${file.deletions ?? 'indisponível'} remoções`}
                >
                  <span className="added">+{file.additions ?? '—'}</span>
                  <span className="deleted">−{file.deletions ?? '—'}</span>
                </span>
                <span
                  className={`badge status-${status.toLowerCase()}`}
                  aria-hidden="true"
                  title={statusLabels[status] ?? file.status}
                >
                  {status}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <>
      <div className="tree-toolbar">
        <span>Árvore de arquivos</span>
        <button
          className="tree-action"
          disabled={tree.folders.length === 0}
          onClick={() => setCollapsed(new Set())}
          title="Expandir todas as pastas"
          aria-label="Expandir todas as pastas"
        >
          Expandir
        </button>
        <button
          className="tree-action"
          disabled={tree.folders.length === 0}
          onClick={() => setCollapsed(new Set(folderPaths(tree)))}
          title="Recolher todas as pastas"
          aria-label="Recolher todas as pastas"
        >
          Recolher
        </button>
      </div>
      <nav className="file-list" aria-label="Árvore de arquivos alterados">
        {renderContents(tree)}
      </nav>
    </>
  );
}
