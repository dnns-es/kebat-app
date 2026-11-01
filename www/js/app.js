// Fecha: 2026-11-01
// Ruta: F:\APP\kebat\www\js\app.js
// Lógica de la app de pedidos Kebat: descarga la carta del servidor, carrito con
// opciones (salsa, picante, extras), datos de entrega con ubicación GPS y envío
// del pedido; después enseña el estado (preparando, en reparto...) sondeando.
// Sin registro: los datos de entrega se recuerdan en el móvil para la próxima vez.

'use strict';

// Servidor: el real en el APK; en el navegador de desarrollo (localhost:8787) el simulador.
// kebat_servidor en localStorage permite apuntar al simulador desde el emulador (10.0.2.2).
const SERVIDOR = localStorage.getItem('kebat_servidor')
    || (location.origin.includes(':8787') ? '' : 'https://kebat.dnns.es');
const API = SERVIDOR + '/api/app.php';
const API_PANEL = SERVIDOR + '/api/panel.php';

const $ = (s) => document.querySelector(s);
const vista = $('#vista');
const barraCarrito = $('#barra-carrito');

let carta = null;                   // {abierto, aviso, opciones, categorias}
let productos = {};                 // id -> producto
let grupos = {};                    // id -> grupo de opciones
let itemsOp = {};                   // id -> item de opción
let carrito = JSON.parse(localStorage.getItem('kebat_carrito') || '[]');
let pantalla = 'carta';
let sondeo = null;

// ---------- utilidades ----------

