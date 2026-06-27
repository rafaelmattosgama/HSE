$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$outputDir = $PSScriptRoot

$manuals = @(
  @{
    Source = "manual-utilizador-pt.md"
    Output = "manual-utilizador-pt.pdf-ready.md"
    Title = "Manual de Utilizador"
    Subtitle = "MA HSE"
    Lang = "pt-PT"
    Date = "25 de junho de 2026"
    AudienceLabel = "Publico"
    DateLabel = "Data"
    Audience = "Utilizadores finais"
    Summary = "Guia funcional para utilizacao dos modulos MA HSE."
  },
  @{
    Source = "user-manual-en.md"
    Output = "user-manual-en.pdf-ready.md"
    Title = "User Manual"
    Subtitle = "MA HSE"
    Lang = "en"
    Date = "June 25, 2026"
    AudienceLabel = "Audience"
    DateLabel = "Date"
    Audience = "End users"
    Summary = "Functional guide for using the MA HSE modules."
  },
  @{
    Source = "manual-administracao-pt.md"
    Output = "manual-administracao-pt.pdf-ready.md"
    Title = "Manual de Administracao"
    Subtitle = "MA HSE"
    Lang = "pt-PT"
    Date = "25 de junho de 2026"
    AudienceLabel = "Publico"
    DateLabel = "Data"
    Audience = "Administradores e equipa tecnica"
    Summary = "Guia de administracao funcional, operacao local e configuracao."
  },
  @{
    Source = "administration-manual-en.md"
    Output = "administration-manual-en.pdf-ready.md"
    Title = "Administration Manual"
    Subtitle = "MA HSE"
    Lang = "en"
    Date = "June 25, 2026"
    AudienceLabel = "Audience"
    DateLabel = "Date"
    Audience = "Administrators and technical team"
    Summary = "Functional administration, local operation and configuration guide."
  }
)

foreach ($manual in $manuals) {
  $sourcePath = Join-Path $root ("docs\" + $manual.Source)
  $outputPath = Join-Path $outputDir $manual.Output

  $lines = Get-Content -LiteralPath $sourcePath
  if ($lines.Count -gt 0 -and $lines[0] -match "^#\s+") {
    $lines = $lines | Select-Object -Skip 1
    if ($lines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($lines[0])) {
      $lines = $lines | Select-Object -Skip 1
    }
  }

  $frontMatter = @(
    "---"
    "title: `"$($manual.Title)`""
    "subtitle: `"$($manual.Subtitle)`""
    "author: `"MA HSE`""
    "date: `"$($manual.Date)`""
    "lang: `"$($manual.Lang)`""
    "toc: true"
    "toc-depth: 3"
    "numbersections: true"
    "geometry: margin=22mm"
    "colorlinks: true"
    "---"
    ""
  )

  $cover = @(
    "<div class=`"cover`">"
    "  <div class=`"cover-brand`">MA HSE</div>"
    "  <h1 class=`"cover-title`">$($manual.Title)</h1>"
    "  <div class=`"cover-subtitle`">$($manual.Subtitle)</div>"
    "  <div class=`"cover-meta`">"
    "    <p><strong>$($manual.AudienceLabel):</strong> $($manual.Audience)</p>"
    "    <p><strong>$($manual.DateLabel):</strong> $($manual.Date)</p>"
    "    <p>$($manual.Summary)</p>"
    "  </div>"
    "</div>"
    ""
    "<div class=`"page-break`"></div>"
    ""
    "# $($manual.Title) - $($manual.Subtitle)"
    ""
  )

  $content = @()
  $content += $frontMatter
  $content += $cover
  $content += $lines

  Set-Content -LiteralPath $outputPath -Value $content -Encoding UTF8
  Write-Host "Generated $outputPath"
}
