const express = require("express");
const teleRouter = require("./routes/teleRouter.js");
const waRouter = require("./routes/waRouter.js");
const coldEmailRouter = require("./routes/coldEmailRouter.js");
const contactNumberRouter = require("./routes/contactNumberRouter.js");
const path = require("path");
const connectDB = require("./db/db.js");
const cors = require("cors");
const app = express();

require("dotenv").config({ path: path.join(__dirname, ".env") });

connectDB();

const config = require("./config");
const port = config.PORT;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "pages"));
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.render("Right-Review");
});

app.get("/admin", (req, res) => {
  res.render("admin");
});

app.get("/admin/child-safety/:appName", (req, res) => {
  const appName = req.params.appName.replace(/-/g, ' ');
  res.render("child-safety-standards", { appName });
});

app.get("/admin/privacy/:appName", (req, res) => {
  const appName = req.params.appName.replace(/-/g, ' ');
  res.render("privacy", { appName });
});


app.get("/app-ads.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.sendFile(path.join(__dirname, "app-ads.txt"));
});

const callRouter = require("./routes/callRouter.js");

app.use("/tg", teleRouter);
app.use("/wa", waRouter);
app.use("/call", callRouter);

app.listen(port, () => console.log(`http://localhost:${port}`));