function esc(t) {
    return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function eur(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
function guardarCarrito() { localStorage.setItem('kebat_carrito', JSON.stringify(carrito)); }

function precioLinea(l) {
    const p = productos[l.id];
    if (!p) return 0;
    const extra = (l.opciones || []).reduce((s, oid) => s + (itemsOp[oid]?.precio || 0), 0);
    return (p.precio + extra) * l.cant;
}
function totalCarrito() { return carrito.reduce((s, l) => s + precioLinea(l), 0); }
function unidadesCarrito() { return carrito.reduce((s, l) => s + l.cant, 0); }

function pintarBarraCarrito() {
    const u = unidadesCarrito();
    barraCarrito.hidden = pantalla !== 'carta' || !u;
    if (u) {
        $('#bc-unidades').textContent = u;
        $('#bc-total').textContent = eur(totalCarrito());
    }
}

function cabecera(titulo, conAtras) {
    $('#titulo').textContent = titulo;
    $('#atras').hidden = !conAtras;
}

// ---------- carta ----------

async function cargarCarta() {
    vista.innerHTML = '<div class="vacio">Cargando la carta…</div>';
    try {
        const r = await fetch(API + '?accion=carta');
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'Error del servidor');
        carta = j;
        productos = {}; grupos = {}; itemsOp = {};
        for (const c of carta.categorias) for (const p of c.productos) productos[p.id] = p;
        for (const g of carta.opciones) { grupos[g.id] = g; for (const i of g.items) itemsOp[i.id] = i; }
        // Si la carta cambió, fuera líneas del carrito que ya no existan
        carrito = carrito.filter((l) => productos[l.id] && !productos[l.id].agotado);
        guardarCarrito();
        pintarCarta();
    } catch {
        vista.innerHTML = '<div class="error-red">No se puede conectar con Kebat.<br>Comprueba tu conexión.<br><br><button class="btn secundario" id="reintentar">Reintentar</button></div>';
        $('#reintentar').onclick = cargarCarta;
    }
}

function pintarCarta() {
    pantalla = 'carta';
    cabecera('Kebat', false);
    let html = '';
    if (!carta.abierto) html += '<div class="aviso cerrado">🔒 Ahora mismo estamos cerrados. Puedes mirar la carta, pero no enviar pedidos.</div>';
    if (carta.aviso) html += `<div class="aviso nota">📢 ${esc(carta.aviso)}</div>`;
    for (const c of carta.categorias) {
        if (!c.productos.length) continue;
        html += `<div class="categoria">${esc(c.nombre)}</div>`;
        for (const p of c.productos) {
            const enCarrito = carrito.filter((l) => l.id === p.id).reduce((s, l) => s + l.cant, 0);
            html += `
            <div class="producto ${p.agotado ? 'agotado' : ''}" data-p="${p.id}">
                <img class="foto" src="${SERVIDOR}/data/${esc(p.img || 'img/e1.svg')}" alt="" loading="lazy">
                <div class="datos">
                    <div class="nombre">${esc(p.nombre)}</div>
                    ${p.desc ? `<div class="desc">${esc(p.desc)}</div>` : ''}
                    <div class="precio">${eur(p.precio)}</div>
                </div>
                ${p.agotado ? '' : `<button class="mas" data-add="${p.id}">＋${enCarrito ? `<span class="puntito">${enCarrito}</span>` : ''}</button>`}
            </div>`;
        }
    }
    vista.innerHTML = html;
    vista.querySelectorAll('[data-add]').forEach((b) => {
        b.onclick = (e) => { e.stopPropagation(); abrirProducto(b.dataset.add); };
    });
    vista.querySelectorAll('.producto:not(.agotado)').forEach((d) => {
        d.onclick = () => abrirProducto(d.dataset.p);
    });
    pintarBarraCarrito();
    window.scrollTo(0, 0);
}

// Ficha del producto: opciones (una / varias) + cantidad + añadir
function abrirProducto(id) {
    const p = productos[id];
    const susGrupos = (p.opciones || []).map((gid) => grupos[gid]).filter(Boolean);
    let cant = 1;
    const fondo = document.createElement('div');
    fondo.className = 'velo';
    fondo.innerHTML = `
        <div class="modal">
            <img class="modal-foto" src="${SERVIDOR}/data/${esc(p.img || 'img/e1.svg')}" alt="">
            <h2>${esc(p.nombre)}</h2>
            ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ''}
            ${susGrupos.map((g) => `
                <div class="grupo">
                    <div class="grupo-titulo">${esc(g.nombre)} ${g.tipo === 'una' ? '' : '<small>(los que quieras)</small>'}</div>
                    ${g.items.map((i, ix) => `
                        <label class="opcion">
                            <input type="${g.tipo === 'una' ? 'radio' : 'checkbox'}" name="g-${g.id}" value="${i.id}" ${g.tipo === 'una' && ix === 0 ? 'checked' : ''}>
                            <span>${esc(i.nombre)}</span>
                            ${i.precio ? `<span class="op-precio">+${eur(i.precio)}</span>` : ''}
                        </label>`).join('')}
                </div>`).join('')}
            <div class="cantidad centrada">
                <button id="m-menos">−</button><span class="num" id="m-cant">1</span><button id="m-mas">＋</button>
            </div>
            <button class="btn principal" id="m-anadir"></button>
            <button class="btn secundario" id="m-cerrar">Cancelar</button>
        </div>`;
    document.body.appendChild(fondo);

    const precio = () => {
        let extra = 0;
        fondo.querySelectorAll('input:checked').forEach((i) => { extra += itemsOp[i.value]?.precio || 0; });
        return (p.precio + extra) * cant;
    };
    const refrescar = () => {
        $('#m-cant').textContent = cant;
        $('#m-anadir').textContent = 'Añadir al pedido — ' + eur(precio());
    };
    fondo.querySelectorAll('input').forEach((i) => { i.onchange = refrescar; });
    $('#m-menos').onclick = () => { if (cant > 1) { cant--; refrescar(); } };
    $('#m-mas').onclick = () => { if (cant < 20) { cant++; refrescar(); } };
    $('#m-cerrar').onclick = () => fondo.remove();
    fondo.onclick = (e) => { if (e.target === fondo) fondo.remove(); };
    $('#m-anadir').onclick = () => {
        const opciones = [...fondo.querySelectorAll('input:checked')].map((i) => i.value);
        // Si ya hay una línea igual (mismo producto y opciones), se suma la cantidad
        const clave = id + '|' + opciones.join(',');
        const igual = carrito.find((l) => l.id + '|' + (l.opciones || []).join(',') === clave);
        if (igual) igual.cant = Math.min(igual.cant + cant, 20); else carrito.push({ id, cant, opciones });
        guardarCarrito();
        fondo.remove();
        pintarCarta();
    };
    refrescar();
}

// ---------- carrito ----------

function pintarCarrito() {
    pantalla = 'carrito';
    cabecera('Tu pedido', true);
    pintarBarraCarrito();
    if (!carrito.length) {
        vista.innerHTML = '<div class="vacio">El pedido está vacío.<br><br><button class="btn secundario" id="volver">Ver la carta</button></div>';
        $('#volver').onclick = pintarCarta;
        return;
    }
    vista.innerHTML = carrito.map((l, i) => {
        const p = productos[l.id];
        const ops = (l.opciones || []).map((oid) => itemsOp[oid]?.nombre).filter(Boolean);
        return `
        <div class="linea">
            <div class="datos">
                <div class="nombre">${esc(p.nombre)}</div>
                ${ops.length ? `<div class="desc">${esc(ops.join(' · '))}</div>` : ''}
            </div>
            <div class="cantidad">
                <button data-menos="${i}">−</button><span class="num">${l.cant}</span><button data-mas="${i}">＋</button>
            </div>
            <div class="importe">${eur(precioLinea(l))}</div>
        </div>`;
    }).join('') + `
        <div class="total-caja"><span>Total</span><span>${eur(totalCarrito())}</span></div>
        <button class="btn principal" id="finalizar" ${carta.abierto ? '' : 'disabled'}>${carta.abierto ? 'Finalizar pedido' : 'Cerrado ahora mismo'}</button>
        <button class="btn secundario" id="seguir">Añadir más cosas</button>`;
    vista.querySelectorAll('[data-mas]').forEach((b) => {
        b.onclick = () => { const l = carrito[b.dataset.mas]; if (l.cant < 20) l.cant++; guardarCarrito(); pintarCarrito(); };
    });
    vista.querySelectorAll('[data-menos]').forEach((b) => {
        b.onclick = () => {
            const i = parseInt(b.dataset.menos);
            if (--carrito[i].cant <= 0) carrito.splice(i, 1);
            guardarCarrito(); pintarCarrito();
        };
    });
    $('#seguir').onclick = pintarCarta;
    if (carta.abierto) $('#finalizar').onclick = pintarDatos;
    window.scrollTo(0, 0);
}

// ---------- datos de entrega y envío ----------

function pintarDatos() {
    pantalla = 'datos';
    cabecera('Datos de entrega', true);
    pintarBarraCarrito();
    const d = JSON.parse(localStorage.getItem('kebat_datos') || '{}');
    vista.innerHTML = `
        <div class="campo"><label>Tu nombre</label><input id="d-nombre" value="${esc(d.nombre || '')}" autocomplete="name"></div>
        <div class="campo"><label>Teléfono (por si hay dudas con el pedido)</label><input id="d-telefono" type="tel" value="${esc(d.telefono || '')}" autocomplete="tel"></div>
        <div class="campo"><label>Dirección (calle, número, piso)</label><input id="d-direccion" value="${esc(d.direccion || '')}" autocomplete="street-address"></div>
        <div class="campo"><label>Población</label><input id="d-poblacion" value="${esc(d.poblacion || '')}" autocomplete="address-level2"></div>
        <div class="campo"><label>Notas (opcional: timbre, portal, sin cebolla…)</label><textarea id="d-notas"></textarea></div>
        <button class="btn gps" id="d-gps">📍 Adjuntar mi ubicación GPS</button>
        <button class="btn principal" id="d-enviar">Enviar pedido — ${eur(totalCarrito())}</button>
        <div id="d-error" class="error-red" style="padding:10px"></div>`;
    let pos = null;
    $('#d-gps').onclick = async () => {
        $('#d-gps').textContent = '📡 Buscando señal…';
        try {
            const g = await obtenerPosicion();
            pos = { lat: g.coords.latitude, lng: g.coords.longitude };
            $('#d-gps').textContent = '✓ Ubicación adjuntada (precisión ' + Math.round(g.coords.accuracy) + ' m)';
            $('#d-gps').classList.add('ok');
        } catch {
            $('#d-gps').textContent = '⚠ Sin señal GPS. Revisa el permiso de ubicación.';
        }
    };
    $('#d-enviar').onclick = async () => {
        const datos = {
            nombre: $('#d-nombre').value.trim(),
            telefono: $('#d-telefono').value.trim(),
            direccion: $('#d-direccion').value.trim(),
            poblacion: $('#d-poblacion').value.trim(),
        };
        if (!datos.nombre || !datos.telefono || !datos.direccion || !datos.poblacion) {
            $('#d-error').textContent = 'Faltan el nombre, el teléfono, la dirección o la población.';
            return;
        }
        localStorage.setItem('kebat_datos', JSON.stringify(datos));
        $('#d-enviar').disabled = true;
        $('#d-enviar').textContent = 'Enviando…';
        try {
            const r = await fetch(API + '?accion=pedido', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lineas: carrito.map((l) => ({ id: l.id, cant: l.cant, opciones: l.opciones || [] })),
                    ...datos,
                    notas: $('#d-notas').value.trim(),
                    lat: pos?.lat ?? null, lng: pos?.lng ?? null,
                }),
            });
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'No se pudo enviar');
            guardarEnHistorial(j.codigo, totalCarrito());
            carrito = [];
            guardarCarrito();
            localStorage.setItem('kebat_pedido', j.codigo);
            pintarEstado(j.codigo);
        } catch (e) {
            $('#d-error').textContent = '⚠ ' + e.message;
            $('#d-enviar').disabled = false;
            $('#d-enviar').textContent = 'Enviar pedido — ' + eur(totalCarrito());
        }
    };
    window.scrollTo(0, 0);
}

