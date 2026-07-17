param(
  [Parameter(Mandatory = $true)]
  [string]$DestinationPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$destinationFull = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $DestinationPath))
$destinationDir = Split-Path -Parent $destinationFull

if (-not (Test-Path -LiteralPath $destinationDir)) {
  New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
}

$excludePaths = @(
  '.git',
  'web/node_modules',
  'web/.next',
  'web/out',
  'web/coverage',
  'web/.env',
  'web/.env.local',
  'web/.env.*.local',
  'web/mcp.json',
  'fixtures/private',
  'dist',
  'tmp-export',
  '*.log',
  '*.tmp',
  '*.temp'
)

function Test-ExcludedPath {
  param([string]$RelativePath)

  # Keep matching stable across Windows and Unix path separators.
  $normalizedPath = $RelativePath.Replace('\', '/')

  foreach ($pattern in $excludePaths) {
    if ($normalizedPath -like $pattern) {
      return $true
    }
  }

  return $false
}

function Get-RelativePath {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$ChildPath
  )

  $baseFull = [System.IO.Path]::GetFullPath($BasePath)
  $childFull = [System.IO.Path]::GetFullPath($ChildPath)
  $baseSegments = $baseFull -split '[\\/]'
  $childSegments = $childFull -split '[\\/]'

  $commonCount = 0
  $maxCommon = [Math]::Min($baseSegments.Length, $childSegments.Length)
  while ($commonCount -lt $maxCommon -and $baseSegments[$commonCount] -eq $childSegments[$commonCount]) {
    $commonCount += 1
  }

  $upSegments = @()
  for ($i = $commonCount; $i -lt $baseSegments.Length; $i += 1) {
    if ($baseSegments[$i] -ne '') {
      $upSegments += '..'
    }
  }

  $downSegments = @()
  for ($i = $commonCount; $i -lt $childSegments.Length; $i += 1) {
    if ($childSegments[$i] -ne '') {
      $downSegments += $childSegments[$i]
    }
  }

  if ($upSegments.Count -eq 0 -and $downSegments.Count -eq 0) {
    return '.'
  }

  $parts = @($upSegments + $downSegments)
  return ($parts -join [System.IO.Path]::DirectorySeparatorChar)
}

function Copy-Tree {
  param(
    [string]$SourcePath,
    [string]$DestinationPath
  )

  $relativePath = Get-RelativePath -BasePath $repoRoot -ChildPath $SourcePath
  if (Test-ExcludedPath -RelativePath $relativePath) {
    return
  }

  $item = Get-Item -LiteralPath $SourcePath
  if ($item.PSIsContainer) {
    New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
    foreach ($child in Get-ChildItem -LiteralPath $SourcePath -Force) {
      Copy-Tree -SourcePath $child.FullName -DestinationPath (Join-Path $DestinationPath $child.Name)
    }
    return
  }

  Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
}

$items = Get-ChildItem -LiteralPath $repoRoot -Force | Where-Object { $_.Name -ne '.git' }
$archiveRoot = Join-Path $repoRoot 'tmp-export'
if (Test-Path -LiteralPath $archiveRoot) {
  Remove-Item -LiteralPath $archiveRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null

foreach ($item in $items) {
  $targetPath = Join-Path $archiveRoot $item.Name
  Copy-Tree -SourcePath $item.FullName -DestinationPath $targetPath
}

Compress-Archive -Path (Join-Path $archiveRoot '*') -DestinationPath $destinationFull -Force
Remove-Item -LiteralPath $archiveRoot -Recurse -Force

Write-Host "Created safe export at $destinationFull"
