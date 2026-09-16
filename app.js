const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
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
const allowedCategories = [
  "Electronics",
  "Clothing",
  "Food",
  "Furniture",
  "Books",
  "Beauty",
  "Sports",
  "Other",
];

const allowedTypes = ["New", "Used"];

app.post("/products", verifyToken, upload.single("image"), (req, res) => {
  const existingProduct = products.find((item) => {
    return item.product === req.body.product;
  });
  if (
    !req.body.product ||
    !req.body.price ||
    !req.body.category ||
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

  if (!allowedCategories.includes(req.body.category)) {
    return res.status(400).json({
      error: "invalid category",
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
    category: req.body.category /*dropdown */,
    type: req.body.type /*radio button*/,
    available: available /*checkbox*/,
    image: req.file.filename /*file*/,
  };

  products.push(product);

  res.send(product);
});

app.get("/products", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.send(products);
});

app.put("/products/:id", upload.single("image"), (req, res) => {
  const id = Number(req.params.id);

  const product = products.find((product) => {
    return product.id === id;
  });
  console.log(req.body);

  product.product = req.body.product;
  product.price = req.body.price;
  product.category = req.body.category;
  product.type = req.body.type;
  product.available = req.body.available === "true";

  if (req.file) {
    product.image = req.file.filename;
  }

  console.log(product);
  res.send(product);
});

app.delete("/products/:id", (req, res) => {
  const id = Number(req.params.id);
  products = products.filter((item) => item.id !== id);
  console.log(products);
  res.send("Product deleted successfully");
});

// ------------------------///

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
  });
});

app.listen(port, () => {
  console.log(`Example app http://localhost:${port}`);
});