// ---------- mis pedidos (historial del móvil) ----------

// Los últimos 20 pedidos hechos desde este móvil; al picar uno se ve su estado
function guardarEnHistorial(codigo, total) {
    const lista = JSON.parse(localStorage.getItem('kebat_historial') || '[]');
    lista.unshift({ codigo, fecha: new Date().toISOString(), total });
    localStorage.setItem('kebat_historial', JSON.stringify(lista.slice(0, 20)));
}

let desdeMisPedidos = false;        // para que «atrás» desde el estado vuelva a la lista

function pintarMisPedidos() {
    pantalla = 'mis-pedidos';
    desdeMisPedidos = false;
    cabecera('Mis pedidos', true);
    pintarBarraCarrito();
    const lista = JSON.parse(localStorage.getItem('kebat_historial') || '[]');
    if (!lista.length) {
        vista.innerHTML = '<div class="vacio">Aún no has hecho ningún pedido desde este móvil.</div>';
        return;
    }
    vista.innerHTML = lista.map((p, i) => {
        const d = new Date(p.fecha);
        const f = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' +
            d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        return `
        <button class="mp-fila" data-mp="${i}">
            <span class="mp-cod">${esc(p.codigo)}</span>
            <span class="mp-est" data-est="${esc(p.codigo)}"></span>
            <span class="mp-fecha">${f}</span>
            <span class="mp-total">${eur(p.total)}</span>
            <span class="mp-ir">›</span>
        </button>`;
    }).join('');
    // El estado de cada pedido se consulta aparte: colorea la fila al llegar
    const NOMBRE_EST = { nuevo: 'Recibido', cocina: 'En cocina', preparando: 'Preparando', reparto: 'En camino', entregado: 'Entregado', anulado: 'Anulado' };
    lista.forEach(async (p) => {
        try {
            const j = await (await fetch(API + '?accion=estado&codigo=' + encodeURIComponent(p.codigo))).json();
            const s = vista.querySelector('[data-est="' + CSS.escape(p.codigo) + '"]');
            if (!s) return;                             // ya no estamos en esta pantalla
            if (j.ok) { s.textContent = NOMBRE_EST[j.estado] || j.estado; s.classList.add(j.estado); }
        } catch { /* sin red: la fila queda sin etiqueta */ }
    });
    vista.querySelectorAll('[data-mp]').forEach((b) => {
        b.onclick = () => { desdeMisPedidos = true; pintarEstado(lista[b.dataset.mp].codigo); };
    });
    window.scrollTo(0, 0);
}

