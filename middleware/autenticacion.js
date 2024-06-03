require('dotenv').config();
const jwt = require('../utils/jwt');

const permisosAdmin = async function(req,res,next){
   
    if(!req.headers.cookie){
        return res.redirect('/login');
    }

    next();
}


const prevenirLogin = async function(req,res,next){
   
        if(req.headers.cookie!=undefined){
            res.redirect("/")
        }
    
    next();
}


module.exports={prevenirLogin,permisosAdmin}