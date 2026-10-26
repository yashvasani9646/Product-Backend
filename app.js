require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const app = express();
const port = process.env.PORT || 3000;

const Category = require("./model/Category");
const Product = require("./model/Product");
const Blog = require("./model/Blog");
const Faq = require("./model/Faq");
const Review = require("./model/Review");
const User = require("./model/User");
console.log("Cloudinary Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const cors = require("cors");

app.use(cors());
const multer = require("multer");

app.use(express.json());
app.use("/uploads", express.static("uploads"));


const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({
      error: "Login required",
    });
  }

  try {
    const decoded = jwt.verify(token, "my-secret-key");
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
};

// Resolve the authenticated user from the verified token.
// Prefer the immutable MongoDB _id (new tokens) and fall back to email so that
// tokens issued before this change keep working. Never trust client input.
const findAuthenticatedUser = (req) => {
  const query = req.user?.id
    ? { _id: req.user.id }
    : { email: req.user?.email };

  return User.findOne(query);
};

const storage = multer.memoryStorage();

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    // Only real images are accepted, anything else is rejected before it
    // reaches Cloudinary.
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      const error = new Error("Only image files are allowed");
      error.status = 400;

      return cb(error);
    }

    cb(null, true);
  },
});

const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "upleex",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    );

    stream.end(file.buffer);
  });
};

// Upload an optional image and return its secure url. A broken or invalid
// file is reported as a 400 instead of an internal server error.
const uploadImage = async (file) => {
  if (!file) {
    return "";
  }

  try {
    const cloudinaryResult = await uploadToCloudinary(file);

    return cloudinaryResult.secure_url;
  } catch (error) {
    const uploadError = new Error("Invalid image file");
    uploadError.status = 400;
    uploadError.cause = error;

    throw uploadError;
  }
};

// ==================== SUBCATEGORY HELPERS ====================
// Subcategories used to live on a category as a plain array of strings.
// They are now stored as objects ({ id, subcategory, image, available }) so a
// subcategory can own an image, an availability flag and a stable id.
// The helpers below read and write both shapes so that legacy records keep
// working and no existing data is dropped.

const getSubcategoryName = (entry) => {
  if (typeof entry === "string") {
    return entry;
  }

  return entry?.subcategory;
};

const getSubcategoryNames = (category) => {
  return (category?.subcategories || [])
    .map((entry) => getSubcategoryName(entry))
    .filter(Boolean);
};

// Shape a stored entry for the API. Legacy string entries get a temporary
// id based on their position until they are rewritten by a write operation.
const normalizeSubcategory = (entry, categoryId, index) => {
  if (entry && typeof entry === "object") {
    return {
      id: entry.id ?? `legacy-${categoryId}-${index}`,
      subcategory: entry.subcategory,
      image: entry.image || "",
      available: entry.available !== false,
      createdAt: entry.createdAt || null,
      updatedAt: entry.updatedAt || null,
    };
  }

  return {
    id: `legacy-${categoryId}-${index}`,
    subcategory: entry,
    image: "",
    available: true,
    createdAt: null,
    updatedAt: null,
  };
};

// Convert every legacy string entry into a full subcategory object so it
// owns an image, a status and an id. The id of a legacy entry is the same
// temporary id the API already reports, so it stays valid after the write.
// Called before saving a category.
const migrateSubcategories = (category) => {
  category.subcategories = (category.subcategories || []).map((entry, index) => {
    if (entry && typeof entry === "object") {
      return {
        ...entry,
        id: entry.id ?? `legacy-${category.id}-${index}`,
        subcategory: entry.subcategory,
        image: entry.image || "",
        available: entry.available !== false,
      };
    }

    return {
      id: `legacy-${category.id}-${index}`,
      subcategory: entry,
      image: "",
      available: true,
    };
  });
};

// Position of a subcategory inside its category. Legacy entries are addressed
// by their temporary id, so the lookup works for both stored shapes.
const findSubcategoryIndex = (category, subId) => {
  return (category.subcategories || []).findIndex((entry, entryIndex) => {
    const normalized = normalizeSubcategory(entry, category.id, entryIndex);

    return String(normalized.id) === String(subId);
  });
};

// Unique id for a new subcategory, ids follow the same pattern as the
// category and product ids used across the project.
const nextSubcategoryId = (category) => {
  const ids = (category.subcategories || [])
    .map((entry) => Number(entry?.id))
    .filter((value) => Number.isFinite(value));

  const max = ids.length > 0 ? Math.max(...ids) : 0;

  return Math.max(max + 1, Date.now());
};

// Category names are unique regardless of case and surrounding whitespace.
const normalizeCategoryName = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const categoryNamePattern = (name) =>
  new RegExp(`^\\s*${escapeRegExp(name.trim())}\\s*$`, "i");