// ---------- estado del pedido ----------

const PASOS = [
    ['nuevo', 'Pedido recibido'],
    ['cocina', 'En la cocina'],
    ['preparando', 'Preparando el envío'],
    ['reparto', 'En camino 🛵'],
    ['entregado', 'Entregado'],
];

function pintarEstado(codigo, estado) {
    pantalla = 'estado';
    cabecera('Tu pedido', true);
    pintarBarraCarrito();
    const orden = PASOS.findIndex(([e]) => e === estado);
    const anulado = estado === 'anulado';
    vista.innerHTML = `
        <div class="estado-caja">
            <div class="emoji">${anulado ? '😕' : estado === 'entregado' ? '😋' : '🥙'}</div>
            <h2>${anulado ? 'Pedido anulado' : estado === 'entregado' ? '¡Que aproveche!' : '¡Pedido enviado!'}</h2>
            <div class="codigo">Código: <b>${esc(codigo)}</b></div>
            ${anulado ? '<p style="margin-top:10px">Llama al local si tienes dudas.</p>' : `
            <div class="pasos">
                ${PASOS.map(([e, t], i) => `<div class="paso ${i <= orden ? 'hecho' : ''}"><span class="punto"></span>${t}</div>`).join('')}
            </div>`}
            <button class="btn secundario" id="otro" style="margin-top:26px">Hacer otro pedido</button>
        </div>`;
    $('#otro').onclick = () => { localStorage.removeItem('kebat_pedido'); clearInterval(sondeo); pintarCarta(); };
    clearInterval(sondeo);
    if (!anulado && estado !== 'entregado') {
        const mirar = async () => {
            try {
                const j = await (await fetch(API + '?accion=estado&codigo=' + encodeURIComponent(codigo))).json();
                if (j.ok && pantalla === 'estado') pintarEstado(codigo, j.estado);
            } catch { /* sin red: se reintenta en el siguiente sondeo */ }
        };
        if (estado === undefined) mirar();
        sondeo = setInterval(mirar, 20000);
    }
    window.scrollTo(0, 0);
}

