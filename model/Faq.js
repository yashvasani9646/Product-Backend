const mongoose = require("mongoose");

const faqSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
      default: Date.now,
    },

    question: {
      type: String,
      required: true,
      trim: true,
    },

    answer: {
      type: String,
      required: true,
      trim: true,
    },

    userEmail: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Faq", faqSchema);