// Category payload for the admin panel, subcategories as objects.
const serializeCategory = (category) => {
  return {
    ...category.toObject(),
    subcategories: (category.subcategories || []).map((entry, index) =>
      normalizeSubcategory(entry, category.id, index),
    ),
  };
};

// Category payload for the public site, subcategories stay plain strings.
const serializePublicCategory = (category) => {
  return {
    ...category.toObject(),
    subcategories: getSubcategoryNames(category),
  };
};

// Subcategory payload for the admin panel. The parent category is attached
// so the subcategory can be rendered in its own table.
const serializeSubcategory = (entry, category, index) => {
  const normalized = normalizeSubcategory(entry, category.id, index);

  return {
    ...normalized,
    categoryId: category.id,
    category: category.category,
    categoryMongoId: String(category._id),
    categoryImage: category.image || "",
    categoryAvailable: category.available !== false,
    categoryCreatedAt: category.createdAt || null,
    categoryUpdatedAt: category.updatedAt || null,
  };
};

// Subcategory payload for the public site, only the public fields are sent.
const serializePublicSubcategory = (entry, category, index) => {
  const normalized = normalizeSubcategory(entry, category.id, index);

  return {
    id: normalized.id,
    subcategory: normalized.subcategory,
    image: normalized.image,
    available: normalized.available,
    categoryId: category.id,
    category: category.category,
  };
};

let products = [];
let categories = [];
let blogs = [];
let faqs = [];

const allowedTypes = ["New", "Used"];

// ==================== CREATE PRODUCT ====================

app.post("/products", verifyToken, upload.single("image"), async (req, res) => {
  try {
    if (
      !req.body.product ||
      !req.body.price ||
      !req.body.category ||
      !req.body.subcategory ||
      !req.body.type ||
      !req.body.description
    ) {
      return res.status(400).json({
        error: "Please all fields are required",
      });
    }

    const existingProduct = await Product.findOne({
      product: req.body.product,
    });

    if (existingProduct) {
      return res.status(409).json({
        error: "Product already exists",
      });
    }

    const existingCategory = await Category.findOne({
      category: req.body.category,
    });

    if (!existingCategory) {
      return res.status(400).json({
        error: "invalid category",
      });
    }

      const existingSubcategory = getSubcategoryNames(existingCategory).includes(
        req.body.subcategory,
      );

    if (!existingSubcategory) {
      return res.status(400).json({
        error: "invalid subcategory",
      });
    }

    if (!allowedTypes.includes(req.body.type)) {
      return res.status(400).json({
        error: "invalid type",
      });
    }

    if (req.body.available !== "true" && req.body.available !== "false") {
      return res.status(400).json({
        error: "Invalid available value",
      });
    }

    const available = req.body.available === "true";

    if (!req.file) {
      return res.status(400).json({
        error: "Image is required",
      });
    }

    const cloudinaryResult = await uploadToCloudinary(req.file);

    const product = new Product({
      id: Date.now(),
      product: req.body.product,
      price: req.body.price,
      category: req.body.category,
      subcategory: req.body.subcategory,
      type: req.body.type,
      description: req.body.description.trim(),

      // Product Details
      designMotif: req.body.designMotif || "",
      centerpieceStone: req.body.centerpieceStone || "",
      earringStyle: req.body.earringStyle || "",
      embellishments: req.body.embellishments || "",
      finish: req.body.finish || "",

      available: available,
      image: cloudinaryResult.secure_url,
      userEmail: req.user.email,
    });

    await product.save();

    res.status(201).json(product);
  } catch (error) {
    console.log("Product Save Error:", error);

    res.status(500).json({
      error: "Failed to save product",
    });
  }
});

// ==================== GET PUBLIC PRODUCTS ====================

app.get("/public/products", async (req, res) => {
  try {
    const products = await Product.find();

    res.send(products);
  } catch (error) {
    console.log("Get Public Products Error:", error);

    res.status(500).json({
      error: "Failed to get public products",
    });
  }
});

// ==================== GET ADMIN PRODUCTS ====================

app.get("/products", verifyToken, async (req, res) => {
  try {
    const userProducts = await Product.find({
      userEmail: req.user.email,
    });

    res.send(userProducts);
  } catch (error) {
    console.log("Get Products Error:", error);

    res.status(500).json({
      error: "Failed to get products",
    });
  }
});

// ==================== UPDATE PRODUCT ====================

