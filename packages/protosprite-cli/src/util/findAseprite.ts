import childProcess from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/** Environment variable naming the binary to run, ahead of any search. */
export const ASEPRITE_BIN_ENV = "PROTOSPRITE_ASEPRITE_BIN";

/**
 * Find an Aseprite binary to export with, in order of how deliberate the
 * choice is: the environment variable, then a Steam install, then whatever
 * `aseprite` resolves to on PATH.
 *
 * The environment variable exists because probing for Steam only finds one
 * particular way of installing one particular program. It is also what lets
 * someone point this at a compatible binary such as LibreSprite — supported in
 * the sense that the override is honoured, not in the sense that this project
 * tests against it.
 *
 * Returns null when nothing runnable was found.
 */
export function resolveAsepriteBinary(): string | null {
  const fromEnv = process.env[ASEPRITE_BIN_ENV];
  if (fromEnv) {
    // An explicit choice is not second-guessed: if it is set and does not
    // work, that is an error worth reporting rather than quietly falling back
    // to some other program.
    return fromEnv;
  }
  const fromSteam = findSteamAsepriteBinary();
  if (fromSteam) return fromSteam;
  return isRunnable("aseprite") ? "aseprite" : null;
}

/** Whether a binary exists and answers `--version`. */
export function isRunnable(binaryPath: string): boolean {
  try {
    childProcess.execFileSync(binaryPath, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function findSteamAsepriteBinary(): string | null {
  const platform = os.platform();

  const steamInstallPath = getSteamInstallPath(platform);
  if (!steamInstallPath) return null;

  const steamLibraryLocations = getAllSteamLibraryLocations(
    steamInstallPath,
    platform
  );

  for (const libraryLocation of steamLibraryLocations) {
    const asepritePath = getAsepriteBinaryPath(libraryLocation, platform);
    if (asepritePath && fs.existsSync(asepritePath)) return asepritePath;
  }

  return null;
}

function getSteamInstallPath(platform: NodeJS.Platform): string | null {
  const homeDir = os.homedir();

  const commonPathsPerPlatform: Partial<Record<NodeJS.Platform, string[]>> = {
    win32: [
      path.join("C:\\", "Program files (x86)", "Steam"),
      path.join("C:\\", "Program Files", "Steam")
    ],
    darwin: [path.join(homeDir, "Library", "Application Support", "Steam")],
    linux: [
      path.join(homeDir, ".local", "share", "Steam"),
      path.join(homeDir, ".steam", "Steam"),
      path.join(homeDir, ".steam", "steam")
    ]
  };

  const commonPaths = commonPathsPerPlatform[platform];

  if (!commonPaths) return null;

  for (const path of commonPaths) {
    if (fs.existsSync(path)) return path;
  }

  return null;
}

function getAllSteamLibraryLocations(
  steamInstallPath: string,
  platform: NodeJS.Platform
): string[] {
  const libraryLocationFilePath = path.join(
    steamInstallPath,
    "steamapps",
    "libraryfolders.vdf"
  );
  if (!fs.existsSync(libraryLocationFilePath)) return [steamInstallPath];

  const fileContent = fs.readFileSync(libraryLocationFilePath, "utf8");
  const libraryLocationLines = fileContent.matchAll(/"path"\s+"([^"]+)"/g);

  const libraryLocations: string[] = [];
  for (const libraryLocationLine of libraryLocationLines) {
    let libraryLocation = libraryLocationLine[1];

    if (platform === "win32") {
      libraryLocation = libraryLocation.replace(/\\\\/g, "\\");
    }
    libraryLocations.push(libraryLocation);
  }

  if (libraryLocations.length === 0) return [steamInstallPath];
  return libraryLocations;
}

function getAsepriteBinaryPath(
  libraryLocation: string,
  platform: NodeJS.Platform
): string | null {
  switch (platform) {
    case "darwin":
      return path.join(
        libraryLocation,
        "steamapps",
        "common",
        "Aseprite",
        "Aseprite.app",
        "Contents",
        "MacOS",
        "aseprite"
      );
    case "win32":
      return path.join(
        libraryLocation,
        "steamapps",
        "common",
        "Aseprite",
        "Aseprite.exe"
      );
    case "linux":
      return path.join(
        libraryLocation,
        "steamapps",
        "common",
        "Aseprite",
        "aseprite"
      );
    default:
      return null;
  }
}
