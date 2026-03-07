const User = require("../models/user")

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password")
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    return res.json({ user })
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch user", error: String(err) })
  }
}

