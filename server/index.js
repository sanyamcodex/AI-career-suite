const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/authroutes");
const analyzeRoutes = require("./routes/analyzeroutes");
const userRoutes = require("./routes/useroutes");
const billingRoutes = require("./routes/billingroutes");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect("mongodb://127.0.0.1:27017/resumeAI")
.then(()=> console.log("MongoDB Connected"))
.catch(err => console.log(err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", analyzeRoutes);
app.use("/api", userRoutes);
app.use("/api/billing", billingRoutes);

// Test route
app.get("/", (req,res)=>{
  res.send("Resume Analyzer API Running");
});

// Server start
app.listen(5000, () => {
  console.log("Server running on port 5000");
});