// ---------- ajustes ----------
// Versión instalada, buscar actualización y llamar al local.
// Android: el plugin KebatUpdate descarga el APK y abre el instalador.
// iPhone (Ad Hoc): no puede instalarse sola; se lleva a la página de instalación.

const VERSION_WWW = '0.3.1';
const PAGINA_IOS = 'https://descargas.dnns.es/7701cf39d1/kebat-ios/';

// En iPhone la version completa lleva el numero de compilacion (0.3.1.8):
// build.js lo rellena el workflow; en el navegador vale 0 y no se ensena.
const BUILD = Number(window.KEBAT_BUILD) || 0;
function versionCompleta() { return VERSION_WWW + (BUILD ? '.' + BUILD : ''); }

// Hay entrega de iPhone mas nueva? Compara los 4 numeros contra el
// version.json que publica el panel junto al .ipa.
async function hayNuevaIos() {
    const j = await (await fetch(PAGINA_IOS + 'version.json', { cache: 'no-store' })).json();
    const x = String(j.version || '0').split('.').map(Number);
    const y = [...VERSION_WWW.split('.').map(Number), BUILD];
    for (let i = 0; i < 4; i++) {
        if ((x[i] || 0) > (y[i] || 0)) return { nueva: true, version: j.version };
        if ((x[i] || 0) < (y[i] || 0)) break;
    }
    return { nueva: false, version: j.version };
}

function plataforma() { return window.Capacitor?.getPlatform?.() || 'web'; }

// Posición GPS: en el móvil, por el plugin nativo (pide el permiso como toca,
// sobre todo en iPhone, donde el WebView a secas no siempre lo dispara);
// en el navegador, el geolocation de toda la vida.
async function obtenerPosicion() {
    const Geo = window.Capacitor?.Plugins?.Geolocation;
    if (Geo) {
        return await Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    }
    return new Promise((ok, mal) =>
        navigator.geolocation.getCurrentPosition(ok, mal, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }));
}
function pluginUpdate() { return window.Capacitor?.Plugins?.KebatUpdate; }