app.put(
  "/products/:id",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const product = await Product.findOne({
        id: id,
        userEmail: req.user.email,
      });

      if (!product) {
        return res.status(403).json({
          error: "You cannot update this product",
        });
      }

      if (
        !req.body.product ||
        !req.body.price ||
        !req.body.category ||
        !req.body.subcategory ||
        !req.body.type ||
        !req.body.description
      ) {
        return res.status(400).json({
          error: "Please all fields are required",
        });
      }

      const existingCategory = await Category.findOne({
        category: req.body.category,
      });

      if (!existingCategory) {
        return res.status(400).json({
          error: "invalid category",
        });
      }

      const existingSubcategory = getSubcategoryNames(existingCategory).includes(
        req.body.subcategory,
      );

      if (!existingSubcategory) {
        return res.status(400).json({
          error: "invalid subcategory",
        });
      }

      if (!allowedTypes.includes(req.body.type)) {
        return res.status(400).json({
          error: "invalid type",
        });
      }

      if (req.body.available !== "true" && req.body.available !== "false") {
        return res.status(400).json({
          error: "Invalid available value",
        });
      }

      product.product = req.body.product;
      product.price = req.body.price;
      product.category = req.body.category;
      product.subcategory = req.body.subcategory;
      product.type = req.body.type;
      product.description = req.body.description.trim();

      // Product Details
      product.designMotif = req.body.designMotif || "";
      product.centerpieceStone = req.body.centerpieceStone || "";
      product.earringStyle = req.body.earringStyle || "";
      product.embellishments = req.body.embellishments || "";
      product.finish = req.body.finish || "";

      product.available = req.body.available === "true";

      if (req.file) {
        const cloudinaryResult = await uploadToCloudinary(req.file);
        product.image = cloudinaryResult.secure_url;
      }

      await product.save();

      res.send(product);
    } catch (error) {
      console.log("Update Product Error:", error);

      res.status(500).json({
        error: "Failed to update product",
      });
    }
  },
);

// ==================== DELETE PRODUCT ====================

app.delete("/products/:id", verifyToken, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const product = await Product.findOne({
      id: id,
      userEmail: req.user.email,
    });

    if (!product) {
      return res.status(403).json({
        error: "You cannot delete this product",
      });
    }

    await Product.deleteOne({
      id: id,
      userEmail: req.user.email,
    });

    res.send("Product deleted successfully");
  } catch (error) {
    console.log("Delete Product Error:", error);

    res.status(500).json({
      error: "Failed to delete product",
    });
  }
});

// ==================== CREATE CATEGORY ====================

app.post(
  "/categories",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.body.category || !req.body.category.trim()) {
        return res.status(400).json({
          error: "Category name is required",
        });
      }

      const categoryName = req.body.category.trim();

      const existingCategory = await Category.findOne({
        category: categoryNamePattern(categoryName),
      });

      if (existingCategory) {
        return res.status(409).json({
          error: "Category already exists",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "Category image is required",
        });
      }

      const cloudinaryResult = await uploadToCloudinary(req.file);

      const category = new Category({
        id: Date.now(),
        category: categoryName,
        subcategories: [],
        available: req.body.available === "true",
        image: cloudinaryResult.secure_url,
        userEmail: req.user.email,
      });

      await category.save();

      res.status(201).json(category);
    } catch (error) {
      console.log("Category Save Error:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  },
);

// ==================== GET ADMIN CATEGORIES ====================

app.get("/categories", verifyToken, async (req, res) => {
  try {
    const userCategories = await Category.find({
      userEmail: req.user.email,
    });

    res.send(userCategories.map((category) => serializeCategory(category)));
  } catch (error) {
    console.log("Get Categories Error:", error);

    res.status(500).json({
      error: "Failed to get categories",
    });
  }
});

// ==================== GET PUBLIC CATEGORIES ====================

app.get("/public/categories", async (req, res) => {
  try {
    const categories = await Category.find();

    res.send(
      categories.map((category) => serializePublicCategory(category)),
    );
  } catch (error) {
    console.log("Get Public Categories Error:", error);

    res.status(500).json({
      error: "Failed to get public categories",
    });
  }
});

// ==================== UPDATE CATEGORY ====================

app.put(
  "/categories/:id",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const category = await Category.findOne({
        id: id,
        userEmail: req.user.email,
      });

      if (!category) {
        return res.status(403).json({
          error: "You cannot update this category",
        });
      }

      if (!req.body.category || !req.body.category.trim()) {
        return res.status(400).json({
          error: "Category name is required",
        });
      }

      const nextCategoryName = req.body.category.trim();

      // An unchanged name belongs to this category, so it must never be
      // compared against the other categories (a legacy duplicate name must
      // not block saving unrelated changes either).
      const nameChanged =
        normalizeCategoryName(nextCategoryName) !==
        normalizeCategoryName(category.category);

      if (nameChanged) {
        const duplicate = await Category.findOne({
          _id: { $ne: category._id },
          category: categoryNamePattern(nextCategoryName),
        });

        if (duplicate) {
          return res.status(409).json({
            error: "Category already exists",
          });
        }
      }

      category.category = nextCategoryName;
      category.available = req.body.available === "true";

      if (req.file) {
        const cloudinaryResult = await uploadToCloudinary(req.file);
        category.image = cloudinaryResult.secure_url;
      }

      await category.save();

      res.send(category);
    } catch (error) {
      console.log("Update Category Error:", error);

      res.status(500).json({
        error: "Failed to update category",
      });
    }
  },
);

