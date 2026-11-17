# AML Vista de equipo - instalador para Windows (para el usuario actual, sin administrador).
# Uso (PowerShell):
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/ManuRoig/aml-vista-equipo/main/instalador/instalar-windows.ps1 | iex"
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'ManuRoig/aml-vista-equipo'
$dir  = Join-Path $env:LOCALAPPDATA 'AmlVistaEquipo'
$ext  = Join-Path $dir 'extension'
New-Item -ItemType Directory -Force $dir | Out-Null

# 1) actualizador + lanzador oculto (sin ventana)
Invoke-WebRequest "https://raw.githubusercontent.com/$repo/main/instalador/actualizar-windows.ps1" -OutFile (Join-Path $dir 'actualizar.ps1') -UseBasicParsing
$vbs = 'Set s = CreateObject("WScript.Shell")' + "`r`n" +
       'p = s.ExpandEnvironmentStrings("%LOCALAPPDATA%\AmlVistaEquipo\actualizar.ps1")' + "`r`n" +
       's.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & p & """", 0, False' + "`r`n"
Set-Content (Join-Path $dir 'lanzar.vbs') $vbs -Encoding ASCII

# 2) primera descarga
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'actualizar.ps1')
if (-not (Test-Path (Join-Path $ext 'manifest.json'))) {
  Write-Host "No se pudo descargar la extension. Mira $dir\actualizar.log" -ForegroundColor Red; return
}

# 3) tarea programada del usuario: al iniciar sesion y cada 15 minutos
$accion = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$dir\lanzar.vbs`""
$t1 = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$conf = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
try {
  Register-ScheduledTask -TaskName 'AML Vista de equipo - actualizar' -Action $accion -Trigger $t1, $t2 -Settings $conf -Force | Out-Null
} catch {
  Register-ScheduledTask -TaskName 'AML Vista de equipo - actualizar' -Action $accion -Trigger $t2 -Settings $conf -Force | Out-Null
}

# 4) ultimo paso, a mano y una sola vez, en Chrome
Set-Clipboard -Value $ext
Write-Host ''
Write-Host 'AML Vista de equipo: descargada y con actualizacion automatica.' -ForegroundColor Green
Write-Host 'Falta un paso en Chrome (solo esta vez):'
Write-Host '  1. Abre chrome://extensions'
Write-Host '  2. Activa "Modo de desarrollador" (arriba a la derecha)'
Write-Host '  3. Pulsa "Cargar descomprimida" y elige esta carpeta (ya esta copiada, pega con Ctrl+V):'
Write-Host "     $ext" -ForegroundColor Cyan
