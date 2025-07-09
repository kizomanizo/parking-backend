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

    // Validate Tanzanian registration number format and determine which services to check
    const serviceCheck = (() => {
      // Check if format matches: T + 3 digits + 3 letters
      const tanzaniaFormat = /^T\d{3}[A-Z]{3}$/;
      if (!tanzaniaFormat.test(regNumber)) {
        console.log("Registration number doesn't match Tanzanian format, checking both services");
        return { checkTermis: true, checkTausi: true };
      }

      // Extract the three letters after the digits
      const letters = regNumber.substring(4, 7);
      const firstLetter = letters.charAt(0);

      let checkTermis, checkTausi;

      if (firstLetter >= "E") {
        // EAA onwards: Only check TAUSI
        checkTermis = false;
        checkTausi = true;
        console.log(`Letters: ${letters}, first letter: ${firstLetter} (E onwards) - Only checking TAUSI`);
      } else {
        // AAA to DZZ: Check both TERMIS and TAUSI
        checkTermis = true;
        checkTausi = true;
        console.log(`Letters: ${letters}, first letter: ${firstLetter} (A-D) - Checking both TERMIS and TAUSI`);
      }

      return { checkTermis, checkTausi };
    })();
    const agent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      timeout: 10000, // 10 second timeout
    });

    // Fetch data from endpoints with conditional TAUSI check
    let termisResponse, tausiResponse;

    try {
      if (serviceCheck.checkTermis && serviceCheck.checkTausi) {
        // Fetch from both endpoints (AAA to DZZ)
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
      } else if (serviceCheck.checkTausi && !serviceCheck.checkTermis) {
        // Only fetch from TAUSI (EAA onwards)
        console.log("Only checking TAUSI based on registration number validation");
        termisResponse = { data: { status: false, data: null } };
        tausiResponse = await axios
          .get(tausiUrl + regNumber + "?pageNo=0&pageSize=1000&parkingServiceCode=3", {
            httpsAgent: agent,
            timeout: 15000,
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

            // Try fallback requests
            try {
              console.log("Trying TAUSI API fallback without query parameters...");
              const fallbackResponse = await axios.get(tausiUrl + regNumber, {
                httpsAgent: agent,
                timeout: 10000,
              });
              return fallbackResponse;
            } catch (fallbackError) {
              console.error("TAUSI API fallback also failed:", fallbackError.message);

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
          });
      } else {
        // Only fetch from TERMIS (fallback for non-standard formats)
        console.log("Only checking TERMIS based on registration number validation");
        termisResponse = await axios.get(termisUrl + regNumber, {
          headers: {
            "x-transfer-key": "e9f3e572-db87-4eff-9ed6-66922f1f7f24",
          },
          httpsAgent: agent,
        });
        tausiResponse = { data: null };
      }
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

    // Handle response based on which services were checked
    const tausiData = tausiResponse.data?.data?.itemList || null;
    const tausiAvailable = tausiData !== null;

    if (serviceCheck.checkTausi && !serviceCheck.checkTermis) {
      // Only TAUSI was checked (EAA onwards)
      if (tausiAvailable) {
        res.status(200).json({
          success: true,
          status: true,
          data: [],
          tausi: tausiData,
          tausi_available: true,
          source: "TAUSI_ONLY",
        });
      } else {
        res.status(200).json({
          success: false,
          status: false,
          data: [],
          tausi: null,
          tausi_available: false,
          source: "TAUSI_ONLY",
        });
      }
    } else {
      // TERMIS was checked (either alone or with TAUSI)
      const response = termisResponse.data;
      if (!response.status) {
        console.log("No bills found!", regNumber.value);
        res.status(200).json({
          success: false,
          status: false,
          data: "",
          tausi: tausiData,
          tausi_available: tausiAvailable,
          source: serviceCheck.checkTausi ? "BOTH" : "TERMIS_ONLY",
        });
      } else {
        res.status(200).json({
          success: response.status,
          status: true,
          data: response.data,
          tausi: tausiData,
          tausi_available: tausiAvailable,
          source: serviceCheck.checkTausi ? "BOTH" : "TERMIS_ONLY",
        });
      }
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