// ==================== DELETE CATEGORY ====================

app.delete("/categories/:id", verifyToken, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const category = await Category.findOne({
      id: id,
      userEmail: req.user.email,
    });

    if (!category) {
      return res.status(403).json({
        error: "You cannot delete this category",
      });
    }

    await Category.deleteOne({
      id: id,
      userEmail: req.user.email,
    });

    res.send("Category deleted successfully");
  } catch (error) {
    console.log("Delete Category Error:", error);

    res.status(500).json({
      error: "Failed to delete category",
    });
  }
});

// ==================== CHECK EMAIL ====================

// ==================== CHECK EMAIL ====================

app.get("/check-email", async (req, res) => {
  try {
    const email = req.query.email;

    if (!email) {
      return res.status(400).json({
        error: "Email is required",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    res.json({
      exists: !!user,
    });
  } catch (error) {
    console.log("Check Email Error:", error);

    res.status(500).json({
      error: "Failed to check email",
    });
  }
});
// ==================== REGISTER ====================

// ==================== REGISTER ====================

// Message that is returned whenever a mobile number is already taken.
const DUPLICATE_PHONE_MESSAGE =
  "This mobile number is already registered. Please use another number.";

// A duplicate key error does not say which unique index was violated, the
// key pattern (or the index name inside the message) tells us.
const duplicateKeyField = (error) => {
  const keyPattern = error?.keyPattern || {};

  if (keyPattern.phoneNumber || keyPattern.phoneKey) {
    return "phoneNumber";
  }

  if (keyPattern.email) {
    return "email";
  }

  const message = String(error?.message || "");

  if (message.includes("phoneNumber_unique_enforced")) {
    return "phoneNumber";
  }

  if (message.includes("email_1")) {
    return "email";
  }

  return null;
};

app.post("/register", async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;
    const phoneNumber = String(req.body.phoneNumber || "").trim();

    const errors = {};

    if (!name) {
      errors.name = "Name is required";
    }

    if (!email) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Invalid Email";
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Invalid Password Formate";
    }

    if (!phoneNumber) {
      errors.phoneNumber = "Phone Number is required";
    } else if (!/^\d{10}$/.test(phoneNumber)) {
      errors.phoneNumber = "Please Fill Correct Phone Number";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        errors: {
          email: "Email Already Exist",
        },
      });
    }

    // A mobile number can only be used once. The check covers every user
    // that already exists, also the ones that were created before the
    // unique index was added.
    const existingPhoneUser = await User.findOne({ phoneNumber });

    if (existingPhoneUser) {
      return res.status(409).json({
        message: DUPLICATE_PHONE_MESSAGE,
        errors: {
          phoneNumber: DUPLICATE_PHONE_MESSAGE,
        },
      });
    }

    const user = new User({
      name,
      email,
      password,
      phoneNumber,
    });

    await user.save();

    res.status(201).json({
      message: "All details received",
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    console.log("Register Error:", error);

    if (error.code === 11000) {
      // Two requests can pass the check above at the same time, the unique
      // index in the database stops the second one.
      if (duplicateKeyField(error) === "phoneNumber") {
        return res.status(409).json({
          message: DUPLICATE_PHONE_MESSAGE,
          errors: {
            phoneNumber: DUPLICATE_PHONE_MESSAGE,
          },
        });
      }

      return res.status(409).json({
        errors: {
          email: "Email Already Exist",
        },
      });
    }

    res.status(500).json({
      message: "Registration failed",
    });
  }
});

// ==================== LIST SUBCATEGORIES (ADMIN) ====================
// The admin panel shows the subcategories in their own table, so every
// subcategory of the logged in user is returned as a flat list with the
// parent category attached to it.

