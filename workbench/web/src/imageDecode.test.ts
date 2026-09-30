// Node environment, no DOM. Run: npm test (vitest run).
// Fixtures are hand-built uncompressed little-endian RGB TIFFs (see the
// generator in .scratch/module-workbench/issues/55-image-viewer-module.md):
//   A = 4×3 gradient, pixel(x,y) = (10x, 20y, 255-x-y)
//   B = two 2×1 pages: solid red (220,30,40), then solid blue (40,60,220)
import { describe, expect, it } from "vitest";
import { openTiff } from "./imageDecode";

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const TIFF_A = fromB64(
  "SUkqAAgAAAAJAAABBAABAAAABAAAAAEBBAABAAAAAwAAAAIBAwADAAAAngAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAegAAABUBAwABAAAAAwAAABYBBAABAAAAAwAAABcBBAABAAAAJAAAAAAAAAAAAP8KAP4UAP0eAPwAFP4KFP0UFPweFPsAKP0KKPwUKPseKPoIAAgACAA=",
);
const TIFF_B = fromB64(
  "SUkqAAgAAAAJAAABBAABAAAAAgAAAAEBBAABAAAAAQAAAAIBAwADAAAA+AAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAA7AAAABUBAwABAAAAAwAAABYBBAABAAAAAQAAABcBBAABAAAABgAAAHoAAAAJAAABBAABAAAAAgAAAAEBBAABAAAAAQAAAAIBAwADAAAA+AAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAA8gAAABUBAwABAAAAAwAAABYBBAABAAAAAQAAABcBBAABAAAABgAAAAAAAADcHijcHigoPNwoPNwIAAgACAA=",
);

function px(rgba: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number, number] {
  const i = (y * w + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
}

describe("openTiff", () => {
  it("decodes a single-page uncompressed RGB TIFF to exact pixels", () => {
    const tiff = openTiff(TIFF_A);
    expect(tiff).not.toBeNull();
    expect(tiff!.count).toBe(1);
    expect(tiff!.pageSize(0)).toEqual({ width: 4, height: 3 });
    const page = tiff!.decodePage(0);
    expect(page.width).toBe(4);
    expect(page.height).toBe(3);
    expect(page.rgba.length).toBe(4 * 3 * 4);
    // gradient: pixel(x,y) = (10x, 20y, 255-x-y), alpha filled with 255
    expect(px(page.rgba, 4, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(px(page.rgba, 4, 3, 0)).toEqual([30, 0, 252, 255]);
    expect(px(page.rgba, 4, 1, 1)).toEqual([10, 20, 253, 255]);
    expect(px(page.rgba, 4, 2, 2)).toEqual([20, 40, 251, 255]);
  });

  it("counts pages and decodes each page of a multi-page TIFF", () => {
    const tiff = openTiff(TIFF_B);
    expect(tiff).not.toBeNull();
    expect(tiff!.count).toBe(2);
    expect(tiff!.pageSize(0)).toEqual({ width: 2, height: 1 });
    expect(tiff!.pageSize(1)).toEqual({ width: 2, height: 1 });
    const red = tiff!.decodePage(0);
    expect(px(red.rgba, 2, 0, 0)).toEqual([220, 30, 40, 255]);
    expect(px(red.rgba, 2, 1, 0)).toEqual([220, 30, 40, 255]);
    const blue = tiff!.decodePage(1);
    expect(px(blue.rgba, 2, 0, 0)).toEqual([40, 60, 220, 255]);
    // decoding page 1 must not disturb page 0's IFD state
    const redAgain = tiff!.decodePage(0);
    expect(px(redAgain.rgba, 2, 0, 0)).toEqual([220, 30, 40, 255]);
  });

  it("returns null for non-TIFF garbage", () => {
    expect(openTiff(new Uint8Array(64))).toBeNull(); // zero-filled
    expect(openTiff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull(); // PNG magic + junk
    expect(openTiff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull(); // JPEG magic + junk
  });

  it("reports bad page indices without throwing from pageSize", () => {
    const tiff = openTiff(TIFF_A)!;
    expect(tiff.pageSize(1)).toBeNull();
    expect(() => tiff.decodePage(5)).toThrow(/no TIFF page 5/);
  });

  it("does not alias the caller's buffer", () => {
    const src = new Uint8Array(TIFF_A);
    const tiff = openTiff(src)!;
    src.fill(0); // clobber the original after opening
    const page = tiff.decodePage(0);
    expect(px(page.rgba, 4, 3, 0)).toEqual([30, 0, 252, 255]);
  });
});
