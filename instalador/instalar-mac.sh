#!/bin/bash
# AML Vista de equipo - instalador para Mac (para el usuario actual, sin administrador).
# Uso (Terminal):
#   curl -fsSL https://raw.githubusercontent.com/ManuRoig/aml-vista-equipo/main/instalador/instalar-mac.sh | bash
set -e
REPO="ManuRoig/aml-vista-equipo"
DIR="$HOME/Library/Application Support/AmlVistaEquipo"
EXT="$DIR/extension"
ETIQUETA="es.amusementlogic.vistaequipo"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
mkdir -p "$DIR" "$HOME/Library/LaunchAgents"

# 1) actualizador y primera descarga
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/instalador/actualizar-mac.sh?t=$(date +%s)" -o "$DIR/actualizar.sh"
chmod +x "$DIR/actualizar.sh"
/bin/bash "$DIR/actualizar.sh"
if [ ! -f "$EXT/manifest.json" ]; then
  echo "No se pudo descargar la extension. Mira: $DIR/actualizar.log"; exit 1
fi

# 2) servicio del usuario: al iniciar sesion y cada 15 minutos
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$DIR/actualizar.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>900</integer>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>/dev/null</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# 3) ultimo paso, a mano y una sola vez, en Chrome
printf '%s' "$EXT" | pbcopy
echo ""
echo "AML Vista de equipo: descargada y con actualizacion automatica."
echo "Falta un paso en Chrome (solo esta vez):"
echo "  1. Abre chrome://extensions"
echo "  2. Activa \"Modo de desarrollador\" (arriba a la derecha)"
echo "  3. Pulsa \"Cargar descomprimida\", pulsa Cmd+Shift+G, pega con Cmd+V y pulsa Intro:"
echo "     $EXT"
echo "     (la ruta ya esta copiada)"
