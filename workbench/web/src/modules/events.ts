// In-app event bus for cross-module notifications (issue 42).
//
// The editor's save chain writes a file to disk via the sidecar; anything
// that keeps a view of on-disk state (the Git module's status poll) subscribes
// here instead of App.tsx threading another tick counter through every pane.

type Listener = (path: string) => void;

const listeners = new Set<Listener>();

/** Announce that `path` has just been written to disk by the app. */
export function emitFileWritten(path: string): void {
  for (const l of [...listeners]) l(path);
}

/** Subscribe to file-written events; returns an unsubscribe function. */
export function onFileWritten(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
