[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DestinationPath,

  [Parameter(DontShow = $true)]
  [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-SensitiveArchivePath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $normalizedPath = $RelativePath.Replace('\', '/').TrimStart('/')
  if ($normalizedPath.StartsWith('./', [System.StringComparison]::Ordinal)) {
    $normalizedPath = $normalizedPath.Substring(2)
  }
  $segments = @($normalizedPath -split '/')
  $leafName = $segments[-1]

  if ($segments -contains '.git' -or $segments -contains '.vercel') {
    return $true
  }

  if ($leafName -ne '.env.example' -and ($leafName -eq '.env' -or $leafName -like '.env.*')) {
    return $true
  }

  if ($leafName -in @('mcp.json', '.mcp.json')) {
    return $true
  }

  if ([System.IO.Path]::GetExtension($leafName) -in @('.key', '.pem', '.p12', '.pfx', '.jks')) {
    return $true
  }

  if (
    $normalizedPath.StartsWith('fixtures/private/', [System.StringComparison]::OrdinalIgnoreCase) -and
    $normalizedPath -ne 'fixtures/private/README.md'
  ) {
    return $true
  }

  return $false
}

$repoRoot = [System.IO.Path]::GetFullPath($SourceRoot)
if (-not (Test-Path -LiteralPath $repoRoot -PathType Container)) {
  throw "Source root does not exist: $repoRoot"
}

$gitTopLevel = (& git -C $repoRoot rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $gitTopLevel) {
  throw "Safe export requires a Git working tree: $repoRoot"
}

$gitTopLevel = [System.IO.Path]::GetFullPath(($gitTopLevel | Select-Object -First 1))
if (-not [string]::Equals($repoRoot.TrimEnd('\', '/'), $gitTopLevel.TrimEnd('\', '/'), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Source root must be the Git repository root: $gitTopLevel"
}

if ([System.IO.Path]::IsPathRooted($DestinationPath)) {
  $destinationFull = [System.IO.Path]::GetFullPath($DestinationPath)
} else {
  $destinationFull = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $DestinationPath))
}

if ([System.IO.Path]::GetExtension($destinationFull) -ne '.zip') {
  throw 'Safe export destination must use the .zip extension.'
}

$trackedPaths = @(& git -C $repoRoot -c core.quotepath=false ls-files)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to enumerate tracked files for safe export.'
}

$sensitiveTrackedPaths = @($trackedPaths | Where-Object { Test-SensitiveArchivePath -RelativePath $_ })
if ($sensitiveTrackedPaths.Count -gt 0) {
  $pathList = $sensitiveTrackedPaths -join ', '
  throw "Refusing safe export because Git tracks sensitive paths: $pathList"
}

# `git stash create` makes a temporary tree object without changing the index,
# working tree, or stash refs. This keeps tracked work-in-progress in the export
# while untracked local files (the usual home of secrets) remain excluded.
$treeish = (& git -C $repoRoot stash create)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to snapshot tracked working-tree changes for safe export.'
}
if (-not $treeish) {
  $treeish = 'HEAD'
}

$temporaryArchive = Join-Path ([System.IO.Path]::GetTempPath()) ("kedoc-safe-export-{0}.zip" -f [guid]::NewGuid().ToString('N'))

try {
  & git -C $repoRoot archive --format=zip "--output=$temporaryArchive" $treeish
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporaryArchive -PathType Leaf)) {
    throw 'Git could not create the safe export archive.'
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($temporaryArchive)
  try {
    if ($archive.Entries.Count -eq 0) {
      throw 'Safe export archive is unexpectedly empty.'
    }

    $unsafeEntries = @(
      $archive.Entries |
        Where-Object { Test-SensitiveArchivePath -RelativePath $_.FullName } |
        ForEach-Object { $_.FullName }
    )
    if ($unsafeEntries.Count -gt 0) {
      throw "Safe export validation found sensitive archive entries: $($unsafeEntries -join ', ')"
    }
  } finally {
    $archive.Dispose()
  }

  $destinationDir = Split-Path -Parent $destinationFull
  if (-not (Test-Path -LiteralPath $destinationDir -PathType Container)) {
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
  }

  Copy-Item -LiteralPath $temporaryArchive -Destination $destinationFull -Force
} finally {
  if (Test-Path -LiteralPath $temporaryArchive -PathType Leaf) {
    Remove-Item -LiteralPath $temporaryArchive -Force
  }
}

Write-Host "Created safe export from tracked files at $destinationFull"
