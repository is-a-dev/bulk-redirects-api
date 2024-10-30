require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { exec } = require("child_process");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const GITHUB_REPO = "https://github.com/is-a-dev/register.git";
const DOMAINS_DIR = "./register/domains";

const ACCOUNT_ID = process.env.ACCOUNT_ID;
const API_TOKEN = process.env.API_TOKEN;
const LIST_ID = process.env.LIST_ID;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN;

const CLOUDFLARE_API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/rules/lists/${LIST_ID}/items`;

app.use(express.json());

function updateRepo() {
    if (!fs.existsSync("./register")) {
        exec(`git clone ${GITHUB_REPO}`, (error, stdout, stderr) => {
            if (error) console.error(`Clone error: ${error.message}`);
            else console.log("Repository cloned.");
        });
    } else {
        exec(`cd register && git pull`, (error, stdout, stderr) => {
            if (error) console.error(`Pull error: ${error.message}`);
            else console.log("Repository updated.");
        });
    }
}

function getUrlsFromJsonFiles() {
    const urls = [];

    const files = fs.readdirSync(DOMAINS_DIR);
    files.forEach((file) => {
        const filePath = path.join(DOMAINS_DIR, file);
        if (filePath.endsWith(".json")) {
            const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
            const sourceDomain = `${path.basename(file, ".json")}.is-a.dev`;

            if (data.record && data.record.URL) {
                urls.push({
                    redirect: {
                        source_url: sourceDomain,
                        target_url: data.record.URL,
                        status_code: 302,
                    },
                });
            }
        }
    });
    return urls;
}

async function updateCloudflareRedirects(urls) {
    try {
        await axios({
            method: "POST",
            url: CLOUDFLARE_API,
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                "Content-Type": "application/json",
            },
            data: urls,
        });

        console.log("Bulk redirect list updated successfully.");
    } catch (error) {
        console.error("Error updating bulk redirect list:", error.message);
    }
}

async function main() {
    updateRepo();

    setTimeout(() => {
        const urls = getUrlsFromJsonFiles();

        if (urls.length > 0) {
            updateCloudflareRedirects(urls);
        } else {
            console.log("No URLs found to update.");
        }
    }, 30000); // 30 seconds
}

app.get("/webhook/:token", (req, res) => {
    const token = req.params.token;

    if (token !== WEBHOOK_TOKEN) {
        return res.status(403).send("Forbidden: Invalid token");
    }

    console.log("Valid webhook token received. Starting update process...");
    main()
        .then(() => {
            res.status(200).send("Update process initiated");
        })
        .catch((error) => {
            console.error("Error during update process:", error);
            res.status(500).send("Error initiating update");
        });
});

app.listen(PORT, () => {
    console.log(`Listening on Port: ${PORT}`);
});
