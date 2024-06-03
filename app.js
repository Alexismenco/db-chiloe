const express=require('express');
const fetch = require('node-fetch');
const session = require('express-session');
const app=new express();
const { conexion } = require('./db');
const fs = require('fs');
const path = require('path')
const upload = require('express-fileupload');
const bodyparser = require("body-parser");
const nodemailer=require('nodemailer');
require('dotenv').config();
const chalk = require('chalk');
const jwt = require('./utils/jwt');
const {prevenirLogin ,permisosAdmin}=require('./middleware/autenticacion');
const morgan = require('morgan');
const useragent = require('express-useragent');

// configuracion nodmeailer email
var transporter=nodemailer.createTransport({
    service:'gmail',
    auth:{
      user:process.env.MAILUSER,
      pass:process.env.MAILPASS
    }
  })

  function ensureUploadsDir() {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
    }
  }

  // Configuracion de la express-session 
app.use(session({
  secret: process.env.SECRET_SESSION,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Asegúrate de establecer esto a true si usas HTTPS
}));

  // Funcion para eliminar registro si no cancela
  const deleteColaborador = async (email) => {
    try {
      // Obtener el id del colaborador
      const [rows] = await conexion.query('SELECT id FROM colaboradores WHERE email = ?', [email]);
      if (rows.length === 0) return; // Si no se encuentra el colaborador, salir
  
      const colaboradorId = rows[0].id;
  
      // Obtener las imágenes del colaborador
      const [imagenRows] = await conexion.query('SELECT imagen_url FROM imagenes_colaboradores WHERE colaborador_id = ?', [colaboradorId]);
  
      // Eliminar las imágenes del sistema de archivos
      for (const row of imagenRows) {
        if (fs.existsSync(row.imagen_url)) {
          fs.unlinkSync(row.imagen_url);
        }
      }
  
      // Eliminar los registros de las imágenes
      await conexion.query('DELETE FROM imagenes_colaboradores WHERE colaborador_id = ?', [colaboradorId]);
  
      // Eliminar el registro del colaborador
      await conexion.query('DELETE FROM colaboradores WHERE id = ?', [colaboradorId]);
  
      console.log(`Registros y archivos del colaborador con email ${email} eliminados.`);
    } catch (error) {
      console.error('Error al eliminar registros y archivos:', error);
    }
  };
  
  async function updatePaymentStatus(email, status) {
    await conexion.query('UPDATE colaboradores SET estado_pago = ? WHERE email = ?', [status, email]);
  };

  async function obtenerColaboradoresPorCiudad(ciudad) {
    try {
        // Consulta para obtener todos los colaboradores de la ciudad con estado de pago aprobado
        const [rows] = await conexion.query('SELECT * FROM colaboradores WHERE estado_pago = "aprobado" AND ciudad = ?', [ciudad]);
        
        // Array para almacenar los colaboradores con sus imágenes de portada
        const colaboradoresConPortada = [];
        
        // Para cada colaborador, selecciona una de sus imágenes como portada (si tiene alguna)
        for (const colaborador of rows) {
            // Consulta para obtener la imagen más reciente del colaborador
            const [imagenes] = await conexion.query('SELECT * FROM imagenes_colaboradores WHERE colaborador_id = ? ORDER BY id DESC LIMIT 1', [colaborador.id]);
            
            // Verifica si hay imágenes para este colaborador
            if (imagenes.length > 0) {
                // Obtiene la ruta de la imagen
                const imagenPath = imagenes[0].imagen_url;
                
                // Agrega el colaborador con la ruta de la imagen de portada al array
                colaboradoresConPortada.push({
                    colaborador: colaborador,
                    imagen_portada: imagenPath
                });
            } else {
                // Si el colaborador no tiene imágenes, simplemente agrégalo al array sin una imagen de portada
                colaboradoresConPortada.push({
                    colaborador: colaborador,
                    imagen_portada: null
                });
            }
        }

        return colaboradoresConPortada;
    } catch (error) {
        console.error(`Error al obtener los colaboradores de ${ciudad}:`, error);
        throw new Error(`Error al obtener los colaboradores de ${ciudad}`);
    }
}

