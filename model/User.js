const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },

    // Marks the documents that take part in the unique phone index. It is
    // only written when a user is created, users that already exist keep
    // their data untouched and stay outside the index.
    phoneUnique: {
      type: Boolean,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// A mobile number may only be used by one account.
//
// The index is partial on purpose: the collection already contains users
// that share a phone number and those documents must neither be deleted nor
// changed. Only the documents created from now on carry the phoneUnique
// marker, so the index can be built on the existing data and still rejects
// every duplicate that is created afterwards.
userSchema.index(
  { phoneNumber: 1 },
  {
    unique: true,
    name: "phoneNumber_unique_enforced",
    partialFilterExpression: { phoneUnique: true },
  },
);

userSchema.pre("save", async function () {
  // Only new documents join the unique phone index, loading and saving an
  // existing user never changes the marker.
  if (this.isNew) {
    this.phoneUnique = true;
  }

  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", userSchema);