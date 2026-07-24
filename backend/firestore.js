const admin = require('firebase-admin');

let firestoreDb = null;

// Inicializa Firebase Admin usando la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON,
// que debe contener el JSON completo de la cuenta de servicio (como una sola línea de texto).
function initFirestore() {
    if (firestoreDb) return firestoreDb;

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

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    firestoreDb = admin.firestore();
    return firestoreDb;
}

function getFirestore() {
    if (!firestoreDb) return initFirestore();
    return firestoreDb;
}

module.exports = { initFirestore, getFirestore, admin };
