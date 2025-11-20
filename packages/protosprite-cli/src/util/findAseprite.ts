import fs from "fs";
import os from "os";
import path from "path";

export function findAsperiteBinary(): string | null {
  const platform = os.platform();

  const steamInstallPath = getSteamInstallPath(platform);
  if (!steamInstallPath) return null;

  const steamLibraryLocations = getAllSteamLibraryLocations(steamInstallPath, platform);

  for (const libraryLocation of steamLibraryLocations) {
    const asepritePath = getAsepriteBinaryPath(libraryLocation, platform);
    if (asepritePath && fs.existsSync(asepritePath)) return asepritePath;
  }

  return null;
}

function getSteamInstallPath(platform: NodeJS.Platform): string | null {
  const homeDir = os.homedir();

  const commonPathsPerPlatform:Partial<Record<NodeJS.Platform, string[]>> = {
    "win32": [
      path.join("C:\\", "Program files (x86)", "Steam"),
      path.join("C:\\", "Program Files", "Steam")
    ],
    "darwin": [
      path.join(homeDir, "Library", "Application Support", "Steam"),
    ],
    "linux": [
      path.join(homeDir, ".local", "share", "Steam"),
      path.join(homeDir, ".steam", "Steam"),
      path.join(homeDir, ".steam", "steam")
    ]
  }

  const commonPaths = commonPathsPerPlatform[platform];

  if (!commonPaths) return null;

  for (const path of commonPaths) {
    if (fs.existsSync(path)) return path;
  }

  return null;
}

function getAllSteamLibraryLocations(steamInstallPath: string, platform: NodeJS.Platform): string[] {
  const libraryLocationFilePath = path.join(steamInstallPath, "steamapps", "libraryfolders.vdf");
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

function getAsepriteBinaryPath(libraryLocation: string, platform: NodeJS.Platform): string | null {
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

