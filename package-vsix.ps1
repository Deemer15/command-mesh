$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$stage = Join-Path $env:TEMP "kiro-lot-map-vsix"
$vsix = Join-Path $root "lot-map-0.1.0.vsix"
$zip = Join-Path $root "lot-map-0.1.0.zip"

if ([IO.Path]::GetFullPath($stage) -ne [IO.Path]::GetFullPath((Join-Path $env:TEMP 'kiro-lot-map-vsix'))) { throw 'Unexpected staging path' }
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path $vsix) { Remove-Item -LiteralPath $vsix -Force }
if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
New-Item -ItemType Directory -Path (Join-Path $stage 'extension') | Out-Null
Copy-Item (Join-Path $root 'extension.js') (Join-Path $stage 'extension')
Copy-Item (Join-Path $root 'package.json') (Join-Path $stage 'extension')
Copy-Item (Join-Path $root 'map-renderer.js') (Join-Path $stage 'extension')

Copy-Item (Join-Path $root 'futuristic-renderer.js') (Join-Path $stage 'extension')
Copy-Item (Join-Path $root 'dashboard.css') (Join-Path $stage 'extension')

$manifest = @'
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0">
  <Metadata>
    <Identity Id="local.kiro-lot-map" Version="0.1.0" Publisher="local" Language="en-us" />
    <DisplayName>Kiro Lot Map</DisplayName>
    <Description>A live map of Kiro agent activity.</Description>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties />
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" Version="[1.85.0,)" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Services.Content" Path="extension" />
  </Assets>
</PackageManifest>
'@
New-Item -ItemType Directory -Path (Join-Path $stage 'extension') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $stage '[Content_Types].xml') -Value @'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="css" ContentType="text/css" />
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="xml" ContentType="application/xml" />
  <Override PartName="/extension/package.json" ContentType="application/json" />
  <Override PartName="/extension/extension.js" ContentType="application/javascript" />
</Types>
'@
Set-Content -LiteralPath (Join-Path $stage 'extension.vsixmanifest') -Value $manifest
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Move-Item -LiteralPath $zip -Destination $vsix
Write-Output "Created $vsix"
