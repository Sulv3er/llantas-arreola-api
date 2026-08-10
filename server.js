const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs');
const Stripe = require('stripe'); 

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

const db = mysql.createPool({
    host: 'srv525.hstgr.io',          
    user: 'u160168264_Arreola',        
    password: '$Tv7bPuiKGdhM9B',       
    database: 'u160168264_LlantasArreola',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

db.getConnection((err, connection) => {
    if (err) console.error('❌ Error conectando a MySQL:', err);
    else { console.log('✅ Conectado a MySQL'); connection.release(); }
});

function parseSpecs(desc) {
    let ancho = '', alto = '', rin = '';
    desc = String(desc).trim().toUpperCase();
    let offRoadMatch = desc.match(/^(\d+(\.\d+)?)\s*X\s*(\d+(\.\d+)?)\s*[R\-]\s*(\d+(\.\d+)?)/);
    if (offRoadMatch) return { ancho: offRoadMatch[3], alto: offRoadMatch[1], rin: offRoadMatch[5] };
    let motoMatch = desc.match(/^(\d+)\/(\d+)\s*[A-Z\-]\s*(\d+(\.\d+)?)/);
    if (motoMatch) return { ancho: motoMatch[1], alto: motoMatch[2], rin: motoMatch[3] };
    let metricMatch = desc.match(/^(\d+)\/(\d+)\s*R\s*(\d+(\.\d+)?)/);
    if (metricMatch) return { ancho: metricMatch[1], alto: metricMatch[2], rin: metricMatch[3] };
    let agricolaMatch = desc.match(/^(\d+(\.\d+)?)\s*[\-R]\s*(\d+(\.\d+)?)/);
    if (agricolaMatch) return { ancho: agricolaMatch[1], alto: '', rin: agricolaMatch[3] };
    let rinMatch = desc.match(/[R\-](\d+(\.\d+)?)/);
    if (rinMatch) rin = rinMatch[1];
    return { ancho, alto, rin };
}

function getRowValue(row, keywords) {
    for (let key of Object.keys(row)) {
        if (keywords.includes(key.toString().toUpperCase().trim())) return row[key];
    }
    return null;
}

app.get('/payment-success', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pago Exitoso</title>
            <style>
                body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; text-align: center; }
                .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                h1 { color: #2e7d32; margin-bottom: 10px; }
                p { color: #555; font-size: 16px; margin: 5px 0; }
                .icon { font-size: 50px; color: #2e7d32; margin-bottom: 15px; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">✔️</div>
                <h1>¡Pago Autorizado!</h1>
                <p>Tu transacción se ha procesado de forma segura.</p>
                <p><b>Ya puedes cerrar esta pestaña</b> y regresar a la tienda.</p>
            </div>
            <script>
                setTimeout(() => { window.close(); }, 2500);
            </script>
        </body>
        </html>
    `);
});

app.get('/payment-cancel', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pago Cancelado</title>
            <style>
                body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; text-align: center; }
                .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                h1 { color: #d32f2f; margin-bottom: 10px; }
                p { color: #555; font-size: 16px; margin: 5px 0; }
                .icon { font-size: 50px; color: #d32f2f; margin-bottom: 15px; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">❌</div>
                <h1>Pago Cancelado</h1>
                <p>No se ha realizado ningún cargo a tu tarjeta.</p>
                <p><b>Ya puedes cerrar esta pestaña</b> y regresar a la tienda.</p>
            </div>
            <script>
                setTimeout(() => { window.close(); }, 2500);
            </script>
        </body>
        </html>
    `);
});

app.post('/create-checkout-session', async (req, res) => {
    try {
        const { productName, total, userEmail, quantity } = req.body;
        const unitAmount = Math.round(parseFloat(total) * 100);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'mxn',
                    product_data: { name: productName || 'Llantas Arreola' },
                    unit_amount: unitAmount,
                },
                quantity: quantity || 1,
            }],
            mode: 'payment',
            success_url: 'https://llantas-arreola-api.onrender.com/payment-success', 
            cancel_url: 'https://llantas-arreola-api.onrender.com/payment-cancel', 
            customer_email: userEmail || undefined,
        });

        res.json({ success: true, url: session.url, sessionId: session.id });
    } catch (error) {
        console.error("Error creando sesión:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/verify-stripe-payment', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, message: 'Falta session_id' });

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status === 'paid') {
            res.json({ success: true, message: 'Pago validado' });
        } else {
            res.json({ success: false, message: 'El pago aún no se detecta en Stripe' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT name, email, phone, address, rol, verificado FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.length > 0) {
            if (results[0].verificado === 0) return res.json({ success: false, message: 'unverified' });
            res.json({ success: true, user: results[0] });
        } else res.json({ success: false, message: 'Credenciales incorrectas' });
    });
});

