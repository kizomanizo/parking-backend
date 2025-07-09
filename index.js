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
    const tausiUrl = process.env.TAUSI_URL;
    console.log("TERMIS URL:", termisUrl);
    console.log("TAUSI URL:", tausiUrl);
    console.log("Registration Number:", regNumber);
    const agent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      timeout: 10000, // 10 second timeout
    });

    // Fetch data from both endpoints with error handling
    let termisResponse, tausiResponse;

    try {
      [termisResponse, tausiResponse] = await Promise.all([
        axios.get(termisUrl + regNumber, {
          headers: {
            "x-transfer-key": "e9f3e572-db87-4eff-9ed6-66922f1f7f24",
          },
          httpsAgent: agent,
        }),
        axios
          .get(tausiUrl + regNumber + "?pageNo=0&pageSize=1000&parkingServiceCode=3", {
            httpsAgent: agent,
            timeout: 15000, // 15 second timeout for this specific request
          })
          .catch(async (error) => {
            console.error("TAUSI API error:", error.message);
            if (error.code) {
              console.error("Error code:", error.code);
            }
            if (error.response) {
              console.error("Response status:", error.response.status);
              console.error("Response data:", error.response.data);
            }

            // Try a fallback request without query parameters
            try {
              console.log("Trying TAUSI API fallback without query parameters...");
              const fallbackResponse = await axios.get(tausiUrl + regNumber, {
                httpsAgent: agent,
                timeout: 10000,
              });
              return fallbackResponse;
            } catch (fallbackError) {
              console.error("TAUSI API fallback also failed:", fallbackError.message);

              // Try one more time with a different approach - using HTTP instead of HTTPS if possible
              try {
                console.log("Trying TAUSI API with HTTP fallback...");
                const httpUrl = tausiUrl.replace("https://", "http://");
                const httpResponse = await axios.get(httpUrl + regNumber + "?pageNo=0&pageSize=2&parkingServiceCode=3", {
                  timeout: 8000,
                });
                return httpResponse;
              } catch (httpError) {
                console.error("TAUSI API HTTP fallback also failed:", httpError.message);
                console.error("All TAUSI API attempts failed. Service may be down or unreachable.");
                return { data: null };
              }
            }
          }),
      ]);
    } catch (error) {
      console.error("Error fetching data:", error.message);
      // If both fail, still try to get termis data
      try {
        termisResponse = await axios.get(termisUrl + regNumber, {
          headers: {
            "x-transfer-key": "e9f3e572-db87-4eff-9ed6-66922f1f7f24",
          },
          httpsAgent: agent,
        });
        tausiResponse = { data: null };
      } catch (termisError) {
        console.error("TERMIS API also failed:", termisError.message);
        throw termisError;
      }
    }

    // Store the token in Vue store
    const response = termisResponse.data;

    // Check if TAUSI data is available
    const tausiData = tausiResponse.data?.data?.itemList || null;
    const tausiAvailable = tausiData !== null;

    if (!response.status) {
      console.log("No bills found!", regNumber.value);
      res.status(200).json({
        success: false,
        status: false,
        data: "",
        tausi: tausiData,
        tausi_available: tausiAvailable,
      });
    } else {
      res.status(200).json({
        success: response.status,
        status: true,
        data: response.data,
        tausi: tausiData,
        tausi_available: tausiAvailable,
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

// Health check endpoint for TAUSI service
App.get("/health/tausi", async function (req, res) {
  try {
    const tausiUrl = process.env.TAUSI_URL;
    const agent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      timeout: 5000,
    });

    console.log("Testing TAUSI service connectivity...");
    const response = await axios.get(tausiUrl + "test", {
      httpsAgent: agent,
      timeout: 5000,
    });

    res.status(200).json({
      status: "healthy",
      message: "TAUSI service is reachable",
      response: response.status,
    });
  } catch (error) {
    console.error("TAUSI health check failed:", error.message);
    res.status(503).json({
      status: "unhealthy",
      message: "TAUSI service is not reachable",
      error: error.message,
      code: error.code,
    });
  }
});

App.listen(port, () => {
  console.log("App is up on port: " + port);
});
