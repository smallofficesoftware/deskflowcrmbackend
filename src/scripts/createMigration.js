import fs from "fs";
import path from "path";

const args = process.argv.filter(
  (arg) => !arg.includes("createMigration.js") && !arg.startsWith("--")
);
const dbType = args[1]; // master | tenant
const migrationInput = args[2]; // raw migration name input

if (!dbType || !["master", "tenant"].includes(dbType)) {
  console.error("Error: Please specify database type (master or tenant)");
  process.exit(1);
}

if (!migrationInput) {
  console.error("Error: Please provide a migration name (e.g., createUsersTable)");
  process.exit(1);
}

function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2") // insert hyphen between camelCase parts
    .replace(/[\s_]+/g, "-") // replace spaces/underscores with hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .toLowerCase();
}

const migrationName = toKebabCase(migrationInput);

if (!/^[a-z0-9-]+$/.test(migrationName)) {
  console.error("Invalid migration name. Use only letters, numbers, and hyphens (e.g., create-users-table)");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "").split(".")[0];
const fileName = `${timestamp}-${migrationName}.js`;
const migrationPath = path.resolve(process.cwd(), "migration", dbType, "migrations", fileName);

function getCustomDateTime() {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  hours = String(hours).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds} ${ampm}`;
}

const migrationTemplate = `/**
 * Migration Name: ${migrationName}
 * Database Type: ${dbType.toUpperCase()}
 * Created: ${getCustomDateTime()}
 */

export const up = async (queryInterface, Sequelize) => {
  // TODO: add migration logic
}

export const down = async (queryInterface, Sequelize) => {
  // TODO: add revert migration logic
}
`;

try {
  const dir = path.dirname(migrationPath);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
  fs.writeFileSync(migrationPath, migrationTemplate);
} catch (error) {
  console.error("Error creating migration:", error.message);
  process.exit(1);
}