import PptxGenJSModule from "pptxgenjs";

import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";

import type { ResolvedPresentation } from "./pptx-write.js";
import type { PptxImageMediaType } from "./resource-resolver.js";

type PptxInstance = Readonly<{
  ChartType: Readonly<{ bar: string; line: string; pie: string }>;
  ShapeType: Readonly<{ rect: string; ellipse: string; line: string }>;
}> & {
  layout: string;
  author: string;
  company: string;
  subject: string;
  title: string;
  theme: Record<string, string>;
  addSlide: () => PptxSlide;
  write: (props: { outputType: "nodebuffer"; compression: boolean }) => Promise<unknown>;
};

type PptxSlide = {
  background: { color: string };
  addText: (text: string, options: Record<string, unknown>) => PptxSlide;
  addImage: (options: Record<string, unknown>) => PptxSlide;
  addTable: (rows: readonly (readonly string[])[], options: Record<string, unknown>) => PptxSlide;
  addChart: (
    type: string,
    data: readonly Record<string, unknown>[],
    options: Record<string, unknown>,
  ) => PptxSlide;
  addShape: (shape: string, options: Record<string, unknown>) => PptxSlide;
};

const PptxGenConstructor = PptxGenJSModule as unknown as { new (): PptxInstance };

export async function generatePptxBytes(
  presentation: ResolvedPresentation,
): Promise<Buffer> {
  const pptx = new PptxGenConstructor();
  pptx.layout = presentation.layout === "wide" ? "LAYOUT_WIDE" : "LAYOUT_4X3";
  pptx.author = "RoboThree";
  pptx.company = "RoboThree";
  pptx.subject = "Generated presentation";
  pptx.title = presentation.title;
  pptx.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
    lang: "en-US",
  };

  for (const specSlide of presentation.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(specSlide.title, {
      x: 0.55,
      y: 0.25,
      w: 12.2,
      h: 0.45,
      fontSize: 24,
      bold: true,
      color: "1F2937",
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });

    for (const element of specSlide.elements) {
      if (element.type === "text") {
        slide.addText(element.text, {
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
          fontSize: element.style.fontSize,
          color: element.style.color,
          bold: element.style.bold,
          italic: element.style.italic,
          align: element.style.align,
          fit: "shrink",
          margin: 0.08,
        });
      } else if (element.type === "image") {
        slide.addImage({
          data: imageDataUri(element.mediaType, element.bytes),
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
          altText: element.altText,
        });
      } else if (element.type === "table") {
        slide.addTable(element.rows.map((row) => [...row]), {
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
          border: { type: "solid", color: "D1D5DB", pt: 0.75 },
          fontFace: "Arial",
          fontSize: 10,
          color: "111827",
          margin: 0.06,
        });
      } else if (element.type === "chart") {
        slide.addChart(chartType(pptx, element.chartType), element.series.map((series) => ({
          name: series.name,
          labels: [...element.labels],
          values: [...series.values],
        })), {
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
          showLegend: element.series.length > 1,
          showTitle: false,
          valAxisLabelColor: "374151",
          catAxisLabelColor: "374151",
        });
      } else {
        slide.addShape(shapeType(pptx, element.shapeType), {
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
          fill: { color: element.fillColor, transparency: element.shapeType === "line" ? 100 : 0 },
          line: { color: element.lineColor, width: 1 },
        });
      }
    }
  }

  const data = await pptx.write({ outputType: "nodebuffer", compression: true });
  if (!Buffer.isBuffer(data)) {
    throw new DocumentCapabilityHandlerError(
      "internal_failure",
      "PPTX generation did not return a Buffer",
      undefined,
      "generation_failed",
    );
  }
  return data;
}

function imageDataUri(mediaType: PptxImageMediaType, bytes: Buffer): string {
  return `data:${mediaType};base64,${bytes.toString("base64")}`;
}

function chartType(pptx: PptxInstance, type: "bar" | "line" | "pie"): string {
  if (type === "bar") return pptx.ChartType.bar;
  if (type === "line") return pptx.ChartType.line;
  return pptx.ChartType.pie;
}

function shapeType(pptx: PptxInstance, type: "rect" | "ellipse" | "line"): string {
  if (type === "rect") return pptx.ShapeType.rect;
  if (type === "ellipse") return pptx.ShapeType.ellipse;
  return pptx.ShapeType.line;
}