async function pintarAjustes() {
    pantalla = 'ajustes';
    cabecera('Ajustes', true);
    pintarBarraCarrito();
    let version = versionCompleta();
    try { if (pluginUpdate()) version = (await pluginUpdate().version()).version; } catch { /* la www vale */ }
    const telefono = carta?.telefono || '';
    vista.innerHTML = `
        <div class="tarjeta-aj">
            <div class="aj-fila"><span>Versión instalada</span><b>${esc(version)}</b></div>
            <button class="btn secundario" id="aj-buscar">🔄 Buscar actualización</button>
            <div id="aj-estado" class="aj-estado"></div>
        </div>
        ${telefono ? `
        <div class="tarjeta-aj">
            <div class="aj-fila"><span>¿Dudas con tu pedido?</span></div>
            <a class="btn gps" style="text-align:center;text-decoration:none" href="tel:${esc(telefono)}">📞 Llamar al local</a>
        </div>` : ''}
        <div class="tarjeta-aj">
            <div class="aj-fila"><span>Ubicación</span></div>
            <button class="btn secundario" id="aj-gps">📍 Probar el GPS</button>
            <div id="aj-gps-estado" class="aj-estado"></div>
        </div>
        <p class="aj-pie">Kebat · pedidos a domicilio</p>`;
    $('#aj-buscar').onclick = buscarActualizacion;
    $('#aj-gps').onclick = async () => {
        const e = $('#aj-gps-estado');
        const Geo = window.Capacitor?.Plugins?.Geolocation;
        let txt = 'plataforma: ' + plataforma() + ' · plugin: ' + (Geo ? 'sí' : 'NO');
        try {
            if (Geo?.checkPermissions) txt += ' · permiso: ' + (await Geo.checkPermissions()).location;
            e.textContent = txt + ' · pidiendo posición…';
            const g = await obtenerPosicion();
            e.textContent = txt + ' · ✓ ' + g.coords.latitude.toFixed(5) + ', ' + g.coords.longitude.toFixed(5) +
                ' (±' + Math.round(g.coords.accuracy) + ' m)';
        } catch (err) {
            e.textContent = txt + ' · ⚠ ' + (err.message || err);
        }
    };
    window.scrollTo(0, 0);
}

async function buscarActualizacion() {
    const estado = $('#aj-estado');
    estado.textContent = 'Comprobando…';
    try {
        if (plataforma() === 'android' && pluginUpdate()) {
            const ultima = await pluginUpdate().consultar();
            const puesta = await pluginUpdate().version();
            if ((ultima.versionCode || 0) <= (puesta.versionCode || 0)) {
                estado.textContent = '✓ Tienes la última versión (' + puesta.version + ').';
                return;
            }
            estado.innerHTML = '<button class="btn actualizar" id="aj-actualizar">⬇ Actualizar a la ' + esc(ultima.version) + '</button>';
            $('#aj-actualizar').onclick = async () => {
                estado.textContent = 'Descargando la ' + ultima.version + '… Android te pedirá confirmar.';
                try { await pluginUpdate().instalar({ url: ultima.url || ultima.apk, sha256: ultima.sha256 }); }
                catch (e) { estado.textContent = '⚠ ' + e.message; }
            };
        } else if (plataforma() === 'ios') {
            const r = await hayNuevaIos();
            if (!r.nueva) {
                estado.textContent = '✓ Tienes la última versión (' + versionCompleta() + ').';
            } else {
                estado.innerHTML = '<a class="btn actualizar" href="' + PAGINA_IOS + '" target="_blank" rel="noopener">⬇ Actualizar a la ' + esc(r.version) + '</a>';
            }
        } else {
            estado.textContent = 'En el navegador no hace falta: siempre ves la última.';
        }
    } catch (e) {
        estado.textContent = '⚠ ' + (e.message || 'No se pudo comprobar.');
    }
}
const SERVIDOR_DESCARGAS_LATEST = 'https://descargas.dnns.es/qqpk519rg6/kebat/latest.json';

$('#ajustes').onclick = pintarAjustes;
$('#mis-pedidos').onclick = () => { clearInterval(sondeo); clearInterval(repSondeo); pintarMisPedidos(); };

// ---------- modo repartidor ----------
// Oculto para clientes: 5 toques en el título. Usa la clave del panel del local.
// Enseña los pedidos en preparación/reparto a pantalla completa con lo que
// necesita el repartidor: dirección, notas, llamar, Maps y marcar entregado.

let repToken = localStorage.getItem('kebat_rep_token') || '';
let repSondeo = null;