async function obtenerColaboradoresPorId(colaboradorId) {
  try {
    // Consulta para obtener el colaborador por su ID con estado de pago aprobado
    const [rows] = await conexion.query('SELECT * FROM colaboradores WHERE id = ? AND estado_pago = "aprobado"', [colaboradorId]);
    
    // Array para almacenar el colaborador con sus imágenes de portada
    const colaboradorConPortadas = [];
    
    // Verifica si se encontró un colaborador con ese ID
    if (rows.length > 0) {
      const colaborador = rows[0];
      
      // Consulta para obtener todas las imágenes del colaborador
      const [imagenes] = await conexion.query('SELECT * FROM imagenes_colaboradores WHERE colaborador_id = ? ORDER BY id DESC', [colaborador.id]);
      
      // Verifica si hay imágenes para este colaborador
      if (imagenes.length > 0) {
        // Recorre todas las imágenes y las agrega al array
        const imagenesUrls = imagenes.map(imagen => imagen.imagen_url);
        
        // Agrega el colaborador con las rutas de las imágenes de portada al array
        colaboradorConPortadas.push({
          colaborador: colaborador,
          imagenes_portada: imagenesUrls
        });
        console.log(colaboradorConPortadas)
      } else {
        // Si el colaborador no tiene imágenes, simplemente agrégalo al array sin una imagen de portada
        colaboradorConPortadas.push({
          colaborador: colaborador,
          imagenes_portada: []
        });
      }
    }

    return colaboradorConPortadas;
  } catch (error) {
    console.error(`Error al obtener el colaborador con ID ${colaboradorId}:`, error);
    throw new Error(`Error al obtener el colaborador con ID ${colaboradorId}`);
  }
}

// Middleware para analizar el User-Agent
app.use(useragent.express());
app.use(express.urlencoded({extended:false}))
app.use(express.static('public'));
app.use(express.static('uploads'));
app.use(upload());
app.set('view engine',"ejs");
app.set("views",__dirname+"/views");

// Middleware para registrar las visitas
app.use((req, res, next) => {
  const visitData = {
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent'],
    date: new Date().toISOString(),
    device: {
      isMobile: req.useragent.isMobile,
      isTablet: req.useragent.isTablet,
      isDesktop: req.useragent.isDesktop,
      browser: req.useragent.browser,
      version: req.useragent.version,
      os: req.useragent.os,
      platform: req.useragent.platform
    }
  };

  // Guardar en archivo
  const logFilePath = path.join(__dirname, 'visits.log');
  fs.appendFile(logFilePath, JSON.stringify(visitData) + '\n', err => {
    if (err) {
      console.error('Error al guardar el registro:', err);
    }
  });

  console.log('Visita registrada:', visitData);
  next();
});

// Inicio
app.get('/', async (req, res) => {
    try {
        // Consulta para obtener todos los colaboradores con estado de pago aprobado
        const [rows] = await conexion.query('SELECT * FROM colaboradores WHERE estado_pago = "aprobado"');
        
        // Array para almacenar los colaboradores con sus imágenes de portada
        const colaboradoresConPortada = [];
        
        // Para cada colaborador, selecciona una de sus imágenes como portada (si tiene alguna)
        for (const colaborador of rows) {
            // Consulta para obtener la imagen más reciente del colaborador
            const [imagenes] = await conexion.query('SELECT * FROM imagenes_colaboradores WHERE colaborador_id = ? ORDER BY id DESC LIMIT 1', [colaborador.id]);
            
            // Verifica si hay imágenes para este colaborador
            if (imagenes.length > 0) {
                // Obtiene la ruta de la imagen
                const imagenPath = imagenes[0].imagen_url;

                
                // Agrega el colaborador con la ruta de la imagen de portada al array
                colaboradoresConPortada.push({
                    colaborador: colaborador,
                    imagen_portada: imagenPath
                });
            } else {
                // Si el colaborador no tiene imágenes, simplemente agrégalo al array sin una imagen de portada
                colaboradoresConPortada.push({
                    colaborador: colaborador,
                    imagen_portada: null
                });
            }
        }
        
        // Renderiza la vista 'index' pasando los colaboradores con sus imágenes de portada
        res.render('index', { colaboradoresConPortada });
    } catch (error) {
        // Manejo de errores
        console.error('Error al obtener los colaboradores:', error);
        res.status(500).send('Error al obtener los colaboradores');
    }
});

