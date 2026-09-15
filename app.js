const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
const multer = require("multer");
app.use(express.json());
app.use("/uploads", express.static("uploads"));

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

app.post("/products", upload.single("image"), (req, res) => {
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

app.listen(port, () => {
  console.log(`Example app http://localhost:${port}`);
});
