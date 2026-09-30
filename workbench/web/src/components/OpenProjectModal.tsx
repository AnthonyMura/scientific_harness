// Open-project modal (issue 47): one flow on every platform. A path input with
// folder autocomplete — the last complete directory part is listed, folders at
// full opacity (the only openable targets), files dimmed as context. Picking a
// folder appends it plus "/" so the next level lists immediately.
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { FsEntry } from "../types";
import { FileIcon, FolderIcon } from "../icons";

interface Props {
  onClose: () => void;
  /** Opens the project at `path`; must throw on failure (shown inline here). */
  onOpenProject: (path: string) => Promise<void>;
}

const DEBOUNCE_MS = 120;

/** Session cache of directory listings so re-navigating back is instant. */
const listCache = new Map<string, FsEntry[]>();

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Split a typed path into the last complete directory part (with trailing
 *  separator) and the fragment being typed. Handles / and \ alike. */
function splitPath(p: string): { dir: string; frag: string; sep: string } {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  if (i === -1) return { dir: "", frag: p, sep: "/" };
  return { dir: p.slice(0, i + 1), frag: p.slice(i + 1), sep: p[i] };
}

export default function OpenProjectModal({ onClose, onOpenProject }: Props) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // List the last complete directory part of the typed path (debounced).
  useEffect(() => {
    const { dir } = splitPath(path);
    const key = dir.replace(/[/\\]+$/, ""); // "" → home directory
    let cancelled = false;
    const cached = listCache.get(key);
    if (cached) {
      setEntries(cached);
      return;
    }
    const t = window.setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const res = await api.fsList(key);
        if (cancelled || seq !== seqRef.current) return;
        listCache.set(key, res.entries);
        setEntries(res.entries);
      } catch {
        // Not a directory yet / backend unreachable: no suggestions — the
        // user can still submit the typed path and get a real error.
        if (!cancelled && seq === seqRef.current) setEntries(null);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [path]);

  // Suggested rows: prefix-filter by the typed fragment; when nothing matches,
  // fall back to the full listing so a typo never dead-ends the browse.
  const { frag } = splitPath(path);
  let shown: FsEntry[] | null = entries;
  if (entries && frag) {
    const f = frag.toLowerCase();
    const matches = entries.filter((e) => e.name.toLowerCase().startsWith(f));
    shown = matches.length ? matches : entries;
  }

  const accept = (e: FsEntry) => {
    const { dir, sep } = splitPath(path);
    setPath(dir + e.name + (e.is_dir ? sep : ""));
    setActive(-1);
    setError(null);
  };

  const submit = async () => {
    const p = path.trim();
    if (!p || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onOpenProject(p); // success closes the modal (App clears it)
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!shown?.length) return;
      e.preventDefault();
      setActive((a) => {
        const n = shown.length;
        const next =
          e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n;
        listRef.current
          ?.querySelectorAll<HTMLElement>(".path-suggest-row")[next]
          ?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && shown?.[active]) accept(shown[active]);
      else void submit();
    } else if (e.key === "Escape" && !busy) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal open" onClick={(e) => e.stopPropagation()}>
        <div className="pane-header"><span>Open project</span></div>
        <div className="modal-body">
          <div className="path-suggest">
            <input
              autoFocus
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setActive(-1);
                setError(null);
              }}
              onKeyDown={onKeyDown}
              placeholder="/home/nk/code/my-manuscript"
              spellCheck={false}
            />
            {shown && shown.length > 0 && (
              <div className="path-suggest-list" ref={listRef} role="listbox">
                {shown.map((e, i) => {
                  const matched = frag && e.name.toLowerCase().startsWith(frag.toLowerCase());
                  return (
                    <div
                      key={e.name}
                      role="option"
                      aria-selected={i === active}
                      className={"path-suggest-row" + (e.is_dir ? "" : " file") + (i === active ? " active" : "")}
                      title={splitPath(path).dir + e.name}
                      onMouseDown={(ev) => ev.preventDefault()} // keep input focus
                      onClick={() => accept(e)}
                    >
                      {e.is_dir ? <FolderIcon size={13} /> : <FileIcon size={13} />}
                      <span className="name">
                        {matched ? (
                          <>
                            <b>{e.name.slice(0, frag.length)}</b>
                            {e.name.slice(frag.length)}
                          </>
                        ) : (
                          e.name
                        )}
                        {e.is_dir ? "/" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="muted">
            Absolute path to the project folder on this machine. Folders are
            full opacity — only folders can be opened; files are shown dimmed.
            ↑↓ pick, Enter opens. Recent projects are in the top bar.
          </div>
          {error && <div className="fill-warn">{error}</div>}
          <div className="card-actions">
            <button onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary" disabled={!path.trim() || busy} onClick={() => void submit()}>
              {busy ? "Opening…" : "Open"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