app.get('/ancud', async (req, res) => {
  try {
      const colaboradoresConPortada = await obtenerColaboradoresPorCiudad('Ancud');
      res.render('ciudad', { colaboradoresConPortada });
  } catch (error) {
      res.status(500).send(error.message);
  }
});

app.get('/quemchi', async (req, res) => {
  try {
      const colaboradoresConPortada = await obtenerColaboradoresPorCiudad('Quemchi');
      res.render('ciudad', { colaboradoresConPortada });
  } catch (error) {
      res.status(500).send(error.message);
  }
});

app.get('/castro', async (req, res) => {
  try {
      const colaboradoresConPortada = await obtenerColaboradoresPorCiudad('Castro');
      res.render('ciudad', { colaboradoresConPortada });
  } catch (error) {
      res.status(500).send(error.message);
  }
});

app.get('/dalcahue', async (req, res) => {
  try {
      const colaboradoresConPortada = await obtenerColaboradoresPorCiudad('Dalcahue');
      res.render('ciudad', { colaboradoresConPortada });
  } catch (error) {
      res.status(500).send(error.message);
  }
});

app.get('/quellon', async (req, res) => {
  try {
      const colaboradoresConPortada = await obtenerColaboradoresPorCiudad('Quellon');
      res.render('ciudad', { colaboradoresConPortada });
  } catch (error) {
      res.status(500).send(error.message);
  }
});

app.get('/chonchi', async (req, res) => {
  try {
      const colaboradoresConPortada = await obtenerColaboradoresPorCiudad('Chonchi');
      res.render('ciudad', { colaboradoresConPortada });
  } catch (error) {
      res.status(500).send(error.message);
  }
});

app.get('/colaborador/:id', async (req, res) => {
  const colaboradorId = req.params.id;
  
  try {
      const colaboradoresConPortada = await obtenerColaboradoresPorId(colaboradorId);
      const basePath = req.protocol + '://' + req.get('host');

      res.render('colaborador', { colaboradoresConPortada, basePath });
  } catch (error) {
      res.status(500).send(error.message);
  }
});

// anunciate
app.get('/anunciate', async (req,res) => {
 
    res.render('anunciate',{})
});

