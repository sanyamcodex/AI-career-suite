const jwt = require("jsonwebtoken")

module.exports = (req,res,next)=>{

const authHeader = req.headers.authorization
const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : authHeader

if(!token){
return res.status(401).json({
message:"Login required"
})
}

let decoded
try{
decoded = jwt.verify(token,"secret")
}catch(err){
return res.status(401).json({message:"Invalid token"})
}

req.userId = decoded.id

next()

}