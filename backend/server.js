const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = '12345'; // Escribe cualquier cosa aquí
const ADMIN_EMAIL = 'admin@correo.com'; // Pon el correo que quieras usar
const ADMIN_PASSWORD = 'admin'; // Pon la contraseña que quieras usar

// Middleware PRIMERO (antes de todo)
app.use(cors());
app.use(express.json());

// Crear carpetas si no existen
const uploadsDir = path.join(__dirname, '../uploads');
const dataDir = path.join(__dirname, 'database');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Configuración de multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Database helper
const DB_FILE = path.join(dataDir, 'db.json');
const getDB = () => {
    if (!fs.existsSync(DB_FILE)) {
        return { trabajadores: [], eventos: [], noticias: [], contactos: [], redes: {} };
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Inicializar DB
const initDB = () => {
    const db = getDB();
    if (Object.keys(db).length === 0 || !db.trabajadores) {
        saveDB({
            trabajadores: [
                { id: uuidv4(), nombre: 'María González', rol: 'Directora Ejecutiva', email: 'maria@elojim.org' },
                { id: uuidv4(), nombre: 'Carlos Ruiz', rol: 'Coordinador de Proyectos', email: 'carlos@elojim.org' }
            ],
            eventos: [],
            noticias: [],
            contactos: [],
            redes: {
                facebook: { url: 'https://facebook.com/elojim', usuario: 'elojim', password: '********' },
                instagram: { url: 'https://instagram.com/elojim', usuario: '@elojim', password: '********' },
                twitter: { url: 'https://twitter.com/elojim', usuario: '@elojim', password: '********' },
                tiktok: { url: 'https://tiktok.com/@elojim', usuario: '@elojim', password: '********' }
            }
        });
    }
};
initDB();

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requerido' });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido' });
    }
};

// ============================================
// RUTAS API - ANTES de archivos estáticos
// ============================================

// AUTH
app.post('/api/login', (req, res) => {
    console.log('Login attempt:', req.body);
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y password requeridos' });
    }
    
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
        console.log('Credenciales incorrectas');
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    
    const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    console.log('Login exitoso');
    res.json({ token, user: { email, role: 'admin' } });
});

