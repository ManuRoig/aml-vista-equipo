#!/bin/bash
# Doble clic para instalar AML Vista de equipo en este Mac (usuario actual, sin administrador).
clear
echo "Instalando AML Vista de equipo..."
echo ""
if ! curl -fsSL "https://raw.githubusercontent.com/ManuRoig/aml-vista-equipo/main/instalador/instalar-mac.sh?t=$(date +%s)" | bash; then
  echo ""
  echo "Algo ha fallado. Avisa a Manu con una foto de esta ventana."
  read -n 1 -s -r -p "Pulsa una tecla para cerrar..."
  exit 1
fi
open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true
echo ""
echo "Chrome se ha abierto en Extensiones. Sigue los 3 pasos de arriba."
read -n 1 -s -r -p "Cuando termines, pulsa una tecla para cerrar esta ventana..."
