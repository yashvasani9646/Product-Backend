require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const app = express();
const port = process.env.PORT || 3000;

const Category = require("./model/Category");
const Product = require("./model/Product");
const Blog = require("./model/Blog");
const Faq = require("./model/Faq");

console.log("Cloudinary Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(
  cors({
    origin: [
      "https://yash-single-product.vercel.app",
      "https://products-gamma-pink.vercel.app",
      "https://products-rshc.vercel.app",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const multer = require("multer");

app.use(express.json());
app.use("/uploads", express.static("uploads"));

const users = [];

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

const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

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
      !req.body.type
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

    const existingSubcategory = existingCategory.subcategories.find(
      (item) => item === req.body.subcategory,
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
        !req.body.type
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

      const existingSubcategory = existingCategory.subcategories.find(
        (item) => item === req.body.subcategory,
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
      if (!req.body.category) {
        return res.status(400).json({
          error: "Category name is required",
        });
      }

      const existingCategory = await Category.findOne({
        category: req.body.category.trim(),
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
        category: req.body.category.trim(),
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

    res.send(userCategories);
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

    res.send(categories);
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

      if (!req.body.category) {
        return res.status(400).json({
          error: "Category name is required",
        });
      }

      const duplicate = await Category.findOne({
        id: { $ne: id },
        category: req.body.category.trim(),
      });

      if (duplicate) {
        return res.status(409).json({
          error: "Category already exists",
        });
      }

      category.category = req.body.category.trim();
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

app.get("/check-email", (req, res) => {
  const email = req.query.email;

  const exists = users.some((user) => user.email === email);

  res.json({
    exists: exists,
  });
});

// ==================== REGISTER ====================

app.post("/register", (req, res) => {
  console.log(req.body);

  const errors = {};

  if (!req.body.name) {
    errors.name = "Name is required";
  }

  if (!req.body.email) {
    errors.email = "Email is required";
  } else if (!req.body.email.includes("@")) {
    errors.email = "Invalid Email";
  } else if (users.some((user) => user.email === req.body.email)) {
    errors.email = "Email Already Exist";
  }

  if (!req.body.password) {
    errors.password = "Password is required";
  } else if (req.body.password.length < 8) {
    errors.password = "Invalid Password Formate";
  }

  if (!req.body.phoneNumber) {
    errors.phoneNumber = "Phone Number is required";
  } else if (req.body.phoneNumber.length !== 10) {
    errors.phoneNumber = "Please Fill Correct Phone Number";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      errors: errors,
    });
  }

  users.push(req.body);

  console.log(users);

  res.status(200).json({
    message: "All details received",
  });
});

// ==================== CREATE SUBCATEGORY ====================

app.post("/categories/:id/subcategories", verifyToken, async (req, res) => {
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

    if (!req.body.subcategory || !req.body.subcategory.trim()) {
      return res.status(400).json({
        error: "Subcategory name is required",
      });
    }

    const subcategory = req.body.subcategory.trim();

    const existingSubcategory = category.subcategories.find((item) => {
      return item.toLowerCase() === subcategory.toLowerCase();
    });

    if (existingSubcategory) {
      return res.status(409).json({
        error: "Subcategory already exists",
      });
    }

    category.subcategories.push(subcategory);

    await category.save();

    res.send(category);
  } catch (error) {
    console.log("Subcategory Save Error:", error);

    res.status(500).json({
      error: "Failed to save subcategory",
    });
  }
});

// ==================== LOGIN ====================

app.post("/login", (req, res) => {
  const errors = {};

  const user = users.find((user) => user.email === req.body.email);

  if (!req.body.email) {
    errors.email = "Email is required";
  } else if (!users.some((user) => user.email === req.body.email)) {
    errors.email = "Email does not exist";
  }

  if (!req.body.password) {
    errors.password = "Password is required";
  } else {
    if (user && user.password !== req.body.password) {
      errors.password = "Invalid Password";
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      errors: errors,
    });
  }

  const token = jwt.sign({ email: user.email }, "my-secret-key", {
    expiresIn: "1h",
  });

  res.status(200).json({
    message: "Login Successful",
    token: token,
    user: {
      name: user.name,
      email: user.email,
    },
  });
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

// ==================== SERVER ====================

app.listen(port, () => {
  mongoose
    .connect(process.env.MONGO_URL)
    .then(() => {
      console.log("MongoDB Connected Successfully");
    })
    .catch((error) => {
      console.log("MongoDB Connection Error:", error);
    });

  console.log(`Example app http://localhost:${port}`);
});
