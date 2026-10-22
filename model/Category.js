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

    // Subcategories were originally stored as an array of plain strings.
    // They are now stored as objects ({ id, subcategory, image, available })
    // so that a subcategory can have its own image, status and identity.
    // The array is kept as Mixed so that legacy string entries keep loading
    // and saving without any data migration or data loss.
    subcategories: {
      type: [mongoose.Schema.Types.Mixed],
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
