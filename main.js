// ---------- Zone Data (pre-defined inbuilt codes) ----------
const ZONES = [
  { id: 1, name: "Entrance Gate", code: "LIFI_ENT_01" },
  { id: 2, name: "Reception Desk", code: "LIFI_REC_02" },
  { id: 3, name: "Main Corridor", code: "LIFI_COR_03" },
  { id: 4, name: "Elevator Lobby", code: "LIFI_ELV_04" },
  { id: 5, name: "Conference Hall", code: "LIFI_CNF_05" },
  { id: 6, name: "Cafeteria", code: "LIFI_CAF_06" },
  { id: 7, name: "Library Wing", code: "LIFI_LIB_07" },
  { id: 8, name: "Server Room", code: "LIFI_SRV_08" },
  { id: 9, name: "Emergency Exit", code: "LIFI_EXT_09" },
  { id: 10, name: "Parking Zone", code: "LIFI_PRK_10" }
];

const TORCH_ERROR_MESSAGE = "Turn on flashlight settings and resend data";

// ---------- App State ----------
let selectedZone = null;
let currentMode = "zone"; // "zone" | "custom"
let torchTrack = null;
let torchSupported = false;
let isTransmitting = false;

// ---------- DOM References ----------
const splash = document.getElementById("splash");
const app = document.getElementById("app");
const zoneGrid = document.getElementById("zoneGrid");
const previewSource = document.getElementById("previewSource");
const previewName = document.getElementById("previewName");
const previewCode = document.getElementById("previewCode");
const customMessageInput = document.getElementById("customMessage");
const sendBtn = document.getElementById("sendBtn");
const txStatus = document.getElementById("txStatus");
const hardwareStatus = document.getElementById("hardwareStatus");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const modeZoneBtn = document.getElementById("modeZoneBtn");
const modeCustomBtn = document.getElementById("modeCustomBtn");
const zoneModePanel = document.getElementById("zoneModePanel");
const customModePanel = document.getElementById("customModePanel");

// ---------- Splash Screen ----------
window.addEventListener("load", () => {
  setTimeout(() => {
    splash.classList.add("fade-out");
    app.classList.remove("app-hidden");
    requestAnimationFrame(() => app.classList.add("app-visible"));
  }, 2000);
});

// ---------- Mode Switching ----------
function setMode(mode) {
  currentMode = mode;

  modeZoneBtn.classList.toggle("active", mode === "zone");
  modeCustomBtn.classList.toggle("active", mode === "custom");
  zoneModePanel.classList.toggle("hidden", mode !== "zone");
  customModePanel.classList.toggle("hidden", mode !== "custom");

  if (mode === "zone") {
    customMessageInput.value = "";
  } else {
    selectedZone = null;
    document.querySelectorAll(".zone-btn").forEach((btn) => btn.classList.remove("active"));
  }

  updatePreview();
}

modeZoneBtn.addEventListener("click", () => setMode("zone"));
modeCustomBtn.addEventListener("click", () => setMode("custom"));

// ---------- Build Zone Grid ----------
function renderZones() {
  zoneGrid.innerHTML = "";
  ZONES.forEach((zone) => {
    const btn = document.createElement("button");
    btn.className = "zone-btn";
    btn.type = "button";
    btn.dataset.zoneId = String(zone.id);
    btn.innerHTML = `Zone ${zone.id}<small>${zone.name}</small>`;
    btn.addEventListener("click", () => selectZone(zone.id));
    zoneGrid.appendChild(btn);
  });
}

function selectZone(zoneId) {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return;

  selectedZone = zone;

  document.querySelectorAll(".zone-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.zoneId) === zoneId);
  });

  updatePreview();
}

function updatePreview() {
  if (currentMode === "custom") {
    const customText = customMessageInput.value.trim();
    previewSource.textContent = "Custom Typing";

    if (customText.length > 0) {
      previewName.textContent = "User Input";
      previewCode.textContent = customText;
      sendBtn.disabled = false;
    } else {
      previewName.textContent = "\u2014";
      previewCode.textContent = "\u2014";
      sendBtn.disabled = true;
    }
    return;
  }

  previewSource.textContent = "Zone Selection";

  if (selectedZone) {
    previewName.textContent = `Zone ${selectedZone.id} \u2014 ${selectedZone.name}`;
    previewCode.textContent = selectedZone.code;
    sendBtn.disabled = false;
  } else {
    previewName.textContent = "\u2014";
    previewCode.textContent = "\u2014";
    sendBtn.disabled = true;
  }
}