async function apiPanel(accion, datos) {
    const r = await fetch(API_PANEL + '?accion=' + accion, {
        method: datos ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + repToken },
        body: datos ? JSON.stringify(datos) : undefined,
    });
    const j = await r.json().catch(() => ({ ok: false, error: 'Respuesta no válida' }));
    if (r.status === 401 && accion !== 'entrar') {
        repToken = '';
        localStorage.removeItem('kebat_rep_token');
        throw new Error('Sesión caducada: vuelve a entrar');
    }
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
}

function repEntrar() {
    pantalla = 'repartidor';
    cabecera('Repartidor', true);
    pintarBarraCarrito();
    vista.innerHTML = `
        <div class="campo"><label>Usuario</label><input id="r-usuario" value="kebat"></div>
        <div class="campo"><label>Clave del panel</label><input id="r-clave" type="password"></div>
        <button class="btn principal" id="r-entrar">Entrar</button>
        <div id="r-error" class="error-red" style="padding:10px"></div>`;
    $('#r-entrar').onclick = async () => {
        try {
            const j = await apiPanel('entrar', { usuario: $('#r-usuario').value.trim(), clave: $('#r-clave').value });
            repToken = j.token;
            localStorage.setItem('kebat_rep_token', repToken);
            pintarRepartidor();
        } catch (e) { $('#r-error').textContent = '⚠ ' + e.message; }
    };
}

async function pintarRepartidor() {
    pantalla = 'repartidor';
    cabecera('Repartos', true);
    pintarBarraCarrito();
    clearInterval(repSondeo);
    repSondeo = setInterval(() => { if (pantalla === 'repartidor') pintarRepartidor(); }, 15000);
    let pedidos, numRep = 1;
    try {
        const j = await apiPanel('pedidos');
        numRep = j.repartidores || 1;
        pedidos = j.pedidos.filter((p) => ['preparando', 'reparto'].includes(p.estado));
    } catch (e) {
        clearInterval(repSondeo);
        if (String(e.message).includes('entrar')) return repEntrar();
        vista.innerHTML = `<div class="error-red">⚠ ${esc(e.message)}</div>`;
        return;
    }
    if (pantalla !== 'repartidor') return;
    const salir = `<button class="btn secundario" id="r-salir" style="margin-top:18px">Salir del modo repartidor</button>`;
    if (!pedidos.length) {
        vista.innerHTML = '<div class="vacio">Sin repartos pendientes ahora mismo.<br>Esta pantalla se refresca sola.</div>' + salir;
    } else {
        vista.innerHTML = pedidos.map((p) => `
        <div class="rep-card ${p.estado}">
            <div class="rep-cab">
                <b>${esc(p.codigo)}</b>
                <span class="etiqueta-rep">${p.estado === 'reparto' ? '🛵 En reparto' : '📦 Listo para llevar'}</span>
                <span class="rep-total">${eur(p.total)}</span>
            </div>
            <div class="rep-dir">📍 ${esc(p.direccion)}${p.poblacion ? ', ' + esc(p.poblacion) : ''}</div>
            ${p.notas ? `<div class="rep-notas">📝 ${esc(p.notas)}</div>` : ''}
            <div class="rep-cli">👤 ${esc(p.nombre)}</div>
            <div class="rep-botones">
                <a class="btn tel-grande" href="tel:${esc(p.telefono)}">📞 Llamar</a>
                ${p.lat != null && p.lng != null
                    ? `<a class="btn maps-grande" href="geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}(Pedido ${esc(p.codigo)})">🗺 Maps</a>`
                    : `<a class="btn maps-grande" href="geo:0,0?q=${encodeURIComponent(p.direccion)}">🗺 Maps</a>`}
            </div>
            ${p.estado === 'reparto'
                ? `<button class="btn entregado" data-rep="${p.id}" data-est="entregado">✓ Entregado</button>`
                : `<button class="btn llevar" data-rep="${p.id}" data-est="reparto">🛵 Lo llevo yo</button>`}
        </div>`).join('') + salir;
        vista.querySelectorAll('[data-rep]').forEach((b) => {
            b.onclick = async () => {
                // Aviso anti-olvidos: no llevarse uno dejando atrás otro más antiguo listo.
                // Con varios repartidores solo avisa si no queda otro libre para el antiguo.
                if (b.dataset.est === 'reparto') {
                    const p = pedidos.find((x) => x.id === parseInt(b.dataset.rep));
                    const antes = pedidos.find((x) => x.estado === 'preparando' && x.id !== p.id && new Date(x.fecha) < new Date(p.fecha));
                    const libres = numRep - pedidos.filter((x) => x.estado === 'reparto').length;
                    if (antes && libres <= 1 && !confirm('Ojo: el ' + antes.codigo + ' lleva más tiempo esperando.\n¿Seguro que te llevas este primero?')) return;
                }
                b.disabled = true;
                try { await apiPanel('estado', { id: parseInt(b.dataset.rep), estado: b.dataset.est }); pintarRepartidor(); }
                catch (e) { alert(e.message); b.disabled = false; }
            };
        });
    }
    $('#r-salir').onclick = () => {
        repToken = '';
        localStorage.removeItem('kebat_rep_token');
        clearInterval(repSondeo);
        pintarCarta();
    };
    window.scrollTo(0, 0);
}

