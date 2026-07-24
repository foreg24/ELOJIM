const { v4: uuidv4 } = require('uuid');
const { getFirestore } = require('./firestore');

// Colecciones de Firestore. Usamos IDs propios (uuid) como ID de documento
// para que las URLs, referencias e imágenes migradas desde db.json sigan siendo válidas.
const COLLECTIONS = {
    trabajadores: 'trabajadores',
    eventos: 'eventos',
    noticias: 'noticias',
    contactos: 'contactos'
};
const REDES_COLLECTION = 'config';
const REDES_DOC_ID = 'redes';

const stripId = (doc) => {
    const data = doc.data();
    return { id: doc.id, ...data };
};

async function getAll(collection) {
    const snap = await getFirestore().collection(collection).get();
    return snap.docs.map(stripId);
}

async function getById(collection, id) {
    const doc = await getFirestore().collection(collection).doc(id).get();
    if (!doc.exists) return null;
    return stripId(doc);
}

async function create(collection, data, id = uuidv4()) {
    await getFirestore().collection(collection).doc(id).set(data);
    return { id, ...data };
}

async function update(collection, id, data) {
    const ref = getFirestore().collection(collection).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;
    await ref.set(data, { merge: true });
    const updated = await ref.get();
    return stripId(updated);
}

async function remove(collection, id) {
    await getFirestore().collection(collection).doc(id).delete();
}

async function getRedes() {
    const doc = await getFirestore().collection(REDES_COLLECTION).doc(REDES_DOC_ID).get();
    return doc.exists ? doc.data() : {};
}

async function setRedPlataforma(plataforma, data) {
    const ref = getFirestore().collection(REDES_COLLECTION).doc(REDES_DOC_ID);
    await ref.set({ [plataforma]: data }, { merge: true });
    const updated = await ref.get();
    return updated.data()[plataforma];
}

module.exports = {
    COLLECTIONS,
    getAll,
    getById,
    create,
    update,
    remove,
    getRedes,
    setRedPlataforma
};
