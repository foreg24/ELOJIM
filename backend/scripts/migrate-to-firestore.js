// Migra el contenido de backend/database/db.json (el JSON local usado antes) a Firestore.
// Uso: desde backend/, con FIREBASE_SERVICE_ACCOUNT_JSON configurado (en .env o en el entorno):
//   node scripts/migrate-to-firestore.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getFirestore } = require('../firestore');

const DB_FILE = path.join(__dirname, '..', 'database', 'db.json');

async function migrarColeccion(db, nombre, items) {
    if (!Array.isArray(items) || items.length === 0) {
        console.log(`- ${nombre}: nada que migrar`);
        return;
    }
    const batch = db.batch();
    items.forEach(item => {
        const { id, ...data } = item;
        const ref = db.collection(nombre).doc(id);
        batch.set(ref, data, { merge: true });
    });
    await batch.commit();
    console.log(`- ${nombre}: ${items.length} documento(s) migrado(s)`);
}

async function migrarRedes(db, redes) {
    if (!redes || Object.keys(redes).length === 0) {
        console.log('- redes: nada que migrar');
        return;
    }
    await db.collection('config').doc('redes').set(redes, { merge: true });
    console.log('- redes: migradas');
}

async function main() {
    if (!fs.existsSync(DB_FILE)) {
        console.log(`No se encontró ${DB_FILE}. No hay nada que migrar.`);
        return;
    }

    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const db = getFirestore();

    console.log('Migrando datos locales a Firestore...');
    await migrarColeccion(db, 'trabajadores', raw.trabajadores);
    await migrarColeccion(db, 'eventos', raw.eventos);
    await migrarColeccion(db, 'noticias', raw.noticias);
    await migrarColeccion(db, 'contactos', raw.contactos);
    await migrarRedes(db, raw.redes);
    console.log('Migración completada.');
}

main().catch(err => {
    console.error('Error migrando a Firestore:', err);
    process.exit(1);
});
