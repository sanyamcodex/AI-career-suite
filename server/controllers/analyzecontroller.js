const User = require("../models/user");
const axios = require("axios");
const FormData = require("form-data");

exports.analyzeResume = async (req, res) => {
  try {
    console.log("1. analyzeResume hit");

    const user = await User.findById(req.userId);
    console.log("2. user found:", !!user);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const now = new Date();

    // Premium expiry check
    if (user.isPremium && user.premiumUntil && user.premiumUntil <= now) {
      user.isPremium = false;
      user.premiumUntil = null;
      await user.save();
    }

    const isPremiumActive = Boolean(
      user.isPremium && user.premiumUntil && user.premiumUntil > now
    );

    if (!isPremiumActive) {
      if (user.credits < 5) {
        return res.status(402).json({
          code: "INSUFFICIENT_CREDITS",
          message: "Credits finished. Buy premium",
          credits: user.credits,
        });
      }

      user.credits -= 5;
      await user.save();
    }

    console.log("3. req.file exists:", !!req.file);
    console.log("4. req.body:", req.body);

    if (!req.file) {
      return res
        .status(400)
        .json({ message: "Resume file is required (field name: file)" });
    }

    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    form.append(
      "job_description",
      req.body?.job_description || req.body?.jobDescription || ""
    );

    console.log("5. before ML call");

    const response = await axios.post("http://127.0.0.1:8000/api/upload", form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000,
    });

    console.log("6. after ML call");

    return res.status(200).json({
      analysis: response.data,
      credits: user.credits,
      isPremium: isPremiumActive,
      premiumUntil: user.premiumUntil,
    });
  } catch (err) {
    console.error("ANALYZE CONTROLLER ERROR:", err.message);

    if (err.response) {
      console.error("ML response status:", err.response.status);
      console.error("ML response data:", err.response.data);
    }

    return res.status(500).json({
      message: "Analyze failed",
      error: err.message || String(err),
    });
  }
};