import { createRequire } from "node:module";
import fs from "node:fs";
import { basename, dirname, join } from "node:path";

const nodeRequire = createRequire(import.meta.url);
const pdfkitModule = nodeRequire("pdfkit");
const PDFDocument = pdfkitModule.default ?? pdfkitModule;
const pdfkitDataDirectories = [
  join(dirname(nodeRequire.resolve("pdfkit")), "data"),
  join(process.cwd(), "node_modules", "pdfkit", "js", "data"),
  process.env.INIT_CWD ? join(process.env.INIT_CWD, "node_modules", "pdfkit", "js", "data") : null,
].filter((directory): directory is string => Boolean(directory));

let pdfkitFontFallbackInstalled = false;

function resolvePdfkitDataFile(pathInput: string) {
  const fileName = basename(pathInput);
  if (!fileName.endsWith(".afm")) {
    return null;
  }

  for (const directory of pdfkitDataDirectories) {
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

export function createPdfDocument(options: ConstructorParameters<typeof PDFDocument>[0] = {}) {
  installPdfkitFontFallback();
  return new PDFDocument(options);
}
