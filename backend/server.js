const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_ROOT = path.join(__dirname, '..');

// Middleware PRIMERO (antes de todo)
app.use(cors());
app.use(express.json());

// Crear carpeta de uploads si no existe
const uploadsDir = path.join(SITE_ROOT, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Configuración de multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

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

// Envuelve handlers async para reenviar errores a un 500 consistente
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const slugify = (titulo) => titulo.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Normaliza los enlaces destacados a { url, nombre }, aceptando también el formato antiguo (string suelto)
const normalizarEnlaces = (raw) => {
    let enlaces = [];
    if (!raw) return enlaces;
    try {
        enlaces = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        enlaces = String(raw).split('\n').map(e => e.trim()).filter(Boolean);
    }
    if (!Array.isArray(enlaces)) return [];
    return enlaces
        .map(e => {
            if (typeof e === 'string') return { url: e.trim(), nombre: '' };
            if (e && typeof e === 'object') return { url: (e.url || '').trim(), nombre: (e.nombre || '').trim() };
            return null;
        })
        .filter(e => e && e.url);
};

// ============================================
// RUTAS API - ANTES de archivos estáticos
// ============================================

// AUTH
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y password requeridos' });
    }

    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { email, role: 'admin' } });
});

app.get('/api/verify', authMiddleware, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// TRABAJADORES
app.get('/api/trabajadores', authMiddleware, asyncHandler(async (req, res) => {
    res.json(await db.getAll(db.COLLECTIONS.trabajadores));
}));

app.post('/api/trabajadores', authMiddleware, asyncHandler(async (req, res) => {
    res.json(await db.create(db.COLLECTIONS.trabajadores, req.body));
}));

app.put('/api/trabajadores/:id', authMiddleware, asyncHandler(async (req, res) => {
    const actualizado = await db.update(db.COLLECTIONS.trabajadores, req.params.id, req.body);
    if (!actualizado) return res.status(404).json({ error: 'No encontrado' });
    res.json(actualizado);
}));

app.delete('/api/trabajadores/:id', authMiddleware, asyncHandler(async (req, res) => {
    await db.remove(db.COLLECTIONS.trabajadores, req.params.id);
    res.json({ success: true });
}));

// REDES
app.get('/api/redes', authMiddleware, asyncHandler(async (req, res) => {
    res.json(await db.getRedes());
}));

app.put('/api/redes/:plataforma', authMiddleware, asyncHandler(async (req, res) => {
    res.json(await db.setRedPlataforma(req.params.plataforma, req.body));
}));

// EVENTOS
app.get('/api/eventos', asyncHandler(async (req, res) => {
    const { pasados } = req.query;
    const ahora = new Date();

    let eventos = await db.getAll(db.COLLECTIONS.eventos);
    if (pasados === 'true') {
        eventos = eventos.filter(e => new Date(e.fechaFin || e.fecha) < ahora);
    } else if (pasados === 'false') {
        eventos = eventos.filter(e => new Date(e.fechaFin || e.fecha) >= ahora);
    }

    res.json(eventos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)));
}));

app.post('/api/eventos', authMiddleware, upload.single('imagen'), asyncHandler(async (req, res) => {
    const evento = {
        ...req.body,
        imagen: req.file ? `/uploads/${req.file.filename}` : null,
        fecha: req.body.fecha,
        horaInicio: req.body.horaInicio,
        horaFin: req.body.horaFin
    };
    res.json(await db.create(db.COLLECTIONS.eventos, evento));
}));

app.put('/api/eventos/:id', authMiddleware, upload.single('imagen'), asyncHandler(async (req, res) => {
    const updateData = { ...req.body };
    if (req.file) updateData.imagen = `/uploads/${req.file.filename}`;

    const actualizado = await db.update(db.COLLECTIONS.eventos, req.params.id, updateData);
    if (!actualizado) return res.status(404).json({ error: 'No encontrado' });
    res.json(actualizado);
}));

app.delete('/api/eventos/:id', authMiddleware, asyncHandler(async (req, res) => {
    await db.remove(db.COLLECTIONS.eventos, req.params.id);
    res.json({ success: true });
}));

// NOTICIAS
app.get('/api/noticias', asyncHandler(async (req, res) => {
    const { publicadas, buscar } = req.query;

    let noticias = await db.getAll(db.COLLECTIONS.noticias);

    if (publicadas === 'true') {
        noticias = noticias.filter(n => n.publicada && !n.oculta);
    }

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
}));

app.get('/api/noticias/:slug', asyncHandler(async (req, res) => {
    const noticias = await db.getAll(db.COLLECTIONS.noticias);
    const noticia = noticias.find(n => n.slug === req.params.slug && n.publicada && !n.oculta);
    if (!noticia) return res.status(404).json({ error: 'No encontrada' });
    res.json(noticia);
}));

