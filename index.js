import * as dotenv from "dotenv";
dotenv.config();
import Express from "express";
import cors from "cors";
import axios from "axios";
import https from "https";

const App = Express();
const port = process.env.PORT || 4003;

// App Configuration Entries
App.disable("x-powered-by");
App.use(cors());
App.use(Express.urlencoded({ extended: true }));

App.get("/:regNumber", async function (req, res) {
  try {
    const regNumber = req.params.regNumber || "1234";
    const termisUrl = process.env.TERMIS_URL;
    console.log(termisUrl);
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });
    const termisResponse = await axios.get(termisUrl + regNumber, {
      headers: {
        "x-transfer-key": "e9f3e572-db87-4eff-9ed6-66922f1f7f24",
      },
      httpsAgent: agent,
    });
    // Store the token in Vue store
    const response = termisResponse.data;
    if (!response.status) {
      console.log("No bills found!", regNumber.value);
      res.status(200).json({
        success: false,
        status: false,
        data: null,
      });
    } else {
      res.status(200).json({
        success: response.status,
        status: true,
        data: response.data,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(400).json({
      success: false,
      status: false,
      data: error.message,
    });
  }
});

App.listen(port, () => {
  console.log("App is up on port: " + port);
});
