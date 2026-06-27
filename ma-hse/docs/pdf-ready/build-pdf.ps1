$ErrorActionPreference = "Stop"

function Get-PandocPath {
  $pathCommand = Get-Command pandoc -ErrorAction SilentlyContinue
  if ($pathCommand) { return $pathCommand.Source }

  $candidates = @(
    "C:\Program Files\Pandoc\pandoc.exe",
    "$env:LOCALAPPDATA\Pandoc\pandoc.exe",
    "$env:APPDATA\Pandoc\pandoc.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  $wingetRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path -LiteralPath $wingetRoot) {
    $wingetPandoc = Get-ChildItem -LiteralPath $wingetRoot -Recurse -Filter pandoc.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -like "*JohnMacFarlane.Pandoc*" } |
      Select-Object -First 1 -ExpandProperty FullName
    if ($wingetPandoc) { return $wingetPandoc }
  }

  return $null
}

$pandoc = Get-PandocPath
if (-not $pandoc) {
  Write-Host "Pandoc was not found."
  Write-Host "Install it with:"
  Write-Host "  winget install --id JohnMacFarlane.Pandoc"
  Write-Host "Then run this script again:"
  Write-Host "  .\docs\pdf-ready\build-pdf.ps1"
  exit 1
}

function Get-BrowserPath {
  $pathCommand = Get-Command msedge -ErrorAction SilentlyContinue
  if ($pathCommand) { return $pathCommand.Source }

  $pathCommand = Get-Command chrome -ErrorAction SilentlyContinue
  if ($pathCommand) { return $pathCommand.Source }

  $candidates = @(
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  return $null
}

$browser = Get-BrowserPath
if (-not $browser) {
  Write-Host "Microsoft Edge or Google Chrome was not found."
  Write-Host "Install one browser or add it to PATH, then run this script again."
  exit 1
}

$outputDir = Join-Path $PSScriptRoot "output"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$htmlDir = Join-Path $outputDir "html"
New-Item -ItemType Directory -Force -Path $htmlDir | Out-Null

$files = @(
  "manual-utilizador-pt.pdf-ready.md",
  "user-manual-en.pdf-ready.md",
  "manual-administracao-pt.pdf-ready.md",
  "administration-manual-en.pdf-ready.md"
)

foreach ($file in $files) {
  $sourcePath = Join-Path $PSScriptRoot $file
  $pdfName = $file -replace "\.pdf-ready\.md$", ".pdf"
  $htmlName = $file -replace "\.pdf-ready\.md$", ".html"
  $pdfPath = Join-Path $outputDir $pdfName
  $htmlPath = Join-Path $htmlDir $htmlName

  & $pandoc $sourcePath `
    --from markdown `
    --to html5 `
    --standalone `
    --embed-resources `
    --toc `
    --toc-depth=3 `
    --number-sections `
    --css (Join-Path $PSScriptRoot "ma-hse-pdf.css") `
    -o $htmlPath

  $htmlUri = ([System.Uri]::new((Resolve-Path -LiteralPath $htmlPath).Path)).AbsoluteUri
  & $browser `
    --headless `
    --disable-gpu `
    --no-pdf-header-footer `
    "--print-to-pdf=$pdfPath" `
    $htmlUri

  Write-Host "Generated $pdfPath"
}