app.post('/register', (req, res) => {
    const { name, email, password, phone } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); 
    
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.length > 0) return res.json({ success: false, message: 'El correo ya está registrado.' });
        
        db.query('INSERT INTO users (name, email, password, phone, rol, codigo_verificacion, verificado) VALUES (?, ?, ?, ?, ?, ?, ?)', 
        [name, email, password, phone || '', 'cliente', otp, 0], async (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            
            try {
                await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'api-key': process.env.BREVO_API_KEY,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: { name: "Soporte Llantas Arreola", email: "soporte.llantasyrines@gmail.com" },
                        to: [{ email: email, name: name }],
                        subject: 'Código de Verificación - Llantas Arreola',
                        htmlContent: `<div style="text-align: center; font-family: Arial, sans-serif;"><h2 style="color: #D32F2F;">¡Bienvenido al Club, ${name}!</h2><p>Para activar tu cuenta y poder comprar, ingresa el siguiente código de seguridad en la aplicación:</p><h1 style="font-size: 32px; letter-spacing: 5px; background: #f4f4f4; padding: 15px; border-radius: 8px; display: inline-block;">${otp}</h1><p style="color: #666; font-size: 12px; margin-top: 30px;">Si no solicitaste este registro, ignora este mensaje.</p></div>`
                    })
                });
                res.json({ success: true, message: 'Usuario registrado.' });
            } catch (apiError) {
                console.error("Error enviando correo con la API:", apiError);
                res.json({ success: true, message: 'Usuario registrado.' });
            }
        });
    });
});

app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    db.query('SELECT codigo_verificacion FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.length > 0 && results[0].codigo_verificacion === otp) {
            db.query('UPDATE users SET verificado = 1, codigo_verificacion = NULL WHERE email = ?', [email], () => {
                res.json({ success: true, message: 'Cuenta verificada exitosamente' });
            });
        } else res.json({ success: false, message: 'Código incorrecto' });
    });
});

app.post('/updateProfile', (req, res) => {
    const { name, phone, address, email } = req.body;
    db.query('UPDATE users SET name = ?, phone = ?, address = ? WHERE email = ?', [name, phone, address, email], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: 'Perfil actualizado' });
    });
});

app.post('/saveOrder', (req, res) => {
    const { id, user_email, product_name, product_specs, quantity, date, total, image, invoice_url, buyer_name, buyer_phone } = req.body;
    const productId = id.includes('_') ? id.substring(id.indexOf('_') + 1) : id;
    const query = 'INSERT INTO orders (id, user_email, product_name, product_specs, quantity, order_date, total, image, invoice_url, buyer_name, buyer_email, buyer_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    
    db.query(query, [id, user_email, product_name, product_specs, quantity, date, total, image, invoice_url, buyer_name || 'Cliente Web', user_email, buyer_phone || 'Sin teléfono'], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        const updateStockQuery = "UPDATE products SET cantidad_general = GREATEST(cantidad_general - ?, 0) WHERE clave_producto = ?";
        db.query(updateStockQuery, [quantity, productId], () => {
            res.json({ success: true, message: 'Orden guardada' });
        });
    });
});

app.post('/getOrders', (req, res) => {
    db.query('SELECT * FROM orders WHERE user_email = ? ORDER BY order_date DESC', [req.body.email], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, orders: results });
    });
});

app.get('/products', (req, res) => {
    db.query('SELECT * FROM products', (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const formattedProducts = results.map(p => {
            const { ancho, alto, rin } = parseSpecs(p.descripcion);
            return {
                id: p.clave_producto, name: p.producto, brand: p.categoria_3,
                category: p.categoria_1 && p.categoria_1.toUpperCase().includes('RINE') ? 'Rines' : 'Llantas',
                price: p.publico, wholesale_price: p.publico, stock: p.cantidad_general,
                image: p.image, specs: { ancho, alto, rin },
                details: { descripcion: p.descripcion, categoria_2: p.categoria_2 }
            };
        });
        res.json({ success: true, products: formattedProducts });
    });
});

