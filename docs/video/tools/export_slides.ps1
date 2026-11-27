# Export every slide of docs/프로젝트_발표자료.pptx as a 1920x1080 PNG (read-only open).
# usage: powershell -File export_slides.ps1 -Work E:\wi\healthpick-video-work
param([Parameter(Mandatory = $true)][string]$Work)
# Located by pattern: Windows PowerShell 5 misreads non-ASCII literals in BOM-less scripts.
$deck = Get-ChildItem (Join-Path $PSScriptRoot '..\..') -Filter '*.pptx' | Select-Object -First 1
$deck = @{ Path = $deck.FullName }
$out = Join-Path $Work 'slides'
New-Item -ItemType Directory -Force $out | Out-Null
$pp = New-Object -ComObject PowerPoint.Application
try {
    $p = $pp.Presentations.Open($deck.Path, $true, $false, $false)
    $i = 1
    foreach ($s in $p.Slides) { $s.Export((Join-Path $out ('slide{0:D2}.png' -f $i)), 'PNG', 1920, 1080); $i++ }
    $p.Close()
    "exported $($i - 1) slides to $out"
} finally { $pp.Quit() }