// 5 toques en el título en menos de 3 segundos abren el modo repartidor
let toquesTitulo = [];
$('#titulo').addEventListener('click', () => {
    const ahora = Date.now();
    toquesTitulo = toquesTitulo.filter((t) => ahora - t < 3000);
    toquesTitulo.push(ahora);
    if (toquesTitulo.length >= 5) {
        toquesTitulo = [];
        repToken ? pintarRepartidor() : repEntrar();
    }
});

// ---------- navegación ----------

$('#atras').onclick = () => atras();
barraCarrito.onclick = pintarCarrito;

function atras() {
    if (pantalla === 'estado' && desdeMisPedidos) { clearInterval(sondeo); pintarMisPedidos(); return true; }
    if (pantalla === 'carrito' || pantalla === 'estado') { clearInterval(sondeo); pintarCarta(); return true; }
    if (pantalla === 'datos') { pintarCarrito(); return true; }
    if (pantalla === 'ajustes' || pantalla === 'mis-pedidos') { pintarCarta(); return true; }
    if (pantalla === 'repartidor') { clearInterval(repSondeo); pintarCarta(); return true; }
    return false;           // en la carta: Android manda la app a segundo plano
}

// Al abrir la app: si hay versión nueva, franja verde bajo la cabecera.
// Android: al tocarla descarga e instala. iPhone: abre la página de instalación.
async function avisarActualizacionAlAbrir() {
    const franja = document.getElementById('aviso-act');
    try {
        if (plataforma() === 'android' && pluginUpdate()) {
            const ultima = await pluginUpdate().consultar();
            const puesta = await pluginUpdate().version();
            if ((ultima.versionCode || 0) <= (puesta.versionCode || 0)) return;
            franja.textContent = '⬇ Hay versión nueva (' + ultima.version + '). Toca para actualizar';
            franja.hidden = false;
            franja.onclick = async () => {
                franja.textContent = 'Descargando… Android te pedirá confirmar.';
                try { await pluginUpdate().instalar({ url: ultima.url || ultima.apk, sha256: ultima.sha256 }); }
                catch (e) { franja.textContent = '⚠ ' + e.message; }
            };
        } else if (plataforma() === 'ios') {
            const r = await hayNuevaIos();
            if (!r.nueva) return;
            franja.textContent = '⬇ Hay versión nueva (' + r.version + '). Toca para actualizar';
            franja.hidden = false;
            franja.onclick = () => window.open(PAGINA_IOS, '_blank');
        }
    } catch { /* sin red o sin datos: no se molesta */ }
}

// El botón atrás de Android llama aquí (ver MainActivity.java)
const App = { atras };

// Al volver a la app, refrescar lo que toque
document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (pantalla === 'carta') cargarCarta();
});

// Arranque: si hay un pedido en marcha, directo a su estado
const pendiente = localStorage.getItem('kebat_pedido');
(async () => {
    await cargarCarta();
    if (pendiente && carta) pintarEstado(pendiente);
    // Permiso de ubicación al primer arranque (el sistema no deja pedirlo al
    // instalar): así al enviar el pedido ya está concedido y no corta el paso
    avisarActualizacionAlAbrir();
    if (!localStorage.getItem('kebat_gps_pedido2')) {
        localStorage.setItem('kebat_gps_pedido2', '1');
        try { await obtenerPosicion(); } catch { /* si lo deniega, el formulario lo reintenta */ }
    }
})();
