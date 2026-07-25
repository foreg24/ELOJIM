const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getBucket } = require('./firestore');

// Sube un archivo (buffer en memoria, de multer) a Firebase Storage y devuelve
// una URL pública y permanente con el mismo formato que usa el SDK de Firebase.
async function subirArchivo(file, carpeta = 'uploads') {
    if (!file) return null;

    const bucket = getBucket();
    const nombreArchivo = `${carpeta}/${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    const token = uuidv4();
    const blob = bucket.file(nombreArchivo);

    await blob.save(file.buffer, {
        contentType: file.mimetype,
        metadata: {
            metadata: { firebaseStorageDownloadTokens: token }
        }
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(nombreArchivo)}?alt=media&token=${token}`;
}

module.exports = { subirArchivo };
