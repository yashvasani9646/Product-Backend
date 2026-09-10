const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());

let products = [];


app.get('/homepage',(req,res)=>{
  res.send("Hello Page")
})

app.post("/products", (req, res) => {
  const product = {
    id: Date.now(),
    product: req.body.product,
    price: req.body.price,
  };

  products.push(product);

  res.send(product);
});

app.get("/products", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.send(products);
});

app.put("/products/:id", (req, res) => {
  const id = Number(req.params.id);

  const product = products.find((product) => {
    return product.id === id;
  });

  product.product = req.body.product;
  product.price = req.body.price;

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
