import { render, screen } from "@testing-library/react";
import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { BrandLogo } from "./BrandLogo";

type RgbaImage = {
  height: number;
  pixels: Uint8Array;
  width: number;
};

function paethPredictor(left: number, above: number, upperLeft: number) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodeRgbaPng(png: Buffer): RgbaImage {
  const signature = png.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("Favicon frame is not PNG encoded");

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const imageData: Buffer[] = [];

  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const chunkType = png.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = png.subarray(offset + 8, offset + 8 + length);

    if (chunkType === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (chunkType === "IDAT") {
      imageData.push(chunk);
    } else if (chunkType === "IEND") {
      break;
    }

    offset += length + 12;
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Expected 8-bit RGBA PNG, got bit depth ${bitDepth}, color type ${colorType}`);
  }

  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(imageData));
  const pixels = new Uint8Array(rowLength * height);

  for (let row = 0; row < height; row += 1) {
    const sourceOffset = row * (rowLength + 1);
    const filter = filtered[sourceOffset];
    const targetOffset = row * rowLength;

    for (let column = 0; column < rowLength; column += 1) {
      const raw = filtered[sourceOffset + column + 1];
      const left = column >= bytesPerPixel ? pixels[targetOffset + column - bytesPerPixel] : 0;
      const above = row > 0 ? pixels[targetOffset - rowLength + column] : 0;
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? pixels[targetOffset - rowLength + column - bytesPerPixel]
          : 0;
      let reconstructed = raw;

      if (filter === 1) reconstructed += left;
      else if (filter === 2) reconstructed += above;
      else if (filter === 3) reconstructed += Math.floor((left + above) / 2);
      else if (filter === 4) reconstructed += paethPredictor(left, above, upperLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);

      pixels[targetOffset + column] = reconstructed & 0xff;
    }
  }

  return { height, pixels, width };
}

describe("BrandLogo", () => {
  test("renders the recovered mark decoratively beside accessible real text", () => {
    const { container } = render(<BrandLogo />);
    const image = container.querySelector("img");

    expect(image).toHaveAttribute("alt", "");
    expect(decodeURIComponent(image?.getAttribute("src") ?? "")).toContain(
      "url=/assets/brand/tree-chat-mark.png",
    );
    expect(screen.getByText("智构树语")).toBeVisible();
    expect(screen.getByText("Tree Chat")).toBeVisible();
  });

  test("lets Next serve responsive optimized mark variants at the rendered size", () => {
    const { container } = render(<BrandLogo />);
    const image = container.querySelector("img");

    expect(image).toHaveAttribute("sizes", "112px");
    expect(image?.getAttribute("srcset")).toContain("/_next/image?url=%2Fassets%2Fbrand%2Ftree-chat-mark.png");
  });

  test("names a standalone mark when no adjacent wordmark is rendered", () => {
    render(<BrandLogo markOnly />);

    expect(screen.getByRole("img", { name: "智构树语 Tree Chat" })).toBeVisible();
  });

  test("supports a decorative mark when adjacent text already names the brand", () => {
    const { container } = render(<BrandLogo compact decorative />);

    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  test("ships a full-canvas, high-opacity 16px favicon asset", () => {
    const favicon = readFileSync(resolve(process.cwd(), "app/icon.png"));
    const frame = decodeRgbaPng(favicon);
    const visibleCoordinates: Array<[number, number]> = [];
    let highOpacityPixels = 0;

    for (let index = 3; index < frame.pixels.length; index += 4) {
      const alpha = frame.pixels[index];
      if (alpha >= 128) {
        const pixelIndex = (index - 3) / 4;
        visibleCoordinates.push([pixelIndex % frame.width, Math.floor(pixelIndex / frame.width)]);
      }
      if (alpha >= 220) highOpacityPixels += 1;
    }

    const xs = visibleCoordinates.map(([x]) => x);
    const ys = visibleCoordinates.map(([, y]) => y);
    const visibleWidth = Math.max(...xs) - Math.min(...xs) + 1;
    const visibleHeight = Math.max(...ys) - Math.min(...ys) + 1;

    expect([frame.width, frame.height]).toEqual([16, 16]);
    expect(visibleWidth).toBeGreaterThanOrEqual(13);
    expect(visibleHeight).toBeGreaterThanOrEqual(12);
    expect(highOpacityPixels).toBeGreaterThanOrEqual(56);
  });
});
