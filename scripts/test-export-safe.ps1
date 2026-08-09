[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$exportScript = Join-Path $PSScriptRoot 'export-safe.ps1'
$temporaryBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
$testRoot = Join-Path $temporaryBase ("kedoc-export-test-{0}" -f [guid]::NewGuid().ToString('N'))
$fixtureRepo = Join-Path $testRoot 'repo'
$archivePath = Join-Path $testRoot 'safe-export.zip'

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

try {
  New-Item -ItemType Directory -Path $fixtureRepo -Force | Out-Null
  & git -C $fixtureRepo init --quiet
  & git -C $fixtureRepo config user.name 'Safe Export Test'
  & git -C $fixtureRepo config user.email 'safe-export@example.invalid'

  [System.IO.File]::WriteAllText((Join-Path $fixtureRepo 'README.md'), "tracked-safe-content`n")
  & git -C $fixtureRepo add README.md
  & git -C $fixtureRepo commit --quiet -m 'Add safe fixture'
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to initialize safe-export fixture repository.'
  }

  # These files deliberately resemble real local credentials. They must stay
  # out of the archive because the exporter only snapshots Git-tracked files.
  New-Item -ItemType Directory -Path (Join-Path $fixtureRepo '.vercel') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $fixtureRepo 'web/.vercel') -Force | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $fixtureRepo '.env.local'), 'EXPORT_TEST_SECRET=never-archive')
  [System.IO.File]::WriteAllText((Join-Path $fixtureRepo '.vercel/.env.production.local'), 'VERCEL_TEST_SECRET=never-archive')
  [System.IO.File]::WriteAllText((Join-Path $fixtureRepo 'web/.vercel/project.json'), '{"secret":"never-archive"}')

  & $exportScript -SourceRoot $fixtureRepo -DestinationPath $archivePath

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    Assert-True -Condition ($entryNames -contains 'README.md') -Message 'Tracked README.md was not exported.'
    Assert-True -Condition (-not ($entryNames | Where-Object { $_ -match '(^|/)\.env($|\.)' })) -Message 'An .env file leaked into the archive.'
    Assert-True -Condition (-not ($entryNames | Where-Object { $_ -match '(^|/)\.vercel(/|$)' })) -Message 'A .vercel path leaked into the archive.'
  } finally {
    $archive.Dispose()
  }

  $archiveHashBeforeBlockedExport = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash
  & git -C $fixtureRepo add --force .env.local
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to stage the sensitive-path regression fixture.'
  }
  $blocked = $false
  try {
    & $exportScript -SourceRoot $fixtureRepo -DestinationPath $archivePath
  } catch {
    $blocked = $_.Exception.Message -like '*Git tracks sensitive paths*'
  }

  Assert-True -Condition $blocked -Message 'Exporter did not reject a Git-tracked .env.local file.'
  $archiveHashAfterBlockedExport = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash
  Assert-True -Condition ($archiveHashBeforeBlockedExport -eq $archiveHashAfterBlockedExport) -Message 'A blocked export overwrote the last known-good archive.'

  Write-Host 'Safe export regression test passed.'
} finally {
  $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
  $isExpectedTempPath =
    $resolvedTestRoot.StartsWith($temporaryBase + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -and
    ([System.IO.Path]::GetFileName($resolvedTestRoot) -like 'kedoc-export-test-*')

  if (-not $isExpectedTempPath) {
    throw "Refusing to clean unexpected test path: $resolvedTestRoot"
  }

  if (Test-Path -LiteralPath $resolvedTestRoot -PathType Container) {
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
  }
}
