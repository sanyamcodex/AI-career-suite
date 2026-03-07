const express = require("express")
const router = express.Router()

const auth = require("../middleware/auth")
const {analyzeResume} = require("../controllers/analyzecontroller")
const multer = require("multer")

const upload = multer({ storage: multer.memoryStorage() })

router.post("/analyze",auth,upload.single("file"),analyzeResume)

module.exports = router