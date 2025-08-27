import path from "path";

export function findAsperiteBinary() {
  return path.join(
    "~",
    "Library",
    "Application\\ Support",
    "Steam",
    "steamapps",
    "common",
    "Aseprite",
    "Aseprite.app",
    "Contents",
    "MacOS",
    "aseprite"
  );
};