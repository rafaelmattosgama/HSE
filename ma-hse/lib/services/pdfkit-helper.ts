import { createRequire } from "node:module";
import fs from "node:fs";
import { basename, dirname, join } from "node:path";
import type PDFDocument from "pdfkit";

const nodeRequire = createRequire(import.meta.url);

type PdfDocumentOptions = ConstructorParameters<typeof PDFDocument>[0];
type PdfDocumentConstructor = new (options?: PdfDocumentOptions) => InstanceType<typeof PDFDocument>;

let pdfkitFontFallbackInstalled = false;
let PDFDocumentConstructor: PdfDocumentConstructor | null = null;
let pdfkitDataDirectories: string[] | null = null;

function getPdfkitDataDirectories() {
  if (!pdfkitDataDirectories) {
    pdfkitDataDirectories = [
      join(dirname(nodeRequire.resolve("pdfkit")), "data"),
      join(process.cwd(), "node_modules", "pdfkit", "js", "data"),
      process.env.INIT_CWD ? join(process.env.INIT_CWD, "node_modules", "pdfkit", "js", "data") : null,
    ].filter((directory): directory is string => Boolean(directory));
  }

  return pdfkitDataDirectories;
}

function getPdfDocumentConstructor() {
  if (!PDFDocumentConstructor) {
    const pdfkitModule = nodeRequire("pdfkit") as { default?: PdfDocumentConstructor } | PdfDocumentConstructor;
    PDFDocumentConstructor =
      typeof pdfkitModule === "function" ? pdfkitModule : (pdfkitModule.default as PdfDocumentConstructor);
  }

  return PDFDocumentConstructor;
}

function resolvePdfkitDataFile(pathInput: string) {
  const fileName = basename(pathInput);
  if (!fileName.endsWith(".afm")) {
    return null;
  }

  for (const directory of getPdfkitDataDirectories()) {
    const candidate = join(directory, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function installPdfkitFontFallback() {
  if (pdfkitFontFallbackInstalled) {
    return;
  }

  pdfkitFontFallbackInstalled = true;
  const originalReadFileSync = fs.readFileSync;

  fs.readFileSync = function readFileSyncPatched(
    this: typeof fs,
    path: Parameters<typeof fs.readFileSync>[0],
    options?: Parameters<typeof fs.readFileSync>[1],
  ) {
    if (typeof path === "string" && !fs.existsSync(path)) {
      const fallback = resolvePdfkitDataFile(path);
      if (fallback) {
        return originalReadFileSync.call(this, fallback, options);
      }
    }

    return originalReadFileSync.call(this, path, options);
  } as typeof fs.readFileSync;
}

export function createPdfDocument(options: PdfDocumentOptions = {}) {
  installPdfkitFontFallback();
  return new (getPdfDocumentConstructor())(options);
}
