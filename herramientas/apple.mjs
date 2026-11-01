// Fecha: 2026-11-01
// Ruta: F:\APP\kebat\herramientas\apple.mjs
// Alta en Apple Developer (vía API de App Store Connect) de lo que necesita la app Kebat:
//   1. el bundle ID es.dnns.kebat, 2. el perfil de distribución «Kebat App Store».
// Deja el .mobileprovision en salida/ para meterlo como secreto APPLE_PROFILE del repo.
// La clave de la API vive en F:\APP\koberlet-android\.keys (no se copia a ningún sitio).

import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';

const KEYS = 'F:\\APP\\koberlet-android\\.keys';
const KEY_ID = 'W82Q6BYRMM';
const ISSUER = 'fb2ddf53-8932-4437-a746-9430581b83b4';
const API = 'https://api.appstoreconnect.apple.com';

const b64u = (d) => Buffer.from(d).toString('base64url');

// JWT ES256 a mano con node:crypto (dsaEncoding ieee-p1363 = firma cruda r||s que pide JWT)
function jwt() {
    const clave = createPrivateKey(readFileSync(`${KEYS}\\AuthKey_${KEY_ID}.p8`));
    const cab = b64u(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
    const ahora = Math.floor(Date.now() / 1000);
    const cuerpo = b64u(JSON.stringify({ iss: ISSUER, iat: ahora, exp: ahora + 900, aud: 'appstoreconnect-v1' }));
    const firma = sign('sha256', Buffer.from(cab + '.' + cuerpo), { key: clave, dsaEncoding: 'ieee-p1363' });
    return cab + '.' + cuerpo + '.' + firma.toString('base64url');
}

async function api(metodo, ruta, cuerpo) {
    const r = await fetch(API + ruta, {
        method: metodo,
        headers: { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const j = r.status === 204 ? null : await r.json();
    if (!r.ok) throw new Error(ruta + ' -> ' + r.status + ': ' + JSON.stringify(j?.errors?.[0] || j).slice(0, 300));
    return j;
}

// 1. Bundle ID es.dnns.kebat (si ya existe, se reutiliza)
let bundle = (await api('GET', '/v1/bundleIds?filter[identifier]=es.dnns.kebat')).data
    .find((b) => b.attributes.identifier === 'es.dnns.kebat');
if (!bundle) {
    bundle = (await api('POST', '/v1/bundleIds', {
        data: { type: 'bundleIds', attributes: { identifier: 'es.dnns.kebat', name: 'Kebat', platform: 'IOS' } },
    })).data;
    console.log('Bundle creado:', bundle.id);
} else {
    console.log('Bundle ya existía:', bundle.id);
}

// 2. Certificado de distribución vigente
const certs = (await api('GET', '/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=10')).data
    .filter((c) => new Date(c.attributes.expirationDate) > new Date());
if (!certs.length) throw new Error('No hay certificado Apple Distribution vigente');
console.log('Certificado:', certs[0].id, 'caduca', certs[0].attributes.expirationDate);

// 3. Perfil «Kebat App Store» (si ya existe se borra y se rehace, así nunca está caducado)
const viejos = (await api('GET', '/v1/profiles?filter[name]=Kebat%20App%20Store')).data || [];
for (const v of viejos) { await api('DELETE', '/v1/profiles/' + v.id); console.log('Perfil viejo borrado'); }
const perfil = (await api('POST', '/v1/profiles', {
    data: {
        type: 'profiles',
        attributes: { name: 'Kebat App Store', profileType: 'IOS_APP_STORE' },
        relationships: {
            bundleId: { data: { type: 'bundleIds', id: bundle.id } },
            certificates: { data: [{ type: 'certificates', id: certs[0].id }] },
        },
    },
})).data;
writeFileSync('salida/Kebat_App_Store.mobileprovision', Buffer.from(perfil.attributes.profileContent, 'base64'));
console.log('Perfil creado y guardado en salida/Kebat_App_Store.mobileprovision');
