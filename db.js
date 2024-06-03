const mysql = require('mysql2/promise');
require('dotenv').config();

const configuracion = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  database: process.env.MYSQL_DATABASE,
  password: process.env.MYSQL_PASSWORD,
  port: process.env.MYSQL_PORT
};

const conexion = mysql.createPool(configuracion);

conexion.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err.stack);
    return;
  }
  console.log('Connected to the database as id', connection.threadId);
  connection.release(); // Release the connection back to the pool
});

module.exports = { conexion };
