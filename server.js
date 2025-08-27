import express from "express";
import bodyParser from "body-parser";
import fileUpload from "express-fileupload";
import path from "path";
import videoRoutes from "./routes/videoRoutes.js";
import apiKeyRoutes from "./routes/apiKeyRoutes.js";

const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(fileUpload());

// routes
app.use("/", apiKeyRoutes);
app.use("/", videoRoutes);

app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
