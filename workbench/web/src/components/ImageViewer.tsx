// Image module: reads any project image (PNG, JPG, TIFF, …) in a single pane.
// Native formats render straight from an object URL; TIFFs are decoded
// client-side with utif2 (imageDecode.ts) because browsers cannot render them
// natively and the sidecar has no image library (ticket 10's accepted
// limitation). Multi-page TIFFs get page navigation in the header. Zoom is a
// module setting adjustable from the header; images keep their natural pixel
// size at 100% and the host scrolls in both directions.
import React, { useEffect, useState } from "react";
import { api } from "../api";
import type { AppCtx } from "../modules/ctx";
import { useModuleSettings } from "../modules/settings";
import type { ModuleSettings, SettingControl } from "../modules/settings";
import SettingsMenu from "./SettingsMenu";
import { GearIcon } from "../icons";
import { openTiff } from "../imageDecode";
import type { TiffImage } from "../imageDecode";

export const IMAGE_SETTINGS: SettingControl[] = [
  { kind: "number", key: "zoom", label: "Zoom", min: 25, max: 400, step: 25, unit: "%" },
];
export const IMAGE_DEFAULTS: ModuleSettings = { zoom: 100 };

interface Props {
  ctx: AppCtx;
}

function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

const TIFF_EXT = /\.(tiff?)$/i;

export default function ImageViewer({ ctx }: Props) {
  const [settings, setSetting] = useModuleSettings("image", IMAGE_DEFAULTS);
  const zoom = typeof settings.zoom === "number" ? settings.zoom : 100;
  const imageFile = ctx.imageFile;

  const [status, setStatus] = useState<string | null>(null);
  /** Object URL of what is on screen now (native blob or re-encoded TIFF page). */
  const [src, setSrc] = useState<string | null>(null);
  const [tiff, setTiff] = useState<TiffImage | null>(null);
  const [page, setPage] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);

  // Object-URL lifecycle: when src is replaced (or the pane unmounts), revoke
  // the previous URL so long sessions don't leak blob memory.
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  // Load the file when it changes: native formats become an object URL, TIFFs
  // are parsed into a lazy handle that the decode effect below renders.
  useEffect(() => {
    let cancelled = false;
    setTiff(null);
    setPage(0);
    setNatural(null);
    if (!imageFile) {
      setStatus(null);
      return;
    }
    setStatus("loading…");
    void (async () => {
      const blob = await api.fetchFileBytes(imageFile);
      if (cancelled) return;
      if (!blob) {
        setStatus("could not load — the sidecar refused this file");
        return;
      }
      if (TIFF_EXT.test(baseName(imageFile))) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const t = openTiff(bytes);
        if (cancelled) return;
        if (!t) {
          setStatus("not a readable TIFF");
          return;
        }
        setTiff(t); // the decode effect takes over from here
      } else {
        setSrc(URL.createObjectURL(blob));
        setStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageFile]);

  // Render the selected TIFF page: RGBA → canvas → PNG blob → object URL.
  useEffect(() => {
    if (!tiff) return;
    let cancelled = false;
    setStatus("decoding…");
    try {
      const p = tiff.decodePage(page);
      const canvas = document.createElement("canvas");
      canvas.width = p.width;
      canvas.height = p.height;
      const cx = canvas.getContext("2d");
      if (!cx) throw new Error("no 2d canvas context");
      cx.putImageData(new ImageData(new Uint8ClampedArray(p.rgba), p.width, p.height), 0, 0);
      canvas.toBlob(
        (blob) => {
          if (cancelled) return;
          if (!blob) {
            setStatus("decode failed");
            return;
          }
          setSrc(URL.createObjectURL(blob));
          setNatural({ w: p.width, h: p.height });
          setStatus(null);
        },
        "image/png",
      );
    } catch (e) {
      if (!cancelled) setStatus(e instanceof Error ? e.message : "decode failed");
    }
    return () => {
      cancelled = true;
    };
  }, [tiff, page]);

  const nudgeZoom = (d: number) => setSetting("zoom", Math.min(400, Math.max(25, zoom + d)));

  if (!imageFile) {
    return (
      <div className="image-pane">
        <div className="pane-header">
          <span>Image preview</span>
        </div>
        <div className="pane-empty">No image open — click a PNG, JPG or TIFF in the Explorer.</div>
      </div>
    );
  }

  const showPages = tiff !== null && tiff.count > 1;
  const widthPx = natural ? Math.max(1, Math.round(natural.w * (zoom / 100))) : undefined;

  return (
    <div className="image-pane">
      <div className="pane-header">
        <span title={imageFile}>{baseName(imageFile)}</span>
        {tiff && <span className="badge" title="Decoded client-side with utif2">tiff</span>}
        {showPages && (
          <>
            <button
              type="button"
              className="mini"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              title="Previous TIFF page"
            >
              ‹
            </button>
            <span className="zoom-label" title="TIFF page">
              {page + 1}/{tiff.count}
            </span>
            <button
              type="button"
              className="mini"
              onClick={() => setPage((p) => Math.min(tiff!.count - 1, p + 1))}
              disabled={page === tiff.count - 1}
              title="Next TIFF page"
            >
              ›
            </button>
          </>
        )}
        <span className="head-spacer" />
        <button type="button" className="mini" onClick={() => nudgeZoom(-25)} title="Zoom out">−</button>
        <span className="zoom-label" title="Zoom">{zoom}%</span>
        <button type="button" className="mini" onClick={() => nudgeZoom(25)} title="Zoom in">+</button>
        <button
          type="button"
          className="head-gear"
          title="Image settings"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setGearOpen({ x: r.right, y: r.bottom + 4 });
          }}
        >
          <GearIcon size={14} />
        </button>
      </div>
      {status ? (
        <div className="pane-empty">{status}</div>
      ) : src ? (
        <div className="image-host">
          <div className="image-wrap">
            <img
              className="image-viewer-img"
              src={src}
              alt={baseName(imageFile)}
              style={widthPx ? { width: `${widthPx}px` } : undefined}
              onLoad={(e) => {
                const el = e.currentTarget;
                setNatural({ w: el.naturalWidth, h: el.naturalHeight });
              }}
            />
          </div>
        </div>
      ) : (
        <div className="pane-empty">Loading…</div>
      )}
      {gearOpen && (
        <SettingsMenu
          x={gearOpen.x}
          y={gearOpen.y}
          title="Image settings"
          controls={IMAGE_SETTINGS}
          values={settings}
          onChange={setSetting}
          onClose={() => setGearOpen(null)}
        />
      )}
    </div>
  );
}
