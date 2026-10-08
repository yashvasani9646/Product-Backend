const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
      default: Date.now,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    image: {
      type: String,
      required: true,
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

module.exports = mongoose.model("Blog", blogSchema);