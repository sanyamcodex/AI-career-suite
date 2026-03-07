const express = require("express")
const router = express.Router()

const auth = require("../middleware/auth")
const { upgradeToPremium } = require("../controllers/billingcontroller")

router.post("/upgrade", auth, upgradeToPremium)

module.exports = router

