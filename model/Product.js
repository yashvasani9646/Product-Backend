const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
      default: Date.now,
    },

    product: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    subcategory: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      required: true,
      trim: true,
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

module.exports = mongoose.model("Product", ProductSchema);