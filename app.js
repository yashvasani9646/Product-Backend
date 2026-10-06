const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
app.use(
  cors({
    origin: [
      "https://yash-single-product.vercel.app",
      "https://products-gamma-pink.vercel.app",
      "https://products-rshc.vercel.app",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

let products = [];
let categories = [];
let blogs = [];
let faqs = [];

const allowedTypes = ["New", "Used"];

// ==================== CREATE PRODUCT ====================

app.post("/products", verifyToken, upload.single("image"), (req, res) => {
  const existingProduct = products.find((item) => {
    return item.product === req.body.product;
  });

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

  if (existingProduct) {
    return res.status(409).json({
      error: "Product already exists",
    });
  }

  const existingCategory = categories.find((item) => {
    return item.category === req.body.category;
  });

  if (!existingCategory) {
    return res.status(400).json({
      error: "invalid category",
    });
  }

  const existingSubcategory = existingCategory.subcategories.find((item) => {
    return item === req.body.subcategory;
  });

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

  const product = {
    id: Date.now(),
    product: req.body.product,
    price: req.body.price,
    category: req.body.category,
    subcategory: req.body.subcategory,
    type: req.body.type,
    available: available,
    image: req.file.filename,
    userEmail: req.user.email,
  };

  products.push(product);

  res.send(product);
});

// ==================== GET PUBLIC PRODUCTS ====================

app.get("/public/products", (req, res) => {
  res.send(products);
});

// ==================== GET ADMIN PRODUCTS ====================

app.get("/products", verifyToken, (req, res) => {
  const userProducts = products.filter((item) => {
    return item.userEmail === req.user.email;
  });

  res.send(userProducts);
});

// ==================== UPDATE PRODUCT ====================

app.put("/products/:id", verifyToken, upload.single("image"), (req, res) => {
  const id = Number(req.params.id);

  const product = products.find((product) => {
    return product.id === id;
  });

  if (!product || product.userEmail !== req.user.email) {
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

  const existingCategory = categories.find((item) => {
    return item.category === req.body.category;
  });

  if (!existingCategory) {
    return res.status(400).json({
      error: "invalid category",
    });
  }

  const existingSubcategory = existingCategory.subcategories.find((item) => {
    return item === req.body.subcategory;
  });

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

  console.log(req.body);

  product.product = req.body.product;
  product.price = req.body.price;
  product.category = req.body.category;
  product.subcategory = req.body.subcategory;
  product.type = req.body.type;
  product.available = req.body.available === "true";

  if (req.file) {
    product.image = req.file.filename;
  }

  console.log(product);

  res.send(product);
});

// ==================== DELETE PRODUCT ====================

app.delete("/products/:id", verifyToken, (req, res) => {
  const id = Number(req.params.id);

  const product = products.find((item) => {
    return item.id === id;
  });

  if (!product || product.userEmail !== req.user.email) {
    return res.status(403).json({
      error: "You cannot delete this product",
    });
  }

  products = products.filter((item) => item.id !== id);

  console.log(products);

  res.send("Product deleted successfully");
});

// ==================== CREATE CATEGORY ====================

app.post("/categories", verifyToken, upload.single("image"), (req, res) => {
  if (!req.body.category) {
    return res.status(400).json({
      error: "Category name is required",
    });
  }

  const existingCategory = categories.find((item) => {
    return (
      item.category.toLowerCase() === req.body.category.trim().toLowerCase()
    );
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

  const category = {
    id: Date.now(),
    category: req.body.category.trim(),
    subcategories: [],
    available: req.body.available === "true",
    image: req.file.filename,
    userEmail: req.user.email,
  };

  categories.push(category);

  res.send(category);
});

// ==================== GET ADMIN CATEGORIES ====================

app.get("/categories", verifyToken, (req, res) => {
  const userCategories = categories.filter((item) => {
    return item.userEmail === req.user.email;
  });

  res.send(userCategories);
});

// ==================== GET PUBLIC CATEGORIES ====================

app.get("/public/categories", (req, res) => {
  res.send(categories);
});

// ==================== UPDATE CATEGORY ====================

app.put("/categories/:id", verifyToken, upload.single("image"), (req, res) => {
  const id = Number(req.params.id);

  const category = categories.find((item) => {
    return item.id === id;
  });

  if (!category || category.userEmail !== req.user.email) {
    return res.status(403).json({
      error: "You cannot update this category",
    });
  }

  if (!req.body.category) {
    return res.status(400).json({
      error: "Category name is required",
    });
  }

  const duplicate = categories.find((item) => {
    return (
      item.id !== id &&
      item.category.toLowerCase() === req.body.category.trim().toLowerCase()
    );
  });

  if (duplicate) {
    return res.status(409).json({
      error: "Category already exists",
    });
  }

  category.category = req.body.category.trim();
  category.available = req.body.available === "true";

  if (req.file) {
    category.image = req.file.filename;
  }

  res.send(category);
});

// ==================== DELETE CATEGORY ====================

app.delete("/categories/:id", verifyToken, (req, res) => {
  const id = Number(req.params.id);

  const category = categories.find((item) => {
    return item.id === id;
  });

  if (!category || category.userEmail !== req.user.email) {
    return res.status(403).json({
      error: "You cannot delete this category",
    });
  }

  categories = categories.filter((item) => item.id !== id);

  console.log(categories);

  res.send("Category deleted successfully");
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

app.post("/categories/:id/subcategories", verifyToken, (req, res) => {
  const id = Number(req.params.id);

  const category = categories.find((item) => {
    return item.id === id;
  });

  if (!category || category.userEmail !== req.user.email) {
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

  res.send(category);
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

app.post("/blogs", verifyToken, upload.single("image"), (req, res) => {
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

  const existingBlog = blogs.find((item) => {
    return item.title.toLowerCase() === req.body.title.trim().toLowerCase();
  });

  if (existingBlog) {
    return res.status(409).json({
      error: "Blog already exists",
    });
  }

  const blog = {
    id: Date.now(),
    title: req.body.title.trim(),
    description: req.body.description.trim(),
    image: req.file.filename,
    userEmail: req.user.email,
  };

  blogs.push(blog);

  res.status(201).json(blog);
});

app.get("/public/blogs", (req, res) => {
  res.send(blogs);
});


// ==================== CREATE FAQ ====================

app.post("/faqs", verifyToken, (req, res) => {
  if (!req.body.question || !req.body.answer) {
    return res.status(400).json({
      error: "Question and answer are required",
    });
  }

  const existingFaq = faqs.find((item) => {
    return (
      item.question.toLowerCase() === req.body.question.trim().toLowerCase()
    );
  });

  if (existingFaq) {
    return res.status(409).json({
      error: "FAQ already exists",
    });
  }

  const faq = {
    id: Date.now(),
    question: req.body.question.trim(),
    answer: req.body.answer.trim(),
    userEmail: req.user.email,
  };

  faqs.push(faq);

  res.status(201).json(faq);
});

// ==================== GET PUBLIC FAQS ====================

app.get("/public/faqs", (req, res) => {
  res.send(faqs);
});
// ==================== SERVER ====================

app.listen(port, () => {
  console.log(`Example app http://localhost:${port}`);
});