app.get("/subcategories", verifyToken, async (req, res) => {
  try {
    const query = { userEmail: req.user.email };

    if (req.query.categoryId !== undefined && req.query.categoryId !== "") {
      const categoryId = Number(req.query.categoryId);

      if (!Number.isFinite(categoryId)) {
        return res.status(400).json({
          error: "Invalid category id",
        });
      }

      query.id = categoryId;
    }

    if (
      req.query.available !== undefined &&
      req.query.available !== "" &&
      req.query.available !== "true" &&
      req.query.available !== "false"
    ) {
      return res.status(400).json({
        error: "Invalid available value",
      });
    }

    const categories = await Category.find(query);

    let subcategories = categories.flatMap((category) =>
      (category.subcategories || []).map((entry, index) =>
        serializeSubcategory(entry, category, index),
      ),
    );

    if (req.query.available !== undefined && req.query.available !== "") {
      const available = req.query.available === "true";

      subcategories = subcategories.filter((item) => item.available === available);
    }

    if (req.query.search && req.query.search.trim()) {
      const search = req.query.search.trim().toLowerCase();

      subcategories = subcategories.filter(
        (item) =>
          (item.subcategory || "").toLowerCase().includes(search) ||
          (item.category || "").toLowerCase().includes(search),
      );
    }

    res.send(subcategories);
  } catch (error) {
    console.log("Get Subcategories Error:", error);

    res.status(500).json({
      error: "Failed to get subcategories",
    });
  }
});

// ==================== GET SINGLE SUBCATEGORY (ADMIN) ====================

app.get("/subcategories/:subId", verifyToken, async (req, res) => {
  try {
    const categories = await Category.find({ userEmail: req.user.email });

    for (const category of categories) {
      const index = findSubcategoryIndex(category, req.params.subId);

      if (index !== -1) {
        return res.send(
          serializeSubcategory(category.subcategories[index], category, index),
        );
      }
    }

    res.status(404).json({
      error: "Subcategory not found",
    });
  } catch (error) {
    console.log("Get Subcategory Error:", error);

    res.status(500).json({
      error: "Failed to get subcategory",
    });
  }
});

// ==================== GET CATEGORY SUBCATEGORIES (ADMIN) ====================

app.get("/categories/:id/subcategories", verifyToken, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        error: "Invalid category id",
      });
    }

    const category = await Category.findOne({
      id: id,
      userEmail: req.user.email,
    });

    if (!category) {
      return res.status(404).json({
        error: "Category not found",
      });
    }

    res.send(
      (category.subcategories || []).map((entry, index) =>
        serializeSubcategory(entry, category, index),
      ),
    );
  } catch (error) {
    console.log("Get Category Subcategories Error:", error);

    res.status(500).json({
      error: "Failed to get subcategories",
    });
  }
});

// ==================== GET SINGLE CATEGORY SUBCATEGORY (ADMIN) ====================

app.get(
  "/categories/:id/subcategories/:subId",
  verifyToken,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          error: "Invalid category id",
        });
      }

      const category = await Category.findOne({
        id: id,
        userEmail: req.user.email,
      });

      if (!category) {
        return res.status(404).json({
          error: "Category not found",
        });
      }

      const index = findSubcategoryIndex(category, req.params.subId);

      if (index === -1) {
        return res.status(404).json({
          error: "Subcategory not found",
        });
      }

      res.send(serializeSubcategory(category.subcategories[index], category, index));
    } catch (error) {
      console.log("Get Category Subcategory Error:", error);

      res.status(500).json({
        error: "Failed to get subcategory",
      });
    }
  },
);

// ==================== GET PUBLIC CATEGORY SUBCATEGORIES ====================
// Read only endpoint for the customer website, it returns the subcategories
// of a category including their own image.

app.get("/public/categories/:id/subcategories", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        error: "Invalid category id",
      });
    }

    const category = await Category.findOne({ id: id });

    if (!category) {
      return res.status(404).json({
        error: "Category not found",
      });
    }

    res.send(
      (category.subcategories || []).map((entry, index) =>
        serializePublicSubcategory(entry, category, index),
      ),
    );
  } catch (error) {
    console.log("Get Public Subcategories Error:", error);

    res.status(500).json({
      error: "Failed to get subcategories",
    });
  }
});

// ==================== CREATE SUBCATEGORY ====================

app.post(
  "/categories/:id/subcategories",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const category = await Category.findOne({
        id: id,
        userEmail: req.user.email,
      });

      if (!category) {
        return res.status(403).json({
          error: "You cannot update this category",
        });
      }

      if (!req.body?.subcategory || !req.body.subcategory.trim()) {
        return res.status(400).json({
          error: "Subcategory name is required",
        });
      }

      const subcategory = req.body.subcategory.trim();

      const existingSubcategory = getSubcategoryNames(category).some(
        (item) => item.toLowerCase() === subcategory.toLowerCase(),
      );

      if (existingSubcategory) {
        return res.status(409).json({
          error: "Subcategory already exists",
        });
      }

      let image = "";

      try {
        image = await uploadImage(req.file);
      } catch (error) {
        return res.status(400).json({
          error: error.message,
        });
      }

      migrateSubcategories(category);

      const now = new Date().toISOString();

      category.subcategories.push({
        id: nextSubcategoryId(category),
        subcategory: subcategory,
        image: image,
        available: req.body?.available !== "false",
        createdAt: now,
        updatedAt: now,
      });

      await category.save();

      res.status(201).json(serializeCategory(category));
    } catch (error) {
      console.log("Subcategory Save Error:", error);

      res.status(500).json({
        error: "Failed to save subcategory",
      });
    }
  },
);

