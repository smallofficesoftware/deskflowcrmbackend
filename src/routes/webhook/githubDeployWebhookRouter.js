import crypto from "crypto";
import { spawn } from "child_process";
import path from "path";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const DEPLOY_SCRIPT = path.join(process.cwd(), "scripts", "deploy-dev.sh");

// Map GitHub repo name -> which app to deploy
const REPO_TO_APP = {
  deskflowcrmbackend: "backend",
  deskflowcrmfrontend: "frontend",
};

const verifySignature = (req) => {
  if (!WEBHOOK_SECRET) return false;

  const signature = req.headers["x-hub-signature-256"];
  if (!signature || !req.rawBody) return false;

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
};

export default (app) => {
  app.post("/webhook/github-dev-deploy", (req, res) => {
    if (!verifySignature(req)) {
      return res.status(401).json({ ack_msg: "Invalid signature" });
    }

    const ref = req.body?.ref;
    const repoName = req.body?.repository?.name;
    const appName = REPO_TO_APP[repoName];

    if (ref !== "refs/heads/dev") {
      return res.status(200).json({ ack_msg: `Ignored: ref=${ref}` });
    }

    if (!appName) {
      return res
        .status(200)
        .json({ ack_msg: `Ignored: unknown repository "${repoName}"` });
    }

    // Respond immediately so GitHub doesn't time out; deploy runs in background.
    res.status(200).json({ ack_msg: `Deploy triggered for ${appName}` });

    const child = spawn("bash", [DEPLOY_SCRIPT, appName], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  });
};