// ---------- Custom Message Handling ----------
customMessageInput.addEventListener("input", () => {
  if (currentMode !== "custom" && customMessageInput.value.trim().length > 0) {
    setMode("custom");
    return;
  }
  updatePreview();
});
customMessageInput.addEventListener("focus", () => {
  if (currentMode !== "custom") setMode("custom");
});

// ---------- Torch / Camera Setup ----------
async function initTorch() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("MediaDevices API unavailable");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }
    });

    const [track] = stream.getVideoTracks();
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};

    if (!capabilities.torch) {
      track.stop();
      throw new Error("Torch not supported on this device");
    }

    torchTrack = track;
    torchSupported = true;
    setHardwareStatus("ready", "Torch: Ready");
  } catch (err) {
    torchSupported = false;
    setHardwareStatus("simulated", "Torch: Unavailable");
  }
}

function setHardwareStatus(mode, text) {
  hardwareStatus.className = `status-pill ${mode}`;
  hardwareStatus.innerHTML = `<span class="dot"></span> ${text}`;
}

async function setTorch(on) {
  if (!torchSupported || !torchTrack) {
    throw new Error("Torch hardware not available");
  }
  await torchTrack.applyConstraints({ advanced: [{ torch: on }] });
}

// ---------- Li-Fi Transmission Logic ----------
// Encodes text as binary pulses: short blink = 0, long blink = 1
function textToBits(text) {
  return text
    .split("")
    .map((ch) => ch.charCodeAt(0).toString(2).padStart(8, "0"))
    .join("");
}

function showTorchError() {
  txStatus.className = "tx-status error";
  txStatus.textContent = `\u26a0 ${TORCH_ERROR_MESSAGE}`;
  setHardwareStatus("simulated", "Torch: Unavailable");
}

async function transmit(message) {
  if (isTransmitting) return;
  isTransmitting = true;
  sendBtn.disabled = true;
  sendBtn.classList.add("transmitting");
  progressWrap.classList.add("active");
  progressBar.style.width = "0%";

  txStatus.className = "tx-status";
  txStatus.textContent = "Transmitting via Li-Fi flashlight pulses\u2026";

  const bits = textToBits(message);
  const totalSteps = bits.length;
  const BIT_DURATION_MS = 120;

  try {
    if (!torchSupported || !torchTrack) {
      throw new Error("Flashlight/torch hardware unavailable or blocked");
    }

    for (let i = 0; i < totalSteps; i++) {
      const bit = bits[i];
      await setTorch(true);
      await sleep(bit === "1" ? BIT_DURATION_MS * 2 : BIT_DURATION_MS);
      await setTorch(false);
      await sleep(BIT_DURATION_MS * 0.6);

      const percent = Math.round(((i + 1) / totalSteps) * 100);
      progressBar.style.width = `${percent}%`;
    }

    await setTorch(false).catch(() => {});

    txStatus.className = "tx-status success";
    txStatus.textContent = `\u2714 "${message}" transmitted successfully via Li-Fi pulses.`;
  } catch (err) {
    torchSupported = false;
    showTorchError();
  } finally {
    isTransmitting = false;
    sendBtn.disabled = false;
    sendBtn.classList.remove("transmitting");
    setTimeout(() => {
      progressWrap.classList.remove("active");
      progressBar.style.width = "0%";
    }, 900);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Send Button ----------
sendBtn.addEventListener("click", () => {
  let message = null;

  if (currentMode === "custom") {
    const customText = customMessageInput.value.trim();
    message = customText.length > 0 ? customText : null;
  } else {
    message = selectedZone ? selectedZone.code : null;
  }

  if (!message) {
    txStatus.className = "tx-status error";
    txStatus.textContent =
      currentMode === "custom"
        ? "Type a message before sending."
        : "Select a zone before sending.";
    return;
  }

  transmit(message);
});

// ---------- Init ----------
renderZones();
setMode("zone");
updatePreview();
initTorch();