app.post('/admin/uploadExcel', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No se subió archivo' });
        const workbook = xlsx.readFile(req.file.path);
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const query = `INSERT INTO products (clave_producto, producto, publico, cantidad_general, categoria_1, categoria_2, categoria_3, categoria_4, descripcion, image) VALUES ? ON DUPLICATE KEY UPDATE producto=VALUES(producto), publico=VALUES(publico), cantidad_general=VALUES(cantidad_general), categoria_1=VALUES(categoria_1), categoria_2=VALUES(categoria_2), categoria_3=VALUES(categoria_3), categoria_4=VALUES(categoria_4), descripcion=VALUES(descripcion)`;
        const values = data.filter(row => getRowValue(row, ['CLAVE DE PRODUCTO', 'CLAVE', 'ID DE PRODUCTO'])).map(row => {
            const clave = getRowValue(row, ['CLAVE DE PRODUCTO']) || `P-${Date.now()}`;
            const prod = getRowValue(row, ['PRODUCTO', 'NOMBRE']) || 'Sin nombre';
            const publico = parseFloat(getRowValue(row, ['PUBLICO', 'PRECIO'])?.toString().replace(/[^0-9.]/g, '') || 0);
            const stock = parseInt(getRowValue(row, ['CANTIDAD GENERAL', 'STOCK']) || 0);
            const cat1 = getRowValue(row, ['CATEGORIA 1']) || 'Llantas';
            const cat2 = getRowValue(row, ['CATEGORIA 2', 'TIPO']) || 'Automóvil';
            const cat3 = getRowValue(row, ['CATEGORIA 3', 'MARCA']) || 'General';
            const desc = getRowValue(row, ['DESCRIPCION']) || '';
            return [clave.toString(), prod.toString(), publico, stock, cat1.toString(), cat2.toString(), cat3.toString(), '', desc.toString(), 'assets/images/default.png'];
        });
        if (values.length === 0) return res.status(400).json({ success: false, message: 'Archivo inválido.' });
        db.query(query, [values], (err) => {
            fs.unlinkSync(req.file.path);
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, message: 'Inventario actualizado' });
        });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/admin/addProduct', upload.single('image'), (req, res) => {
    const { id, name, brand, category, price, stock, details } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : 'assets/images/default.png';
    let d = {}; try { d = JSON.parse(details); } catch(e) {}
    db.query('INSERT INTO products (clave_producto, producto, categoria_3, categoria_1, publico, cantidad_general, image, categoria_2, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
    [id, name, brand, category, parseFloat(price), stock, imageUrl, d.categoria_2 || 'Automóvil', d.descripcion || ''], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: 'Producto agregado' });
    });
});

app.post('/admin/updateProduct', upload.single('image'), (req, res) => {
    const { id, name, brand, category, price, stock, details } = req.body;
    let d = {}; try { d = JSON.parse(details); } catch(e) {}
    let query = 'UPDATE products SET producto=?, categoria_3=?, categoria_1=?, publico=?, cantidad_general=?, categoria_2=?, descripcion=? WHERE clave_producto=?';
    let params = [name, brand, category, parseFloat(price), stock, d.categoria_2 || 'Automóvil', d.descripcion || '', id];
    if (req.file) {
        query = 'UPDATE products SET producto=?, categoria_3=?, categoria_1=?, publico=?, cantidad_general=?, categoria_2=?, descripcion=?, image=? WHERE clave_producto=?';
        params = [name, brand, category, parseFloat(price), stock, d.categoria_2 || 'Automóvil', d.descripcion || '', `/uploads/${req.file.filename}`, id];
    }
    db.query(query, params, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: 'Producto actualizado' });
    });
});

app.post('/admin/deleteProduct', (req, res) => {
    db.query('DELETE FROM products WHERE clave_producto = ?', [req.body.id], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: 'Producto eliminado' });
    });
});

app.get('/admin/users', (req, res) => {
    db.query('SELECT name, email, phone, address, rol FROM users', (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: results });
    });
});

app.post('/admin/updateUserRole', (req, res) => {
    const { email, rol } = req.body;
    db.query('UPDATE users SET rol = ? WHERE email = ?', [rol, email], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: 'Rol actualizado' });
    });
});

app.get('/admin/orders', (req, res) => {
    db.query('SELECT * FROM orders ORDER BY order_date DESC', (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, orders: results });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0',() => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));