# PDF-ready manuals

This folder contains the PDF-ready versions of the MA HSE manuals and the helper files to convert them.

## Files

- `manual-utilizador-pt.pdf-ready.md`
- `user-manual-en.pdf-ready.md`
- `manual-administracao-pt.pdf-ready.md`
- `administration-manual-en.pdf-ready.md`
- `ma-hse-pdf.css`
- `prepare-pdf-ready.ps1`
- `build-pdf.ps1`

The `*.pdf-ready.md` files are generated from the manuals in `docs/`.

## Regenerate PDF-ready Markdown

From the project root:

```powershell
.\docs\pdf-ready\prepare-pdf-ready.ps1
```

## Generate PDFs

Install Pandoc first if it is not available on the machine. The script also uses Microsoft Edge or Google Chrome to print the styled HTML to PDF.

```powershell
winget install --id JohnMacFarlane.Pandoc
```

Then run:

```powershell
.\docs\pdf-ready\build-pdf.ps1
```

The PDFs will be created in:

```text
docs/pdf-ready/output/
```

The intermediate HTML files will be created in:

```text
docs/pdf-ready/output/html/
```

## Manual HTML command

Example:

```powershell
pandoc docs\pdf-ready\manual-utilizador-pt.pdf-ready.md `
  --from markdown `
  --to html5 `
  --toc `
  --number-sections `
  --standalone `
  --embed-resources `
  --css docs\pdf-ready\ma-hse-pdf.css `
  -o docs\pdf-ready\output\html\manual-utilizador-pt.html
```

Then open the HTML in a browser and print to PDF, or use Edge headless:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless `
  --disable-gpu `
  --no-pdf-header-footer `
  --print-to-pdf="C:\HSE\ma-hse\docs\pdf-ready\output\manual-utilizador-pt.pdf" `
  "file:///C:/HSE/ma-hse/docs/pdf-ready/output/html/manual-utilizador-pt.html"
```

## Direct Pandoc PDF command

This requires a PDF engine such as LaTeX, wkhtmltopdf or another Pandoc-compatible engine.

```powershell
pandoc docs\pdf-ready\manual-utilizador-pt.pdf-ready.md `
  --from markdown `
  --toc `
  --number-sections `
  --standalone `
  -o docs\pdf-ready\output\manual-utilizador-pt.pdf
```