app.post('/anunciate1', async (req, res) => {
    const { nombre, email, edad, telefono, genero, medidas, peso, estatura, ciudad, descripcion } = req.body;
    let servicio = req.body['services[]'];
    const imagenes = req.files['fotos[]'];
  
    if (!Array.isArray(servicio)) {
      servicio = [servicio];
    }
  
    const colaborador = {
      nombre_usuario: nombre,
      email,
      edad,
      telefono,
      genero,
      medidas,
      peso,
      estatura,
      ciudad,
      servicio: servicio.join(', '),
      descripcion,
      estado_pago: 'pendiente'
    };
  
    try {
      const [results] = await conexion.query('INSERT INTO colaboradores SET ?', colaborador);
      const colaborador_id = results.insertId;
  
      ensureUploadsDir();
  
      if (imagenes) {
        const imagenPromises = (Array.isArray(imagenes) ? imagenes : [imagenes]).map((imagen) => {
          return new Promise((resolve, reject) => {
            const uniqueFilename = `${email}_${imagen.name}`;
            const imagenPath = path.join('uploads', uniqueFilename);
            imagen.mv(imagenPath, (err) => {
              if (err) {
                console.error('Error saving image:', err.stack);
                return reject(err);
              }
              conexion.query('INSERT INTO imagenes_colaboradores (colaborador_id, imagen_url) VALUES (?, ?)', [colaborador_id, uniqueFilename], (err, results) => {
                if (err) {
                  console.error('Error inserting image record:', err.stack);
                  return reject(err);
                }
                resolve(results);
              });
            });
          });
        });
      }
  
      res.render('pago', { email });
    } catch (err) {
      console.error('Error processing request:', err.stack);
      res.status(500).send('Error processing request');
    }
  });

  app.post('/realizar-pago', async (req, res) => {
    try {
        const now = new Date();
        const expiredDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas a partir del ahora
        const year = expiredDate.getFullYear();
        const month = String(expiredDate.getMonth() + 1).padStart(2, '0');
        const day = String(expiredDate.getDate()).padStart(2, '0');
        const hours = String(expiredDate.getHours()).padStart(2, '0');
        const minutes = String(expiredDate.getMinutes()).padStart(2, '0');
        const seconds = String(expiredDate.getSeconds()).padStart(2, '0');
        const expired = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        
        const generateUniqueOrderNumber = Math.floor(10000 + Math.random() * 90000);

      const data = {
        email: req.body.email, // Email del cliente
        order: generateUniqueOrderNumber.toString(), // Cambiar por un identificador único si es necesario
        subject: "payment description",
        amount: 2500,
        currency: 'CLP',
        payment: 1,
        expired: expired.toString(),
        urlreturn: "http://localhost:3000/confirmacion-pago?email="+req.body.email,
        urlnotify: "http://localhost:3000/notificacion-pago?email="+req.body.email,
        additional_parameters: {
          parameters1: "keyValue1",
          parameters2: "keyValue54",
          order_ext: "fff-477"
        }
      };
  
      const response = await fetch('https://des.payku.cl/api/transaction/', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.PAYKU_TK_PUBLIC_DES // Reemplaza 'your_test_api_key' con tu clave de API de prueba de Payku
        },
        body: JSON.stringify(data)
      });
  
      const result = await response.json();
      console.log(result);
      
          // Verificar si se obtuvo la ID de la transacción
          if (result.id) {
            // Guardar la ID de la transacción en la sesión
            req.session.transactionId = result.id;
            };
  
      // Redirigir al usuario a la URL de pago proporcionada por Payku
      if (result.url) {
        res.redirect(result.url);
      } else {
        res.status(500).send('Error en la transacción de pago');
      }
    } catch (error) {
      console.error('Error realizando el pago:', error);
      res.status(500).send('Error realizando el pago');
    }
  });
  
  app.get('/confirmacion-pago', async (req, res) => {
    const { email } = req.query;

    try {
      const transactionId = req.session.transactionId;

      if (transactionId) {
          const response = await fetch(`https://des.payku.cl/api/transaction/${transactionId}`, {
              method: 'GET',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + process.env.PAYKU_TK_PUBLIC_DES
              },
          });
          const result = await response.json();
          console.log(result);

          // Realizar las acciones necesarias con la respuesta de la notificación
          console.log('Notificación recibida');
          if(result.status === 'success'){
            await updatePaymentStatus(email, 'aprobado');
            return res.render('confirmacion-pago');
          }
      } else {
        console.log('ID de transacción no encontrada');
      }
  } catch (error) {
      console.error('Error en la notificación de pago:', error);
  }


    await deleteColaborador(email);
    res.render('notificacion-pago');  // Renderiza la vista confirmacion-pago.ejs
});
  
app.post('/notificacion-pago', async (req, res) => {
    const { email } = req.query; // Acceder a los datos de la consulta
    const transactionId = req.session.transactionId;
    console.log(transactionId);
  
    try {
      if (status === 'failed') {
        await updatePaymentStatus(email, 'fallido');
        await deleteColaborador(email);
      } else if (status === 'success') {
        await updatePaymentStatus(email, 'aprobado');
      }
  
      // Renderiza la vista correspondiente basado en el estado del pago
      res.render('notificacion-pago');
    } catch (error) {
      console.error('Error al procesar la notificación de pago:', error);
    }
  });
  
app.get('/login', async (req,res) => {

    res.render('login',{})
});

// Validación login
app.post('/login', async (req,res) => {
    console.log(req.body)
 
    res.render('login',{})
});

app.get('/registro', async (req,res) => {

 
    res.render('register',{})
});

// Validación registro
app.post('/register', async (req,res) => {

 console.log(req.body)
    res.render('register',{})
});

module.exports={app}