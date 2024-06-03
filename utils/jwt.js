const jwt = require('jsonwebtoken');
require('dotenv').config();

// generar token con clave secreta .env
const generarToken = async function (usuario) {
    const token = await jwt.sign({
        email:usuario.email
    },
    process.env.JWT_SECRET,
    {
        expiresIn:"1d"
    })
    return token;
}

// revisar si el token es valido
const verificarToken = async function (token) {
    try{
        return jwt.verify(token.substring(5),process.env.JWT_SECRET);
    } catch (error){
        return null
    }
    
}

const obtenerEmail = async function (token) {
    try{
        var email = jwt.verify(token.substring(5),process.env.JWT_SECRET);
        return email.email
    } catch (error){
        return null
    }
    
    
}


module.exports={generarToken,verificarToken, obtenerEmail}