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

// ✅ MongoDB Connection (CHANGE THIS)
const MONGO_URI = "mongodb+srv://sanyamvats2112:sanyam2112@cluster0.zy1rs3f.mongodb.net/resumeAI?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("Mongo Error:", err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", analyzeRoutes);
app.use("/api", userRoutes);
app.use("/api/billing", billingRoutes);

// Test route
app.get("/", (req,res)=>{
  res.send("Resume Analyzer API Running");
});

// ✅ IMPORTANT: Render ke liye PORT fix
// const PORT = process.env.PORT || 5000;

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});