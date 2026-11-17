# AML Vista de equipo

Extensión de Chrome de uso interno de Amusement Logic para Basecamp 5. En las tareas de cada proyecto de departamento muestra la vista nativa «All tasks» filtrada por la gente de ese departamento. Los grupos y las vistas se definen en un documento privado de Basecamp; sin sesión en Basecamp la extensión no hace nada.

## Instalación (una vez por equipo)

**Mac** (Terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/ManuRoig/aml-vista-equipo/main/instalador/instalar-mac.sh | bash
```

**Windows** (PowerShell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/ManuRoig/aml-vista-equipo/main/instalador/instalar-windows.ps1 | iex"
```

Después, en Chrome: `chrome://extensions` → «Modo de desarrollador» → «Cargar descomprimida» → la carpeta que indica el instalador (queda copiada en el portapapeles).

## Actualizaciones

Automáticas. Cada 15 minutos y al iniciar sesión, el equipo comprueba la versión de `extension/manifest.json` en este repositorio. Si hay una más nueva, la descarga, y la extensión se recarga sola en Chrome en menos de un minuto.

- Windows: tarea programada «AML Vista de equipo - actualizar»; carpeta `%LOCALAPPDATA%\AmlVistaEquipo`.
- Mac: servicio `es.amusementlogic.vistaequipo`; carpeta `~/Library/Application Support/AmlVistaEquipo`.
- Registro en `actualizar.log` dentro de esa carpeta.

Para publicar una corrección hay que **subir la versión** en `extension/manifest.json`. Si no se sube, los equipos no la descargan.

## Desinstalar

- Chrome: quitar la extensión en `chrome://extensions`.
- Windows: `Unregister-ScheduledTask -TaskName 'AML Vista de equipo - actualizar' -Confirm:$false` y borrar `%LOCALAPPDATA%\AmlVistaEquipo`.
- Mac: `launchctl bootout gui/$(id -u)/es.amusementlogic.vistaequipo`, y borrar `~/Library/LaunchAgents/es.amusementlogic.vistaequipo.plist` y `~/Library/Application Support/AmlVistaEquipo`.