// ==================== UPDATE SUBCATEGORY ====================

app.put(
  "/categories/:id/subcategories/:subId",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const category = await Category.findOne({
        id: id,
        userEmail: req.user.email,
      });

      if (!category) {
        return res.status(403).json({
          error: "You cannot update this category",
        });
      }

      // Resolve the position before migrating, a legacy entry is addressed
      // by its temporary id which only exists on the stored shape.
      const index = findSubcategoryIndex(category, req.params.subId);

      if (index === -1) {
        return res.status(404).json({
          error: "Subcategory not found",
        });
      }

      migrateSubcategories(category);

      const current = category.subcategories[index];
      const previousName = current.subcategory;

      let subcategory = previousName;

      if (req.body?.subcategory !== undefined) {
        if (!req.body.subcategory || !req.body.subcategory.trim()) {
          return res.status(400).json({
            error: "Subcategory name is required",
          });
        }

        subcategory = req.body.subcategory.trim();

        const duplicate = getSubcategoryNames(category).some(
          (item, itemIndex) =>
            itemIndex !== index &&
            item.toLowerCase() === subcategory.toLowerCase(),
        );

        if (duplicate) {
          return res.status(409).json({
            error: "Subcategory already exists",
          });
        }
      }

      if (req.file) {
        try {
          current.image = await uploadImage(req.file);
        } catch (error) {
          return res.status(400).json({
            error: error.message,
          });
        }
      }

      current.subcategory = subcategory;
      current.updatedAt = new Date().toISOString();

      if (req.body?.available !== undefined) {
        current.available = req.body.available !== "false";
      }

      // The subcategories array is a Mixed path, so mutating an entry in
      // place is not tracked by Mongoose. Mark the path explicitly or the
      // updated values are only present in this response and never saved.
      category.markModified("subcategories");

      await category.save();

      // Products keep a reference to their subcategory by name, the products
      // are renamed as well so no product loses its subcategory.
      if (subcategory !== previousName) {
        await Product.updateMany(
          {
            category: category.category,
            subcategory: previousName,
          },
          {
            $set: { subcategory: subcategory },
          },
        );
      }

      res.send(serializeCategory(category));
    } catch (error) {
      console.log("Update Subcategory Error:", error);

      res.status(500).json({
        error: "Failed to update subcategory",
      });
    }
  },
);

// ==================== DELETE SUBCATEGORY ====================

app.delete("/categories/:id/subcategories/:subId", verifyToken, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const category = await Category.findOne({
      id: id,
      userEmail: req.user.email,
    });

    if (!category) {
      return res.status(403).json({
        error: "You cannot update this category",
      });
    }

    const index = findSubcategoryIndex(category, req.params.subId);

    if (index === -1) {
      return res.status(404).json({
        error: "Subcategory not found",
      });
    }

    const current = normalizeSubcategory(
      category.subcategories[index],
      category.id,
      index,
    );

    // A subcategory that is still used by a product is not deleted, the
    // product would end up with a subcategory that does not exist anymore.
    const linkedProducts = await Product.countDocuments({
      category: category.category,
      subcategory: current.subcategory,
    });

    if (linkedProducts > 0) {
      return res.status(409).json({
        error: `Cannot delete "${current.subcategory}". ${linkedProducts} product(s) are using this subcategory, reassign or remove them first.`,
        linkedProducts: linkedProducts,
      });
    }

    migrateSubcategories(category);

    category.subcategories.splice(index, 1);

    await category.save();

    res.send(serializeCategory(category));
  } catch (error) {
    console.log("Delete Subcategory Error:", error);

    res.status(500).json({
      error: "Failed to delete subcategory",
    });
  }
});

// ==================== LOGIN ====================

// ==================== LOGIN ====================
// ==================== ADMIN: GET REGISTERED USERS ====================

