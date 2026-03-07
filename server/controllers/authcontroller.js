const User = require("../models/user")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

exports.signup = async(req,res)=>{

try{
const {name,email,password} = req.body

// check if user already exists
const existing = await User.findOne({email})
if(existing){
return res.status(400).json({message:"Email already registered. Please login instead."})
}

const hash = await bcrypt.hash(password,10)

const user = await User.create({
name,
email,
password:hash,
credits:100,
isPremium:false,
premiumUntil:null
})

const token = jwt.sign(
{id:user._id},
"secret",
{expiresIn:"7d"}
)

res.json({
token,
user:{
id:user._id,
name:user.name,
email:user.email,
credits:user.credits,
isPremium:user.isPremium,
premiumUntil:user.premiumUntil
}
})
}catch(err){
res.status(500).json({message:"Signup failed", error:String(err)})
}

}

exports.login = async(req,res)=>{

try{
const {email,password} = req.body

const user = await User.findOne({email})

if(!user){
return res.status(400).json({msg:"User not found"})
}

const match = await bcrypt.compare(password,user.password)

if(!match){
return res.status(400).json({msg:"Wrong password"})
}

// If older user docs exist without credits, ensure defaults are applied.
if(typeof user.credits !== "number"){
user.credits = 100
await user.save()
}

const token = jwt.sign(
{id:user._id},
"secret",
{expiresIn:"7d"}
)

res.json({
token,
user:{
id:user._id,
name:user.name,
email:user.email,
credits:user.credits,
isPremium:user.isPremium,
premiumUntil:user.premiumUntil
}
})

}catch(err){
res.status(500).json({message:"Login failed", error:String(err)})
}

}