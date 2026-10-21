const express = require("express");
const router = express.Router();

const User = require("./User");

// GET ALL REGISTERED USERS
router.get("/", async (req, res) => {
  try {
    const users = await User.find()
      .select("name email phoneNumber createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      total: users.length,
      users,
    });
  } catch (error) {
    console.error("Get Users Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch registered users.",
    });
  }
});

module.exports = router;