app.get("/admin/users", verifyToken, async (req, res) => {
  try {
    // Admin email .env se milega
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

    // Logged-in user ka email
    const loggedInEmail = req.user?.email?.trim().toLowerCase();

    // Admin email configure nahi hai
    if (!adminEmail) {
      return res.status(500).json({
        error: "ADMIN_EMAIL is not configured in the backend .env file.",
      });
    }

    // Sirf authorized admin ko access milega
    if (!loggedInEmail || loggedInEmail !== adminEmail) {
      return res.status(403).json({
        error: "Only the authorized admin can view registered users.",
      });
    }

    // MongoDB se registered users fetch karo
    // Password kabhi response mein nahi bhejna
    const users = await User.find()
      .select("name email phoneNumber createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      total: users.length,
      users: users,
    });
  } catch (error) {
    console.error("Get Registered Users Error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch registered users.",
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    const errors = {};

    if (!email) {
      errors.email = "Email is required";
    }

    if (!password) {
      errors.password = "Password is required";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(400).json({
        errors: {
          email: "Email does not exist",
        },
      });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(400).json({
        errors: {
          password: "Invalid Password",
        },
      });
    }

    const token = jwt.sign(
      { id: String(user._id), email: user.email },
      "my-secret-key",
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: "Login Successful",
      token,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    console.log("Login Error:", error);

    res.status(500).json({
      message: "Login failed",
    });
  }
});

// ==================== CREATE BLOG ====================

app.post("/blogs", verifyToken, upload.single("image"), async (req, res) => {
  try {
    if (!req.body.title || !req.body.description) {
      return res.status(400).json({
        error: "Title and description are required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Blog image is required",
      });
    }

    const existingBlog = await Blog.findOne({
      title: req.body.title.trim(),
    });

    if (existingBlog) {
      return res.status(409).json({
        error: "Blog already exists",
      });
    }

    const cloudinaryResult = await uploadToCloudinary(req.file);

    const blog = new Blog({
      id: Date.now(),
      title: req.body.title.trim(),
      description: req.body.description.trim(),
      image: cloudinaryResult.secure_url,
      userEmail: req.user.email,
    });

    await blog.save();

    res.status(201).json(blog);
  } catch (error) {
    console.log("Blog Save Error:", error);

    res.status(500).json({
      error: "Failed to save blog",
    });
  }
});

// ==================== GET PUBLIC BLOGS ====================

app.get("/public/blogs", async (req, res) => {
  try {
    const blogs = await Blog.find();

    res.send(blogs);
  } catch (error) {
    console.log("Get Public Blogs Error:", error);

    res.status(500).json({
      error: "Failed to get public blogs",
    });
  }
});

// ==================== CREATE FAQ ====================

app.post("/faqs", verifyToken, async (req, res) => {
  try {
    if (!req.body.question || !req.body.answer) {
      return res.status(400).json({
        error: "Question and answer are required",
      });
    }

    const existingFaq = await Faq.findOne({
      question: req.body.question.trim(),
    });

    if (existingFaq) {
      return res.status(409).json({
        error: "FAQ already exists",
      });
    }

    const faq = new Faq({
      id: Date.now(),
      question: req.body.question.trim(),
      answer: req.body.answer.trim(),
      userEmail: req.user.email,
    });

    await faq.save();

    res.status(201).json(faq);
  } catch (error) {
    console.log("FAQ Save Error:", error);

    res.status(500).json({
      error: "Failed to save FAQ",
    });
  }
});

// ==================== GET PUBLIC FAQS ====================

app.get("/public/faqs", async (req, res) => {
  try {
    const faqs = await Faq.find();

    res.send(faqs);
  } catch (error) {
    console.log("Get Public FAQs Error:", error);

    res.status(500).json({
      error: "Failed to get public FAQs",
    });
  }
});
// ==================== CREATE PRODUCT REVIEW ====================

app.post("/public/products/:productId/reviews", async (req, res) => {
  try {
    const { userName, rating, comment } = req.body;
    const productId = req.params.productId;

    if (!userName || !userName.trim()) {
      return res.status(400).json({
        error: "User name is required",
      });
    }

    if (
      rating === undefined ||
      rating === null ||
      rating === "" ||
      !Number.isInteger(Number(rating)) ||
      Number(rating) < 1 ||
      Number(rating) > 5
    ) {
      return res.status(400).json({
        error: "Rating must be between 1 and 5",
      });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        error: "Review comment is required",
      });
    }

    const product = await Product.findOne({
      $or: [
        { id: productId },
        ...(Number.isFinite(Number(productId))
          ? [{ id: Number(productId) }]
          : []),
        ...(mongoose.Types.ObjectId.isValid(productId)
          ? [{ _id: productId }]
          : []),
      ],
    });

    if (!product) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    const review = new Review({
      productId: String(product.id),
      userName: userName.trim(),
      rating: Number(rating),
      comment: comment.trim(),
    });

    await review.save();

    res.status(201).json({
      message: "Review submitted successfully",
      review,
    });
  } catch (error) {
    console.log("Create Review Error:", error);

    res.status(500).json({
      error: "Failed to submit review",
    });
  }
});


