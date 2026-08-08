const { Namer } = require("@parcel/plugin");
const path = require("node:path");

// An install keeps the manifest and the icons it names on the device and
// re-fetches them later, so those URLs must survive a deploy. Parcel already
// leaves index.html, the manifest and sw.js under stable names; this adds the
// icon PNGs they point at. Everything else stays hashed, so a deploy still
// invalidates it.
//
// CommonJS because Parcel warns on every build for an .mjs plugin.
module.exports = new Namer({
  name({ bundle }) {
    const asset = bundle.getMainEntry();
    // null defers to the default namer, which appends the content hash.
    if (!asset || !isInstalledIcon(asset.filePath)) {
      return null;
    }
    return path.basename(asset.filePath);
  },
});

// The PNGs under src/icons/: the manifest icons and the favicons index.html
// links, all of them named from a file that keeps its own name.
function isInstalledIcon(filePath) {
  const { dir, ext } = path.parse(filePath);
  return path.basename(dir) === "icons" && ext === ".png";
}
