# Runs a separate, invisible Chrome instance through CDP; never attaches to user windows.
$ErrorActionPreference = 'Stop'
$blocksTempRoot = [System.IO.Path]::GetTempPath()
$blocksRunDir = Join-Path $blocksTempRoot ('blocks-headless-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $blocksRunDir | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'headless.cjs') -Destination (Join-Path $blocksRunDir 'browser-check.cjs')
node (Join-Path $blocksRunDir 'browser-check.cjs')
$blocksRunExit = $LASTEXITCODE
Write-Output ('Browser script and isolated profile: ' + $blocksRunDir)
exit $blocksRunExit
