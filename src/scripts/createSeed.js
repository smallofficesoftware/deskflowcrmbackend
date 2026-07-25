import fs from "fs";
import path from "path";

const args = process.argv.filter(
  (arg) => !arg.includes("createSeed.js") && !arg.startsWith("--")
);
const dbType = args[1]; // master | tenant
const seedNameInput = args[2]; // raw seed name input

if (!dbType || !["master", "tenant"].includes(dbType)) {
  console.error("Error: Please specify database type (master or tenant)");
  // console.log("Usage: node src/scripts/createSeed.js <master|tenant> <seed-name>");
  process.exit(1);
}

if (!seedNameInput) {
  console.error("Error: Please provide a seed name (e.g., seedLabels)");
  process.exit(1);
}

function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2") // insert hyphen between camelCase parts
    .replace(/[\s_]+/g, "-") // replace spaces/underscores with hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .toLowerCase();
}

const seedName = toKebabCase(seedNameInput);

if (!/^[a-z0-9-]+$/.test(seedName)) {
  console.error("Invalid seed name. Use only letters, numbers, and hyphens (e.g., seed-labels)");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "").split(".")[0];
const fileName = `${timestamp}-${seedName}.js`;
const seedPath = path.resolve(process.cwd(), "migration", dbType, "seeders", fileName);

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

const seederTemplate = `/**
 * Seeder Name: ${seedName}
 * Database Type: ${dbType.toUpperCase()}
 * Created: ${getCustomDateTime()}
 */

export const up = async (queryInterface, Sequelize) => {
  // TODO: add seed data logic
}

export const down = async (queryInterface, Sequelize) => {
  // TODO: add revert seed data logic
}
`;

try {
  const dir = path.dirname(seedPath);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
  fs.writeFileSync(seedPath, seederTemplate);
  // console.log(`Seeder created successfully!`);
  // console.log(`File: migration/${dbType}/seeders/${fileName}`);
  // console.log(`\nNext steps:`);
  // console.log(`   1. Edit the seeder file to add your changes`);
  // console.log(`   2. Run: npm run seed:${dbType}:up:dev`);
} catch (error) {
  console.error("Error creating seeder:", error.message);
  process.exit(1);
}