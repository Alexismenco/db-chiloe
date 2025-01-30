const express=require('express');
const fetch = require('node-fetch');
const session = require('express-session');
const app=new express();
const fs = require('fs').promises;
const path = require('path')
const upload = require('express-fileupload');
const nodemailer=require('nodemailer');
require('dotenv').config();
const chalk = require('chalk');
const jwt = require('./utils/jwt');
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
  secret: 'tu_clave_secreta_segura', // Usa una cadena segura
  resave: false,
  saveUninitialized: true
}));


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

app.get('/', async (req, res) => {
  try {
      // Ruta al archivo scort.json
      const scortFilePath = path.join(__dirname, 'scort.json');

      // Leer el archivo scort.json
      const data = await fs.readFile(scortFilePath, 'utf-8');
      const scorts = JSON.parse(data);

      // Renderizar la vista index con los datos de las scorts
      console.log(scorts)
      res.render('index', { scorts });
  } catch (error) {
      console.error('Error al leer scort.json:', error);
      res.status(500).send('Error al cargar la página de inicio');
  }
});

// Ruta dinámica para filtrar scorts por ciudad
app.get('/ciudad/:nombre', async (req, res) => {
    const ciudad = req.params.nombre; // Obtener el nombre de la ciudad desde la URL

    try {
        // Leer el archivo scort.json
        const scortFilePath = path.join(__dirname, 'scort.json');
        const data = await fs.readFile(scortFilePath, 'utf-8');
        const scorts = JSON.parse(data);

        // Filtrar las scorts por ciudad
        const scortsCiudad = scorts[ciudad] || [];

        // Renderizar la vista con las scorts de la ciudad
        res.render('ciudad', { scorts: scortsCiudad, ciudad });
    } catch (error) {
        console.error('Error al leer scort.json:', error);
        res.status(500).send('Error al cargar la página de la ciudad');
    }
});
app.get('/colaborador/:id', async (req, res) => {

});

// anunciate
app.get('/anunciate', async (req,res) => {
 

    res.render('anunciate',{})
});

app.post('/anunciate1', async (req, res) => {
    const { nombre, email, edad, telefono, genero, medidas, peso, estatura, ciudad, descripcion } = req.body;
    let servicios = req.body['services[]'];
    const imagenes = req.files['fotos[]'];

    // Asegurarse de que "servicios" sea un array
    if (!Array.isArray(servicios)) {
        servicios = [servicios];
    }

    // Crear un objeto con los datos de la colaboradora
    const colaboradora = {
        nombre,
        email,
        edad: parseInt(edad, 10),
        telefono,
        genero,
        medidas,
        peso: parseInt(peso, 10),
        estatura: parseInt(estatura, 10),
        ciudad,
        servicios: servicios.join(', '), // Unir los servicios en un string
        descripcion,
        estado_pago: 'pendiente',
        fotos: [] // Aquí guardaremos las rutas de las fotos
    };

    try {
        // Guardar las imágenes en la carpeta public/img
        const telefonoFormateado = telefono.replace(/\D/g, ''); // Eliminar caracteres no numéricos
        const directorioFotos = path.join(__dirname, 'public', 'img');

        // Crear el directorio si no existe
        await fs.mkdir(directorioFotos, { recursive: true });

        // Guardar cada imagen con un nombre único
        if (imagenes) {
            const imagenesArray = Array.isArray(imagenes) ? imagenes : [imagenes]; // Asegurar que sea un array
            for (let i = 0; i < imagenesArray.length; i++) {
                const nombreFoto = `img_${telefonoFormateado}_${i + 1}${path.extname(imagenesArray[i].name)}`;
                const rutaFoto = path.join(directorioFotos, nombreFoto);
                await imagenesArray[i].mv(rutaFoto); // Mover la imagen a la carpeta
                colaboradora.fotos.push(`img/${nombreFoto}`); // Guardar la ruta relativa
            }
        }

        // Leer el archivo scort.json
        const scortFilePath = path.join(__dirname, 'scort.json');
        let scorts = {};

        try {
            const data = await fs.readFile(scortFilePath, 'utf-8');
            scorts = JSON.parse(data);
        } catch (error) {
            console.error('Error al leer scort.json, se creará uno nuevo:', error);
        }

        // Inicializar la ciudad si no existe
        if (!scorts[ciudad]) {
            scorts[ciudad] = [];
        }

        // Agregar la nueva colaboradora a la ciudad correspondiente
        scorts[ciudad].push(colaboradora);

        // Guardar el archivo scort.json actualizado
        await fs.writeFile(scortFilePath, JSON.stringify(scorts, null, 2), 'utf-8');

        // Renderizar la vista de pago
        res.render('pago', { email });
    } catch (err) {
        console.error('Error procesando la solicitud:', err.stack);
        res.status(500).send('Error procesando la solicitud');
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
        urlreturn: process.env.MIHOST+"confirmacion-pago?email="+req.body.email,
        urlnotify: process.env.MIHOST+"notificacion-pago?email="+req.body.email,
        additional_parameters: {
          parameters1: "keyValue1",
          parameters2: "keyValue54",
          order_ext: "fff-477"
        }
      };
  
      const response = await fetch('https://app.payku.cl/api/transaction/', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.PAYKU_TK_PUBLIC_APP // Reemplaza 'your_test_api_key' con tu clave de API de prueba de Payku
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
          const response = await fetch(`https://app.payku.cl/api/transaction/${transactionId}`, {
              method: 'GET',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + process.env.PAYKU_TK_PUBLIC_APP
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