app.get('/api/verify', authMiddleware, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// TRABAJADORES
app.get('/api/trabajadores', authMiddleware, (req, res) => {
    const db = getDB();
    res.json(db.trabajadores);
});

app.post('/api/trabajadores', authMiddleware, (req, res) => {
    const db = getDB();
    const nuevo = { id: uuidv4(), ...req.body };
    db.trabajadores.push(nuevo);
    saveDB(db);
    res.json(nuevo);
});

app.put('/api/trabajadores/:id', authMiddleware, (req, res) => {
    const db = getDB();
    const idx = db.trabajadores.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
    
    db.trabajadores[idx] = { ...db.trabajadores[idx], ...req.body };
    saveDB(db);
    res.json(db.trabajadores[idx]);
});

app.delete('/api/trabajadores/:id', authMiddleware, (req, res) => {
    const db = getDB();
    db.trabajadores = db.trabajadores.filter(t => t.id !== req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// REDES
app.get('/api/redes', authMiddleware, (req, res) => {
    const db = getDB();
    res.json(db.redes);
});

app.put('/api/redes/:plataforma', authMiddleware, (req, res) => {
    const db = getDB();
    db.redes[req.params.plataforma] = req.body;
    saveDB(db);
    res.json(db.redes[req.params.plataforma]);
});

// EVENTOS
app.get('/api/eventos', (req, res) => {
    const db = getDB();
    const { pasados } = req.query;
    const ahora = new Date();
    
    let eventos = db.eventos;
    if (pasados === 'true') {
        eventos = eventos.filter(e => new Date(e.fechaFin || e.fecha) < ahora);
    } else if (pasados === 'false') {
        eventos = eventos.filter(e => new Date(e.fechaFin || e.fecha) >= ahora);
    }
    
    res.json(eventos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)));
});

app.post('/api/eventos', authMiddleware, upload.single('imagen'), (req, res) => {
    const db = getDB();
    const evento = {
        id: uuidv4(),
        ...req.body,
        imagen: req.file ? `/uploads/${req.file.filename}` : null,
        fecha: req.body.fecha,
        horaInicio: req.body.horaInicio,
        horaFin: req.body.horaFin
    };
    db.eventos.push(evento);
    saveDB(db);
    res.json(evento);
});

app.put('/api/eventos/:id', authMiddleware, upload.single('imagen'), (req, res) => {
    const db = getDB();
    const idx = db.eventos.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
    
    const updateData = { ...req.body };
    if (req.file) updateData.imagen = `/uploads/${req.file.filename}`;
    
    db.eventos[idx] = { ...db.eventos[idx], ...updateData };
    saveDB(db);
    res.json(db.eventos[idx]);
});

app.delete('/api/eventos/:id', authMiddleware, (req, res) => {
    const db = getDB();
    db.eventos = db.eventos.filter(e => e.id !== req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// NOTICIAS
app.get('/api/noticias', (req, res) => {
    const db = getDB();
    const { publicadas, buscar } = req.query;
    
    let noticias = db.noticias;
    
    // Filtrar solo publicadas y no ocultas
    if (publicadas === 'true') {
        noticias = noticias.filter(n => n.publicada && !n.oculta);
    }
    
    // Búsqueda por título o autor
    if (buscar) {
        const termino = buscar.toLowerCase();
        noticias = noticias.filter(n => {
            const tituloMatch = n.titulo.toLowerCase().includes(termino);
            const autorMatch = Array.isArray(n.autores) 
                ? n.autores.some(a => a.toLowerCase().includes(termino))
                : (n.autores || '').toLowerCase().includes(termino);
            return tituloMatch || autorMatch;
        });
    }
    
    res.json(noticias.sort((a, b) => new Date(b.fechaPublicacion) - new Date(a.fechaPublicacion)));
});

app.get('/api/noticias/:slug', (req, res) => {
    const db = getDB();
    const noticia = db.noticias.find(n => n.slug === req.params.slug && n.publicada && !n.oculta);
    if (!noticia) return res.status(404).json({ error: 'No encontrada' });
    res.json(noticia);
});

app.post('/api/noticias', authMiddleware, upload.array('imagenes', 5), (req, res) => {
    const db = getDB();
    
    // Procesar autores (string separado por comas → array)
    let autores = [];
    if (req.body.autores) {
        autores = req.body.autores.split(',').map(a => a.trim()).filter(a => a);
    }
    
    // Procesar enlaces (string con saltos de línea → array)
    let enlaces = [];
    if (req.body.enlaces) {
        try {
            enlaces = JSON.parse(req.body.enlaces);
        } catch {
            enlaces = req.body.enlaces.split('\n').map(e => e.trim()).filter(e => e);
        }
    }
    
    const imagenes = req.files ? req.files.map(f => ({
        url: `/uploads/${f.filename}`,
        link: req.body[`link_${f.filename}`] || null
    })) : [];
    
    const noticia = {
        id: uuidv4(),
        slug: req.body.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        titulo: req.body.titulo,
        contenido: req.body.contenido,
        autores: autores,
        enlaces: enlaces,
        imagenes: imagenes,
        fechaPublicacion: new Date().toISOString(),
        publicada: req.body.publicada === 'true',
        oculta: false
    };
    
    db.noticias.push(noticia);
    saveDB(db);
    res.json(noticia);
});

app.put('/api/noticias/:id', authMiddleware, upload.array('imagenes', 5), (req, res) => {
    const db = getDB();
    const idx = db.noticias.findIndex(n => n.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
    
    const updateData = { ...req.body };
    
    // Procesar autores si vienen en el update
    if (req.body.autores) {
        updateData.autores = req.body.autores.split(',').map(a => a.trim()).filter(a => a);
    }
    
    // Procesar enlaces si vienen en el update
    if (req.body.enlaces) {
        try {
            updateData.enlaces = JSON.parse(req.body.enlaces);
        } catch {
            updateData.enlaces = req.body.enlaces.split('\n').map(e => e.trim()).filter(e => e);
        }
    }
    
    if (req.files && req.files.length > 0) {
        updateData.imagenes = req.files.map(f => ({
            url: `/uploads/${f.filename}`,
            link: req.body[`link_${f.filename}`] || null
        }));
    }
    
    db.noticias[idx] = { ...db.noticias[idx], ...updateData };
    saveDB(db);
    res.json(db.noticias[idx]);
});

app.delete('/api/noticias/:id', authMiddleware, (req, res) => {
    const db = getDB();
    db.noticias = db.noticias.filter(n => n.id !== req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// CONTACTOS
app.post('/api/contactos', (req, res) => {
    const db = getDB();
    const contacto = {
        id: uuidv4(),
        ...req.body,
        fecha: new Date().toISOString(),
        leido: false,
        respondido: false
    };
    db.contactos.push(contacto);
    saveDB(db);
    res.json({ success: true, id: contacto.id });
});

app.get('/api/contactos', authMiddleware, (req, res) => {
    const db = getDB();
    const { leido } = req.query;
    
    let contactos = db.contactos;
    if (leido !== undefined) {
        contactos = contactos.filter(c => c.leido === (leido === 'true'));
    }
    
    res.json(contactos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
});

app.put('/api/contactos/:id/leido', authMiddleware, (req, res) => {
    const db = getDB();
    const idx = db.contactos.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
    
    db.contactos[idx].leido = req.body.leido;
    saveDB(db);
    res.json(db.contactos[idx]);
});

app.delete('/api/contactos/:id', authMiddleware, (req, res) => {
    const db = getDB();
    db.contactos = db.contactos.filter(c => c.id !== req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// ============================================
// ARCHIVOS ESTÁTICOS - DESPUÉS de las rutas API
// ============================================

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, '..')));

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📁 Admin: http://localhost:${PORT}/admin.html`);
    console.log(`🏠 Home: http://localhost:${PORT}/index.html`);
});
