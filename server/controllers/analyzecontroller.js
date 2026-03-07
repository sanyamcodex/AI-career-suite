const User = require("../models/user")
const axios = require("axios")
const FormData = require("form-data")

exports.analyzeResume = async(req,res)=>{

try{
const user = await User.findById(req.userId)
if(!user){
return res.status(404).json({message:"User not found"})
}

// Premium expiry check
const now = new Date()
if(user.isPremium && user.premiumUntil && user.premiumUntil <= now){
user.isPremium = false
user.premiumUntil = null
await user.save()
}

const isPremiumActive = Boolean(user.isPremium && user.premiumUntil && user.premiumUntil > now)

if(!isPremiumActive){
if(user.credits < 5){
return res.status(402).json({
code:"INSUFFICIENT_CREDITS",
message:"Credits finished. Buy premium",
credits:user.credits
})
}
user.credits -= 5
await user.save()
}

if(!req.file){
return res.status(400).json({message:"Resume file is required (field name: file)"})
}

const form = new FormData()
form.append("file", req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype })
form.append("job_description", req.body?.job_description || "")

const response = await axios.post("http://127.0.0.1:8000/api/upload", form, {
headers: form.getHeaders(),
maxBodyLength: Infinity,
maxContentLength: Infinity
})

return res.json({
analysis: response.data,
credits: user.credits,
isPremium: isPremiumActive,
premiumUntil: user.premiumUntil
})
}catch(err){
return res.status(500).json({message:"Analyze failed", error:String(err)})
}

}