app.post('/api/noticias', authMiddleware, upload.array('imagenes', 5), asyncHandler(async (req, res) => {
    let autores = [];
    if (req.body.autores) {
        autores = req.body.autores.split(',').map(a => a.trim()).filter(a => a);
    }

    const enlaces = normalizarEnlaces(req.body.enlaces);

    const imagenes = req.files ? req.files.map(f => ({
        url: `/uploads/${f.filename}`,
        link: req.body[`link_${f.filename}`] || null
    })) : [];

    const noticia = {
        slug: slugify(req.body.titulo),
        titulo: req.body.titulo,
        contenido: req.body.contenido,
        autores,
        enlaces,
        imagenes,
        fechaPublicacion: new Date().toISOString(),
        publicada: req.body.publicada === 'true',
        oculta: false
    };

    res.json(await db.create(db.COLLECTIONS.noticias, noticia));
}));

app.put('/api/noticias/:id', authMiddleware, upload.array('imagenes', 5), asyncHandler(async (req, res) => {
    const updateData = { ...req.body };

    if (req.body.titulo) updateData.slug = slugify(req.body.titulo);

    if (req.body.autores) {
        updateData.autores = req.body.autores.split(',').map(a => a.trim()).filter(a => a);
    }

    if (req.body.enlaces !== undefined) {
        updateData.enlaces = normalizarEnlaces(req.body.enlaces);
    }

    if (req.files && req.files.length > 0) {
        updateData.imagenes = req.files.map(f => ({
            url: `/uploads/${f.filename}`,
            link: req.body[`link_${f.filename}`] || null
        }));
    }

    if (updateData.publicada !== undefined) updateData.publicada = updateData.publicada === 'true';

    const actualizada = await db.update(db.COLLECTIONS.noticias, req.params.id, updateData);
    if (!actualizada) return res.status(404).json({ error: 'No encontrada' });
    res.json(actualizada);
}));

app.delete('/api/noticias/:id', authMiddleware, asyncHandler(async (req, res) => {
    await db.remove(db.COLLECTIONS.noticias, req.params.id);
    res.json({ success: true });
}));

// CONTACTOS
app.post('/api/contactos', asyncHandler(async (req, res) => {
    const contacto = {
        ...req.body,
        fecha: new Date().toISOString(),
        leido: false,
        respondido: false
    };
    const creado = await db.create(db.COLLECTIONS.contactos, contacto);
    res.json({ success: true, id: creado.id });
}));

app.get('/api/contactos', authMiddleware, asyncHandler(async (req, res) => {
    const { leido } = req.query;

    let contactos = await db.getAll(db.COLLECTIONS.contactos);
    if (leido !== undefined) {
        contactos = contactos.filter(c => c.leido === (leido === 'true'));
    }

    res.json(contactos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
}));

app.put('/api/contactos/:id/leido', authMiddleware, asyncHandler(async (req, res) => {
    const actualizado = await db.update(db.COLLECTIONS.contactos, req.params.id, { leido: req.body.leido });
    if (!actualizado) return res.status(404).json({ error: 'No encontrado' });
    res.json(actualizado);
}));

app.delete('/api/contactos/:id', authMiddleware, asyncHandler(async (req, res) => {
    await db.remove(db.COLLECTIONS.contactos, req.params.id);
    res.json({ success: true });
}));

// ============================================
// RUTAS LIMPIAS (sin .html) + redirección de las antiguas
// ============================================

const PAGE_ROUTES = {
    '/': 'index.html',
    '/nosotros': 'nosotros.html',
    '/programas': 'programas.html',
    '/noticias': 'noticias.html',
    '/noticia': 'noticia-detalle.html',
    '/contacto': 'contacto.html',
    '/admin': 'admin.html'
};

Object.entries(PAGE_ROUTES).forEach(([route, file]) => {
    app.get(route, (req, res) => {
        res.sendFile(path.join(SITE_ROOT, file));
    });
});

// admin.html, index.html, etc. redirigen (301) a su ruta limpia equivalente
Object.entries(PAGE_ROUTES).forEach(([route, file]) => {
    if (file === 'index.html') return; // ya cubierto por '/'
    app.get(`/${file}`, (req, res) => {
        const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        res.redirect(301, route + query);
    });
});
app.get('/index.html', (req, res) => res.redirect(301, '/'));

// ============================================
// ARCHIVOS ESTÁTICOS - DESPUÉS de las rutas API y de página
// ============================================

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(SITE_ROOT, { index: false }));

// Manejador de errores centralizado
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
    console.log(`Home:  http://localhost:${PORT}/`);
});
