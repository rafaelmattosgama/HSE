import { createRequire } from "node:module";
import fs from "node:fs";
import { basename, join } from "node:path";

const nodeRequire = createRequire(import.meta.url);
const PDFDocument = nodeRequire("pdfkit");
const pdfkitDataDirectory = join(process.cwd(), "node_modules", "pdfkit", "js", "data");

function resolvePdfkitDataFile(pathInput: string) {
  const fileName = basename(pathInput);
  const candidate = join(pdfkitDataDirectory, fileName);
  return fs.existsSync(candidate) ? candidate : null;
}

export function createPdfDocument(options: ConstructorParameters<typeof PDFDocument>[0] = {}) {
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

  try {
    return new PDFDocument(options);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
}
