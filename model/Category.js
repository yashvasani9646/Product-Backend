const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
     {
    id: {
      type: Number,
      unique: true,
      default: Date.now,
    },
  
    category: {
      type: String,
      required: true,
      trim: true,
    },

    subcategories: {
      type: [String],
      default: [],
    },

    available: {
      type: Boolean,
      default: true,
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
  },

);

module.exports = mongoose.model("Category", categorySchema);
