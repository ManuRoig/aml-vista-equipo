// AML Vista de equipo — content script para app.basecamp.com (Basecamp 5).
// En el To-dos de un proyecto de departamento incrusta la vista NATIVA de "All tasks"
// (formulario de filtro + turbo-frame de resultados) filtrada por la gente del grupo.
// Todo lo interactivo (marcar, editar, asignar, paginar) es Basecamp: aquí solo se elige
// a quién mirar, se recuerda la selección y se refresca cuando no se está tocando nada.
(() => {
  'use strict';

  const CFG = {
    // Documento «Grupos de departamento» del proyecto privado «AML · Configuración».
    docGrupos: '/4229058/buckets/49621354/documents/10517660190',
    cacheGruposMs: 5 * 60 * 1000,
    refrescoMs: 60 * 1000,      // refresco automático de los resultados...
    inactividadMs: 30 * 1000,   // ...solo si no se ha tocado nada en este tiempo
  };
  const ID = 'aml-vista-equipo';

  // Si ya corría una versión anterior en esta pestaña (actualización en caliente), se retira.
  try { window.__amlVistaEquipo?.parar(); } catch { /* era de otro contexto */ }
  // Tras recargar la extensión, el script viejo queda "huérfano": deja de actuar.
  const vivo = () => { try { return !!chrome.runtime?.id; } catch { return false; } };

  let gruposCache = null, gruposCacheT = 0;
  let montando = false;
  let temporizador = null;
  let ultimaActividad = Date.now();
  let ultimoRefresco = Date.now();

  // ---------- utilidades ----------
  const meta = n => document.querySelector(`meta[name="${n}"]`)?.content || '';
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const texto = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const clave = b => 've2:' + b;     // 1.1: «ve:» eran preferencias de la 1.0 (pruebas); se borran al arrancar
  try {
    chrome.storage.local.get(null, o => {
      const viejas = Object.keys(o || {}).filter(k => k.startsWith('ve:'));
      if (viejas.length) chrome.storage.local.remove(viejas);
    });
  } catch { /* sin storage */ }
  // Preferencias en chrome.storage.sync: siguen al usuario en todos sus equipos si tiene la
  // sincronización de Chrome activa (si no, Chrome las deja en ese equipo). Si sync falla, local.
  const leerDe = (area, k) => new Promise(res => {
    try { chrome.storage[area].get(k, o => res(chrome.runtime.lastError ? null : ((o && o[k]) || null))); } catch { res(null); }
  });
  const leerPref = async b => {
    const k = clave(b);
    const s = await leerDe('sync', k);
    if (s) return s;
    const l = await leerDe('local', k);                         // guardada antes en este equipo: se sube a sync
    if (l) { try { chrome.storage.sync.set({ [k]: l }, () => { if (!chrome.runtime.lastError) chrome.storage.local.remove(k); }); } catch { /* sin sync */ } }
    return l;
  };
  const guardarPref = (b, v) => {
    const k = clave(b);
    try {
      chrome.storage.sync.set({ [k]: v }, () => {
        if (chrome.runtime.lastError) chrome.storage.local.set({ [k]: v });   // cuota o sync no disponible
        else chrome.storage.local.remove(k);
      });
    } catch { try { chrome.storage.local.set({ [k]: v }); } catch { /* sin storage */ } }
  };

  function paginaTodoset() {
    if (meta('current-page-type') !== 'to-dos' || meta('current-recording-type') !== 'To-dos') return null;
    if (!/\/todosets\/\d+\/?$/.test(location.pathname)) return null;
    return {
      ruta: location.pathname,
      cuenta: meta('current-account-slug-path'),          // "/4229058"
      bucket: meta('current-bucket-id'),
      proyecto: meta('current-bucket-name'),
      yoId: meta('current-person-id'),
      yoNombre: meta('current-person-name'),
    };
  }

  // ---------- grupos (documento de Basecamp) ----------
  async function leerGrupos() {
    if (gruposCache && Date.now() - gruposCacheT < CFG.cacheGruposMs) return gruposCache;
    const r = await fetch(CFG.docGrupos, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
    if (!r.ok) throw new Error('documento de grupos: HTTP ' + r.status);
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const cont = d.querySelector('article.document .formatted_content') || d.querySelector('article.document');
    const grupos = [], vistas = [];
    const lista = s => s.split(/[,;]/).map(x => x.trim()).filter(Boolean);
    if (cont) {
      const bloques = [...cont.querySelectorAll('div, p, li, h1, h2, h3')].filter(b => !b.querySelector('div, p, li'));
      // Si el documento tiene los títulos GRUPOS / VISTAS, solo cuenta lo que va debajo de ellos
      // (así la explicación de arriba nunca se lee como un grupo).
      const conTitulos = bloques.some(b => /^(GRUPOS|VISTAS)$/.test(norm(texto(b))));
      let bloque = conTitulos ? null : 'todo';
      for (const b of bloques) {
        const t = texto(b);
        if (/^(GRUPOS|VISTAS)$/.test(norm(t))) { bloque = norm(t); continue; }
        if (!bloque) continue;
        const v = t.match(/^VISTA\s+(.{1,80}?):\s*(.*)$/);      // VISTA <proyecto>: grupos y personas
        if (v) { if (bloque !== 'GRUPOS') vistas.push({ proyecto: v[1].trim(), elementos: lista(v[2]) }); continue; }
        if (bloque === 'VISTAS') continue;
        const m = t.match(/^([A-ZÁÉÍÓÚÑÜÇ0-9][A-ZÁÉÍÓÚÑÜÇ0-9 +&\-\/.·]{0,59}):\s*(.*)$/);
        if (!m) continue;                                       // el nombre del grupo va en MAYÚSCULAS
        grupos.push({ nombre: m[1].trim(), personas: lista(m[2]) });
      }
    }
    gruposCache = { grupos, vistas }; gruposCacheT = Date.now();
    return gruposCache;
  }

  // ---------- montaje ----------
  async function montar() {
    if (!vivo()) { parar(); return; }
    const pag = paginaTodoset();
    if (!pag || montando || document.getElementById(ID)) return;
    const cabecera = document.querySelector('article.recordable--todoset > header.perma-header');
    if (!cabecera) return;
    montando = true;
    try {
      let grupos, vistaDoc;
      try {
        const cfg = await leerGrupos();
        grupos = cfg.grupos;
        vistaDoc = cfg.vistas.find(v => norm(v.proyecto) === norm(pag.proyecto));
      } catch (e) { console.info('[AML Vista de equipo]', e.message); return; }
      if (!vistaDoc) return;                                    // no es proyecto de departamento

      const r = await fetch(`${pag.cuenta}/tasks`, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
      if (!r.ok) return;
      const d = new DOMParser().parseFromString(await r.text(), 'text/html');
      const formOrig = d.querySelector('form[action$="/tasks/results"]');
      const frameOrig = d.querySelector('turbo-frame#all_assignments_results');
      // contenedor nativo: lleva los controladores de «Filter…» (quick-find) y de «Show subtasks» (toggle-class)
      const reportOrig = d.querySelector('div.report.all-tasks');
      if (!formOrig || !frameOrig) { console.info('[AML Vista de equipo] Basecamp ha cambiado la vista All tasks'); return; }
      if (location.pathname !== pag.ruta || document.getElementById(ID)) return;   // se navegó mientras tanto

      // nombre -> id de persona, sacado del propio filtro nativo ("Me" = la persona actual)
      const personas = new Map();
      formOrig.querySelectorAll('input[name="assignee_ids[]"]').forEach(i => {
        let n = texto(i.closest('label'));
        if (i.value === pag.yoId) n = pag.yoNombre;
        personas.set(norm(n), i.value);
      });
      const noReconocidos = new Set();
      const idsDeGrupo = g => {
        const s = new Set();
        g.personas.forEach(n => { const id = personas.get(norm(n)); if (id) s.add(id); else noReconocidos.add(`${n} (${g.nombre})`); });
        return s;
      };
      const miembros = new Map(grupos.map(g => [g.nombre, idsDeGrupo(g)]));

      // vista por defecto del documento: lo que es un grupo cuenta como grupo, el resto como persona suelta
      const porDefecto = () => {
        const p = { grupos: [], extra: [], excluidos: [], modo: 'equipo' };
        vistaDoc.elementos.forEach(el => {
          const g = grupos.find(x => norm(x.nombre) === norm(el));
          if (g) { if (!p.grupos.includes(g.nombre)) p.grupos.push(g.nombre); return; }
          const id = personas.get(norm(el));
          if (id) { if (!p.extra.includes(id)) p.extra.push(id); } else noReconocidos.add(`${el} (VISTA ${vistaDoc.proyecto})`);
        });
        return p;
      };
      const defecto = porDefecto();

      // estructura
      const seccion = document.createElement('section');
      seccion.id = ID;
      seccion.innerHTML = `
        <div class="aml-ve__modo"><div class="button-group">
          <button type="button" class="button-group__btn btn btn--sm" data-modo="equipo"></button>
          <button type="button" class="button-group__btn btn btn--sm" data-modo="proyecto">Listas del proyecto</button>
        </div></div>
        <div class="aml-ve__cuerpo"><p class="aml-ve__aviso"></p><div class="aml-ve__resultados"></div></div>`;
      seccion.querySelector('[data-modo="equipo"]').textContent = 'Equipo ' + vistaDoc.proyecto;
      const form = document.importNode(formOrig, true);
      const frame = document.importNode(frameOrig, true);
      frame.removeAttribute('src'); frame.innerHTML = '';     // se carga al aplicar la selección
      seccion.querySelector('.aml-ve__cuerpo').prepend(form);
      seccion.querySelector('.aml-ve__resultados').append(frame);
      if (reportOrig) {
        const cuerpo = seccion.querySelector('.aml-ve__cuerpo');
        const envoltorio = document.importNode(reportOrig, false);   // solo el contenedor, con sus atributos
        envoltorio.append(...cuerpo.childNodes);
        cuerpo.append(envoltorio);
      }
      const aviso = seccion.querySelector('.aml-ve__aviso');
      if (noReconocidos.size) aviso.textContent = 'No reconozco en Basecamp: ' + [...noReconocidos].join(', ') + '. Revisa el documento «Grupos de departamento».';

      // selector de grupos con el mismo aspecto que los desplegables nativos
      const chevron = formOrig.querySelector('.svg-icon--chevron-down')?.outerHTML || '';
      const check = formOrig.querySelector('.icon--check')?.outerHTML || '';
      const caja = document.createElement('div');
      caja.className = 'popup-dropdown button-group__dropdown aml-ve__grupos';
      caja.innerHTML = `
        <button type="button" class="button-group__btn btn btn--sm" aria-haspopup="listbox"><span class="aml-ve__etiqueta"></span> ${chevron}</button>
        <dialog class="popup flex-col" aria-label="Grupos">
          <strong class="popup__title margin-bottom-4">Grupos…</strong>
          <ul class="popup__list margin-top-8" role="listbox" aria-multiselectable="true"></ul>
          <ul class="popup__list aml-ve__volver">
            <li class="popup__item"><button type="button" class="popup__btn"><span class="truncate flex-1">Volver a la vista del departamento</span></button></li>
          </ul>
        </dialog>`;
      const lista = caja.querySelector('ul');
      grupos.forEach(g => {
        const li = document.createElement('li');
        li.className = 'popup__item'; li.setAttribute('role', 'option');
        li.innerHTML = `<label class="popup__btn"><input type="checkbox" class="invisible-checkbox" tabindex="-1"><span class="truncate flex-1"></span>${check}</label>`;
        li.querySelector('input').value = g.nombre;
        li.querySelector('span.truncate').textContent = `${g.nombre} (${miembros.get(g.nombre).size})`;
        lista.append(li);
      });
      const primerGrupoBotones = form.querySelector('.button-group');
      (primerGrupoBotones ? primerGrupoBotones.after(caja) : form.prepend(caja));

      cabecera.after(seccion);
      const ocultables = [...cabecera.parentElement.children].filter(c => c !== cabecera && c !== seccion && !c.classList.contains('recordable__anchor'));

      // ---------- estado ----------
      // sin personalizar => la vista del documento (y sigue al documento si este cambia)
      // (la pestaña elegida se recuerda aparte; grupos y personas solo si el usuario los ha tocado)
      const guardada = await leerPref(pag.bucket);
      const pref = structuredClone(defecto);
      if (guardada) {
        pref.modo = guardada.modo === 'proyecto' ? 'proyecto' : 'equipo';
        if (guardada.personalizada) Object.assign(pref, {
          personalizada: true, grupos: guardada.grupos || [], extra: guardada.extra || [], excluidos: guardada.excluidos || [],
        });
      }
      pref.grupos = pref.grupos.filter(n => miembros.has(n));
      let aplicando = false;

      const idsGrupos = () => { const s = new Set(); pref.grupos.forEach(n => miembros.get(n)?.forEach(id => s.add(id))); return s; };
      const seleccion = () => {
        const s = idsGrupos();
        pref.excluidos.forEach(id => s.delete(id));
        pref.extra.forEach(id => s.add(id));
        return s;
      };
      const pintarGrupos = () => {
        lista.querySelectorAll('input').forEach(i => { i.checked = pref.grupos.includes(i.value); i.closest('li').setAttribute('aria-selected', String(i.checked)); });
        const n = pref.grupos.length;
        caja.querySelector('.aml-ve__etiqueta').textContent = n === 0 ? 'Sin grupo' : n === 1 ? pref.grupos[0] : `${pref.grupos[0]} +${n - 1}`;
      };
      const pintarModo = () => {
        seccion.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('active', b.dataset.modo === pref.modo));
        seccion.querySelector('.aml-ve__cuerpo').classList.toggle('aml-ve-oculto', pref.modo !== 'equipo');
        ocultables.forEach(c => c.classList.toggle('aml-ve-oculto', pref.modo === 'equipo'));
      };
      const guardar = () => guardarPref(pag.bucket, pref);

      function aplicar() {
        const sel = seleccion();
        const inputs = [...form.querySelectorAll('input[name="assignee_ids[]"]')];
        let ultimo = null;
        inputs.forEach(i => {
          const quiero = sel.has(i.value);
          if (i.checked !== quiero) { i.checked = quiero; ultimo = i; }
          i.closest('li')?.setAttribute('aria-selected', String(quiero));
        });
        aplicando = true;
        try {
          // el "change" nativo actualiza la etiqueta del botón de personas y envía el filtro
          if (ultimo) ultimo.dispatchEvent(new Event('change', { bubbles: true }));
          else form.requestSubmit();
        } finally { aplicando = false; }
        ultimoRefresco = Date.now();
      }

      // cambios de personas hechos a mano en el desplegable nativo: se recuerdan
      form.addEventListener('change', e => {
        const i = e.target;
        if (aplicando || !(i instanceof HTMLInputElement) || i.name !== 'assignee_ids[]') return;
        const marcados = new Set([...form.querySelectorAll('input[name="assignee_ids[]"]:checked')].map(x => x.value));
        const deGrupo = idsGrupos();
        pref.extra = [...marcados].filter(id => !deGrupo.has(id));
        pref.excluidos = [...deGrupo].filter(id => !marcados.has(id));
        pref.personalizada = true; guardar();
      }, true);
      // "Anyone" (quitar filtro de personas) => sin grupos ni extras
      form.addEventListener('click', e => {
        const b = e.target.closest('[data-action*="activity-filter#resetFilter"]');
        if (b && b.dataset.activityFilterNameParam === 'assignee_ids[]') {
          pref.grupos = []; pref.extra = []; pref.excluidos = []; pref.personalizada = true; guardar(); setTimeout(pintarGrupos, 0);
        }
      }, true);

      // selector de grupos
      const dialogo = caja.querySelector('dialog');
      const cerrar = () => { if (dialogo.open) { dialogo.close(); caja.classList.remove('dialog-open'); } };
      caja.querySelector('button').addEventListener('click', e => {
        e.stopPropagation();
        if (dialogo.open) cerrar(); else { dialogo.show(); caja.classList.add('dialog-open'); }
      });
      document.addEventListener('click', e => { if (!caja.contains(e.target)) cerrar(); });
      dialogo.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
      lista.addEventListener('change', e => {
        const i = e.target;
        pref.grupos = i.checked ? [...new Set([...pref.grupos, i.value])] : pref.grupos.filter(n => n !== i.value);
        // al cambiar de grupos, las excepciones manuales de quien ya no está se limpian
        const deGrupo = idsGrupos();
        pref.excluidos = pref.excluidos.filter(id => deGrupo.has(id));
        pref.extra = pref.extra.filter(id => !deGrupo.has(id));
        pref.personalizada = true; guardar(); pintarGrupos(); aplicar();
      });

      caja.querySelector('.aml-ve__volver button').addEventListener('click', () => {
        Object.assign(pref, structuredClone(defecto), { modo: pref.modo, personalizada: false });
        guardar(); cerrar(); pintarGrupos(); aplicar();
      });

      // pestañas Equipo / Listas del proyecto
      seccion.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
        pref.modo = b.dataset.modo; guardar(); pintarModo();
      }));

      pintarGrupos(); pintarModo(); aplicar();

      // refresco automático: solo en modo equipo, pestaña visible, sin tocar nada y sin paginar más
      clearInterval(temporizador);
      temporizador = setInterval(() => {
        if (!document.getElementById(ID) || !vivo()) { clearInterval(temporizador); return; }
        if (pref.modo !== 'equipo' || document.visibilityState !== 'visible') return;
        if (Date.now() - ultimaActividad < CFG.inactividadMs || Date.now() - ultimoRefresco < CFG.refrescoMs) return;
        if (document.querySelector('dialog[open]')) return;
        const act = document.activeElement;
        if (act && act !== document.body && seccion.contains(act) && /INPUT|TEXTAREA|SELECT/.test(act.tagName)) return;
        if (frame.querySelectorAll('[id^="all_assignments-pagination-contents-"]').length > 1) return;
        form.requestSubmit(); ultimoRefresco = Date.now();
      }, 10 * 1000);
    } catch (e) {
      console.warn('[AML Vista de equipo]', e);
    } finally {
      montando = false;
    }
  }

  function desmontar() {
    const s = document.getElementById(ID);
    if (!s) return;
    s.parentElement?.querySelectorAll('.aml-ve-oculto').forEach(c => c.classList.remove('aml-ve-oculto'));
    s.remove();
    clearInterval(temporizador);
  }

  const actividad = () => { ultimaActividad = Date.now(); };
  const EVENTOS_ACTIVIDAD = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
  function parar() {
    EVENTOS_ACTIVIDAD.forEach(t => document.removeEventListener(t, actividad, { capture: true }));
    document.removeEventListener('turbo:before-cache', desmontar);
    document.removeEventListener('turbo:load', montar);
    desmontar();
    if (window.__amlVistaEquipo?.parar === parar) delete window.__amlVistaEquipo;
  }

  EVENTOS_ACTIVIDAD.forEach(t => document.addEventListener(t, actividad, { passive: true, capture: true }));
  document.addEventListener('turbo:before-cache', desmontar);   // que la caché de Turbo no guarde nuestra vista
  document.addEventListener('turbo:load', montar);
  window.__amlVistaEquipo = { parar };
  desmontar();          // por si quedó montada la vista de una versión anterior
  montar();
})();