// ==================== GET PRODUCT REVIEWS ====================

app.get("/public/products/:productId/reviews", async (req, res) => {
  try {
    const productId = req.params.productId;

    const product = await Product.findOne({
      $or: [
        { id: productId },
        ...(Number.isFinite(Number(productId))
          ? [{ id: Number(productId) }]
          : []),
        ...(mongoose.Types.ObjectId.isValid(productId)
          ? [{ _id: productId }]
          : []),
      ],
    });

    if (!product) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    const reviews = await Review.find({
      productId: String(product.id),
    }).sort({ createdAt: -1 });

    const totalReviews = reviews.length;

    const averageRating =
      totalReviews > 0
        ? Number(
            (
              reviews.reduce((total, review) => total + review.rating, 0) /
              totalReviews
            ).toFixed(1),
          )
        : 0;

    const ratingBreakdown = {
      5: reviews.filter((review) => review.rating === 5).length,
      4: reviews.filter((review) => review.rating === 4).length,
      3: reviews.filter((review) => review.rating === 3).length,
      2: reviews.filter((review) => review.rating === 2).length,
      1: reviews.filter((review) => review.rating === 1).length,
    };

    res.json({
      reviews,
      totalReviews,
      averageRating,
      ratingBreakdown,
    });
  } catch (error) {
    console.log("Get Reviews Error:", error);

    res.status(500).json({
      error: "Failed to get reviews",
    });
  }
});

// ==================== GET PROFILE ====================

app.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await findAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Session is no longer valid. Please log in again.",
      });
    }

    res.status(200).json({
      user: {
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.log("Get Profile Error:", error);

    res.status(500).json({
      error: "Failed to get profile",
    });
  }
});

// ==================== UPDATE PROFILE ====================

app.put("/profile", verifyToken, async (req, res) => {
  try {
    const user = await findAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Session is no longer valid. Please log in again.",
      });
    }

    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const phoneNumber = String(req.body.phoneNumber || "").trim();

    const errors = {};

    if (!name) {
      errors.name = "Name is required";
    }

    if (!email) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Invalid Email";
    }

    if (!phoneNumber) {
      errors.phoneNumber = "Phone Number is required";
    } else if (!/^\d{10}$/.test(phoneNumber)) {
      errors.phoneNumber = "Please Fill Correct Phone Number";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const duplicateEmail = await User.findOne({
      email: email,
      _id: { $ne: user._id },
    });

    if (duplicateEmail) {
      return res.status(409).json({
        errors: {
          email: "Email Already Exist",
        },
      });
    }

    user.name = name;
    user.email = email;
    user.phoneNumber = phoneNumber;

    await user.save();

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.log("Update Profile Error:", error);

    if (error.code === 11000) {
      if (duplicateKeyField(error) === "phoneNumber") {
        return res.status(409).json({
          message: DUPLICATE_PHONE_MESSAGE,
          errors: {
            phoneNumber: DUPLICATE_PHONE_MESSAGE,
          },
        });
      }

      return res.status(409).json({
        errors: {
          email: "Email Already Exist",
        },
      });
    }

    if (error.name === "ValidationError") {
      const errors = {};

      Object.keys(error.errors).forEach((field) => {
        errors[field] = error.errors[field].message;
      });

      return res.status(400).json({ errors });
    }

    res.status(500).json({
      error: "Failed to update profile",
    });
  }
});

// ==================== ERROR HANDLER ====================
// Multer rejects an invalid or oversized upload before the route handler
// runs, so those errors are turned into a clean response here.

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Image size must be 5MB or less"
        : "Invalid image upload";

    return res.status(400).json({ error: message });
  }

  if (error && error.status === 400) {
    return res.status(400).json({ error: error.message });
  }

  console.log("Unhandled Error:", error);

  res.status(500).json({
    error: "Something went wrong",
  });
});

// ==================== SERVER ====================

// The unique indexes of the user collection are created on startup so that
// the database itself rejects a duplicate mobile number and not only the
// application code.
const ensureUserIndexes = async () => {
  try {
    await User.createIndexes();

    console.log("User indexes are up to date");
  } catch (error) {
    console.error("User Index Error:", error.message);
  }
};

const startServer = () => {
  app.listen(port, async () => {
    try {
      await mongoose.connect(process.env.MONGO_URL);

      console.log("MongoDB Connected Successfully");

      await ensureUserIndexes();
    } catch (error) {
      console.log("MongoDB Connection Error:", error);
    }

    console.log(`Example app http://localhost:${port}`);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.ensureUserIndexes = ensureUserIndexes;
module.exports.startServer = startServer;
