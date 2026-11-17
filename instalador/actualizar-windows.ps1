# AML Vista de equipo - actualizador para Windows (lo lanza una tarea programada del usuario).
# Si en GitHub hay una version mas nueva, la descarga y sustituye la carpeta de la extension.
# La extension detecta el cambio en el disco y se recarga sola en Chrome.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'ManuRoig/aml-vista-equipo'
$dir  = Join-Path $env:LOCALAPPDATA 'AmlVistaEquipo'
$ext  = Join-Path $dir 'extension'
$log  = Join-Path $dir 'actualizar.log'
function Log($m) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content $log -Encoding UTF8
  $l = @(Get-Content $log -Encoding UTF8); if ($l.Count -gt 300) { $l[-200..-1] | Set-Content $log -Encoding UTF8 }
}
$tmp = $null
try {
  $t = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $remota = (Invoke-RestMethod "https://raw.githubusercontent.com/$repo/main/extension/manifest.json?t=$t" -UseBasicParsing).version
  $mf = Join-Path $ext 'manifest.json'
  $local = $null
  if (Test-Path $mf) { $local = (Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json).version }
  if ($local -and [version]$remota -le [version]$local) { return }

  $tmp = Join-Path $env:TEMP ('amlve-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory $tmp | Out-Null
  $zip = Join-Path $tmp 'repo.zip'
  Invoke-WebRequest "https://codeload.github.com/$repo/zip/refs/heads/main" -OutFile $zip -UseBasicParsing
  Expand-Archive $zip (Join-Path $tmp 'x')
  $src = Get-ChildItem (Join-Path $tmp 'x') -Directory | Select-Object -First 1
  $nuevo = Join-Path $src.FullName 'extension'
  $vNueva = (Get-Content (Join-Path $nuevo 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
  if ($local -and [version]$vNueva -le [version]$local) { return }   # GitHub aun no sirve la nueva

  New-Item -ItemType Directory -Force $ext | Out-Null
  Get-ChildItem $ext | Where-Object { -not (Test-Path (Join-Path $nuevo $_.Name)) } | Remove-Item -Recurse -Force
  Get-ChildItem $nuevo | Where-Object Name -ne 'manifest.json' | Copy-Item -Destination $ext -Recurse -Force
  Copy-Item (Join-Path $nuevo 'manifest.json') $ext -Force           # el ultimo: es lo que mira Chrome
  Copy-Item (Join-Path $src.FullName 'instalador\actualizar-windows.ps1') (Join-Path $dir 'actualizar.ps1') -Force
  Log "Actualizada: $(if ($local) { $local } else { '(nada)' }) -> $vNueva"
} catch {
  Log "ERROR: $($_.Exception.Message)"
} finally {
  if ($tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
