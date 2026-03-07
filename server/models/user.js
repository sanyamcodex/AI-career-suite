const mongoose = require("mongoose")

const userSchema = new mongoose.Schema({

name:String,

email:{
type:String,
unique:true
},

password:String,

credits:{
type:Number,
default:100
},

isPremium: {
type: Boolean,
default: false
},

premiumUntil: {
type: Date,
default: null
}

}, { timestamps: true })

module.exports = mongoose.model("User",userSchema)