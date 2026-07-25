const admin = require('firebase-admin');

let firestoreDb = null;
let initialized = false;

// Inicializa Firebase Admin usando la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON,
// que debe contener el JSON completo de la cuenta de servicio (como una sola línea de texto).
function init() {
    if (initialized) return;

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        throw new Error(
            'Falta FIREBASE_SERVICE_ACCOUNT_JSON en las variables de entorno. ' +
            'Pega ahí el JSON de la cuenta de servicio de Firebase (Configuración del proyecto > Cuentas de servicio > Generar nueva clave privada).'
        );
    }

    let serviceAccount;
    try {
        serviceAccount = JSON.parse(raw);
    } catch (err) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no es un JSON válido: ' + err.message);
    }

    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`;

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket
    });

    firestoreDb = admin.firestore();
    initialized = true;
}

function getFirestore() {
    init();
    return firestoreDb;
}

function getBucket() {
    init();
    return admin.storage().bucket();
}

module.exports = { getFirestore, getBucket, admin };
