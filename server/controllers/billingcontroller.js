const User = require("../models/user")

// NOTE: This is a simplified "upgrade" endpoint. In a real app,
// you would integrate Stripe/Razorpay and verify payment webhooks.
exports.upgradeToPremium = async (req, res) => {
  try {
    const { months = 1 } = req.body || {}
    const m = Math.max(1, Math.min(Number(months) || 1, 24))

    const user = await User.findById(req.userId)
    if (!user) return res.status(404).json({ message: "User not found" })

    const now = new Date()
    const base = user.premiumUntil && user.premiumUntil > now ? user.premiumUntil : now
    const premiumUntil = new Date(base)
    premiumUntil.setMonth(premiumUntil.getMonth() + m)

    user.isPremium = true
    user.premiumUntil = premiumUntil
    await user.save()

    return res.json({
      message: "Premium activated",
      user: {
        id: user._id,
        email: user.email,
        credits: user.credits,
        isPremium: user.isPremium,
        premiumUntil: user.premiumUntil
      }
    })
  } catch (err) {
    return res.status(500).json({ message: "Upgrade failed", error: String(err) })
  }
}

