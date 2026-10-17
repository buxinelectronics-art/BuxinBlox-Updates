const RELEASES_API = "https://api.github.com/repos/buxinelectronics-art/BuxinBlox-Updates/releases/latest";
const RELEASES_PAGE = "https://github.com/buxinelectronics-art/BuxinBlox-Updates/releases/latest";

const button = document.querySelector("#download-button");
const bottomButton = document.querySelector("#bottom-download");
const label = document.querySelector("#download-label");
const status = document.querySelector("#release-status");
const note = document.querySelector("#download-note");
const dot = document.querySelector(".release-dot");
document.querySelector("#year").textContent = new Date().getFullYear();

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Windows installer";
  const size = bytes / (1024 * 1024);
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} MB installer`;
}

async function loadLatestRelease() {
  const refresh = document.querySelector("#refresh-button");
  refresh.disabled = true;
  status.textContent = "Checking for the latest version…";
  dot.classList.remove("ready");
  try {
    const response = await fetch(RELEASES_API, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const release = await response.json();
    if (release.draft || release.prerelease) throw new Error("No stable release is available.");
    const installer = (release.assets || []).find(asset =>
      /^BuxinBloxs-Setup-.*\.exe$/i.test(asset.name)
    );
    if (!installer || !installer.browser_download_url) throw new Error("The latest release has no Windows installer.");

    const version = (release.tag_name || "").replace(/^v/i, "") || "Latest";
    const published = release.published_at
      ? new Date(release.published_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : "Recently published";
    button.href = installer.browser_download_url;
    button.removeAttribute("aria-disabled");
    bottomButton.href = installer.browser_download_url;
    label.textContent = `Download BuxinBloxs ${version}`;
    status.textContent = `Latest version ${version} · ${published}`;
    note.textContent = `${formatSize(installer.size)} · Windows installer`;
    dot.classList.add("ready");
    document.title = `Download BuxinBloxs ${version}`;
  } catch (error) {
    button.href = RELEASES_PAGE;
    bottomButton.href = RELEASES_PAGE;
    label.textContent = "View the latest download";
    status.textContent = "Could not check the release just now.";
    note.textContent = "Open the official releases page to get the newest Windows installer.";
    dot.classList.remove("ready");
  } finally {
    refresh.disabled = false;
  }
}

document.querySelector("#refresh-button").addEventListener("click", loadLatestRelease);
loadLatestRelease();
