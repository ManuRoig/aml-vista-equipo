#!/bin/bash
# AML Vista de equipo - actualizador para Mac (lo lanza launchd cada 15 minutos y al iniciar sesion).
# Si en GitHub hay una version mas nueva, la descarga y sustituye la carpeta de la extension.
# La extension detecta el cambio en el disco y se recarga sola en Chrome.
set -u
REPO="ManuRoig/aml-vista-equipo"
DIR="$HOME/Library/Application Support/AmlVistaEquipo"
EXT="$DIR/extension"
LOG="$DIR/actualizar.log"
mkdir -p "$DIR"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
  if [ "$(wc -l < "$LOG")" -gt 300 ]; then tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
}
version() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' "$1" | head -1; }
# mayor A B -> exito si A > B
mayor() {
  awk -v a="$1" -v b="$2" 'BEGIN { n = split(a, x, "."); m = split(b, y, "."); if (m > n) n = m;
    for (i = 1; i <= n; i++) { if (x[i] + 0 > y[i] + 0) exit 0; if (x[i] + 0 < y[i] + 0) exit 1 } exit 1 }'
}

TMP=$(mktemp -d) || exit 0
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "https://raw.githubusercontent.com/$REPO/main/extension/manifest.json?t=$(date +%s)" -o "$TMP/m.json" \
  || { log "ERROR: sin acceso a GitHub"; exit 0; }
REMOTA=$(version "$TMP/m.json")
LOCAL=""
[ -f "$EXT/manifest.json" ] && LOCAL=$(version "$EXT/manifest.json")
if [ -z "$REMOTA" ]; then log "ERROR: version remota ilegible"; exit 0; fi
if [ -n "$LOCAL" ] && ! mayor "$REMOTA" "$LOCAL"; then exit 0; fi

curl -fsSL "https://codeload.github.com/$REPO/zip/refs/heads/main" -o "$TMP/r.zip" || { log "ERROR: descarga"; exit 0; }
unzip -q "$TMP/r.zip" -d "$TMP/x" || { log "ERROR: zip"; exit 0; }
SRC=$(find "$TMP/x" -mindepth 1 -maxdepth 1 -type d | head -1)
NUEVA=$(version "$SRC/extension/manifest.json")
if [ -n "$LOCAL" ] && ! mayor "$NUEVA" "$LOCAL"; then exit 0; fi   # GitHub aun no sirve la nueva

mkdir -p "$EXT"
for f in "$EXT"/*; do [ -e "$f" ] && [ ! -e "$SRC/extension/$(basename "$f")" ] && rm -rf "$f"; done
for f in "$SRC/extension"/*; do [ "$(basename "$f")" = "manifest.json" ] || cp -R "$f" "$EXT/"; done
cp "$SRC/extension/manifest.json" "$EXT/manifest.json"     # el ultimo: es lo que mira Chrome
# el propio actualizador se renueva con mv (fichero nuevo) para no pisar el que se esta ejecutando
cp "$SRC/instalador/actualizar-mac.sh" "$DIR/actualizar.sh.nuevo" && chmod +x "$DIR/actualizar.sh.nuevo" \
  && mv -f "$DIR/actualizar.sh.nuevo" "$DIR/actualizar.sh"
log "Actualizada: ${LOCAL:-(nada)} -> $NUEVA"
