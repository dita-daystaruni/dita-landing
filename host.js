import { fileURLToPath } from "url";
import path, { dirname } from "path";
import dotenv from "dotenv";
import ftp from "ftp";
import fs from "fs";
import chalk from "chalk";
import archiver from "archiver";

dotenv.config(); // Load environment variables from .env file

// Resolve the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// FTP server details from environment variables
const ftpHost = process.env.FTP_HOST;
const ftpPort = parseInt(process.env.FTP_PORT, 10);
const ftpUser = process.env.FTP_USER;
const ftpPassword = process.env.FTP_PASSWORD;

// Local dist folder path
const localDistPath = path.join(__dirname, "dist");

// Remote destination folder
const remoteFolder = "/";

// Create an FTP client
const client = new ftp();

// Connect to the FTP server
client.connect({
  host: ftpHost,
  port: ftpPort,
  user: ftpUser,
  password: ftpPassword,
  pasv: false, // Set active mode
});

// Loader helper function
const showLoader = (message) => {
  process.stdout.write(chalk.yellow(`${message}...`));
};

// Log helper function
const logMessage = (message) => {
  console.log(chalk.cyan(message));
};

logMessage(`Connecting to ${ftpHost}`);

// Upload the files to the FTP server
client.on("ready", () => {
  console.log(chalk.green(`Connected to ${ftpHost}`));

  logMessage(`Compressing dist folder to a ZIP file`);

  // Create a writable stream for the ZIP file
  const zipFilePath = path.join(__dirname, "dist.zip");
  const output = fs.createWriteStream(zipFilePath);

  // Create a ZIP archive
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Set compression level
  });

  // Pipe the archive to the output stream
  archive.pipe(output);

  // Add all files from the dist folder to the archive
  archive.directory(localDistPath, false);

  // Finalize the archive
  archive.finalize();

  // Event: Archive finishes writing
  output.on("close", () => {
    logMessage(`ZIP file created successfully`);

    // Upload the ZIP file to the FTP server
    showLoader(`Uploading ZIP file`);
    client.put(zipFilePath, `${remoteFolder}dist.zip`, (err) => {
      if (err) {
        console.error(`\nError uploading ZIP file:`, err);
      } else {
        logMessage(`ZIP file uploaded successfully`);

        // Execute the unzip command on the FTP server
        showLoader(`Unzipping the file on the FTP server`);
        client.site("EXEC unzip dist.zip", (err, response) => {
          if (err) {
            console.error(
              `\nError executing unzip command on the FTP server:`,
              err
            );
          } else {
            logMessage(`File unzipped on the FTP server`);
          }

          // Remove the local ZIP file
          fs.unlinkSync(zipFilePath);

          // Close the FTP connection
          client.end(() => {
            logMessage("FTP connection closed");
          });
        });
      }
    });
  });

  // Event: Archive encounters an error
  archive.on("error", (err) => {
    console.error(`ZIP file creation error:`, err);
    client.end();
  });
});

// Handle FTP connection error
client.on("error", (err) => {
  console.error(chalk.red("FTP connection error:"), err);
});
