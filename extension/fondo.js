// AML Vista de equipo — parte de fondo.
// La extensión se instala "descomprimida" en una carpeta que un actualizador del sistema
// (tarea programada en Windows, launchd en Mac) mantiene al día desde GitHub.
// Aquí solo se vigila si la versión que hay en el disco ha cambiado; si es así la extensión
// se recarga sola y vuelve a montar la vista en las pestañas de Basecamp abiertas.

async function revisar() {
  try {
    const r = await fetch(chrome.runtime.getURL('manifest.json') + '?t=' + Date.now(), { cache: 'no-store' });
    const enDisco = (await r.json()).version;
    if (enDisco && enDisco !== chrome.runtime.getManifest().version) chrome.runtime.reload();
  } catch { /* fichero a medio escribir: se mira en la próxima vuelta */ }
}

chrome.alarms.get('revisar', a => { if (!a) chrome.alarms.create('revisar', { periodInMinutes: 1 }); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'revisar') revisar(); });
chrome.runtime.onStartup.addListener(revisar);

// Tras instalar o actualizar: las pestañas de Basecamp ya abiertas no reciben el código nuevo
// por sí solas, así que se les inyecta (el script viejo se retira al ver al nuevo).
chrome.runtime.onInstalled.addListener(async () => {
  const pestanas = await chrome.tabs.query({ url: 'https://app.basecamp.com/*' });
  for (const p of pestanas) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: p.id }, files: ['vista.css'] });
      await chrome.scripting.executeScript({ target: { tabId: p.id }, files: ['vista.js'] });
    } catch { /* pestaña descartada o sin permiso */ }
  }
});
