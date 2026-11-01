// Fecha: 2026-11-01
// Ruta: F:\APP\kebat\herramientas\gradle.mjs
// Lanza Gradle desde un script de npm con el JDK y el SDK de Android de F:\APP\_tools
// Por qué existe: sin JAVA_HOME ni ANDROID_HOME en el sistema, Gradle falla con errores
// que suenan a problema de Android cuando solo es que no encuentra Java o el SDK.
// Uso:  node herramientas/gradle.mjs assembleDebug

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(RAIZ, 'android');

const tareas = process.argv.slice(2);
if (!tareas.length) {
    console.error('Falta la tarea. Ejemplo: node herramientas/gradle.mjs assembleDebug');
    process.exit(1);
}

const jdk = [process.env.JAVA_HOME, 'F:\\APP\\_tools\\jdk21']
    .filter(Boolean)
    .find((p) => existsSync(join(p, 'bin', 'java.exe')));
if (!jdk) {
    console.error('No se encuentra un JDK. Pon JAVA_HOME o instala uno en F:\\APP\\_tools\\jdk21.');
    process.exit(1);
}

const sdk = [process.env.ANDROID_HOME, 'F:\\APP\\_tools\\Android\\Sdk']
    .filter(Boolean)
    .find((p) => existsSync(p));
if (!sdk) {
    console.error('No se encuentra el SDK de Android. Pon ANDROID_HOME o usa F:\\APP\\_tools\\Android\\Sdk.');
    process.exit(1);
}

// Gradle lee la ruta del SDK de local.properties (con las barras escapadas)
writeFileSync(join(ANDROID, 'local.properties'), 'sdk.dir=' + sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:') + '\n');

const r = spawnSync(join(ANDROID, 'gradlew.bat'), tareas, {
    cwd: ANDROID,
    env: {
        ...process.env,
        JAVA_HOME: jdk,
        ANDROID_HOME: sdk,
        GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || 'F:\\APP\\_tools\\gradle-home',
    },
    stdio: 'inherit',
    shell: true,      // gradlew.bat necesita intérprete de comandos
});
process.exit(r.status ?? 1);
