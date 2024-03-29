import { mapValues, orderBy } from "lodash";
import fs from "fs-extra";

const SECRETS_PATH = "/run/secrets/";

// Check each env var and see if it has a value in the secrets. In that case, use the
// secret value. Otherwise use the env var. Using sync fs methods for the sake of
// simplicity, since this will only run once when staring the app, sync is OK.
const secrets = (fs.existsSync(SECRETS_PATH) && fs.readdirSync(SECRETS_PATH)) || [];

const secretsEnv = mapValues(process.env, (value, key) => {
  const matchingSecrets = secrets.filter((secretFile) => secretFile.startsWith(key));

  const currentSecret =
    orderBy(
      matchingSecrets,
      (secret) => {
        const secretVersion = parseInt(secret[secret.length - 1], 10);
        return isNaN(secretVersion) ? 0 : secretVersion;
      },
      "desc",
    )[0] || null;

  const filepath = SECRETS_PATH + currentSecret;

  if (fs.existsSync(filepath)) {
    return (fs.readFileSync(filepath, { encoding: "utf8" }) || "").trim();
  }

  return value;
});

export const AZURE_TILES_CONTAINER = secretsEnv.AZURE_TILES_CONTAINER || "";
export const AZURE_STORAGE_ACCOUNT = secretsEnv.AZURE_STORAGE_ACCOUNT || "";
export const AZURE_STORAGE_KEY = secretsEnv.AZURE_STORAGE_KEY || "";
export const SLACK_WEBHOOK_URL = secretsEnv.SLACK_WEBHOOK_URL || "";
export const SLACK_MONITOR_MENTION = secretsEnv.SLACK_MONITOR_MENTION || "";
export const DAILY_TASK_SCHEDULE = secretsEnv.DAILY_TASK_SCHEDULE || "0 0 5 * * *";
export const ENVIRONMENT = secretsEnv.ENVIRONMENT || "unknown";
export const JORE_IMPORT_USERNAME = secretsEnv.JORE_IMPORT_USERNAME || "";
export const JORE_IMPORT_PASSWORD = secretsEnv.JORE_IMPORT_PASSWORD || "";
