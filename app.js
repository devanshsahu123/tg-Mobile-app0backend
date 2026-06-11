const express = require("express");
const teleRouter = require("./routes/teleRouter.js");
const waRouter = require("./routes/waRouter.js");
const coldEmailRouter = require("./routes/coldEmailRouter.js");
const contactNumberRouter = require("./routes/contactNumberRouter.js");
const path = require("path");
const connectDB = require("./db/db.js");
const cors = require("cors");
const app = express();

require("dotenv").config();

connectDB();

const port = process.env.PORT || 3003;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "pages"));
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.render("Right-Review");
});


app.get("/app-ads.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.sendFile(path.join(__dirname, "app-ads.txt"));
});

app.use("/tg", teleRouter);
app.use("/wa", waRouter);
app.use("/cold-email", coldEmailRouter);
app.use("/contact-number", contactNumberRouter);

app.listen(port, () => console.log(`http://localhost:${port}`));

