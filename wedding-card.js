// app.js (complete)
/* Ever & Always — Wedding Card Photo Booth
   - Gate landing → booth
   - 3 photos with countdown
   - GUARANTEED black & white (pixel-level grayscale)
   - Output: 2x2 wedding card
       Row 1: Photo 1 | Photo 2
       Row 2: Photo 3 | TEXT PNG (you design this in Figma, export transparent PNG)
   - DOWNLOAD = animation + download (no print dialog)
*/

const els = {
  // gate
  gate: document.getElementById("gate"),
  booth: document.getElementById("booth"),
  btnEnter: document.getElementById("btn-enter"),
  gateNote: document.getElementById("gateNote"),

  // booth
  video: document.getElementById("video"),
  captureCanvas: document.getElementById("captureCanvas"),
  stripCanvas: document.getElementById("stripCanvas"),
  stripShell: document.getElementById("stripShell"),
  flash: document.getElementById("flash"),
  countdown: document.getElementById("countdown"),
  status: document.getElementById("status"),

  btnStart: document.getElementById("btn-start"),
  btnRetake: document.getElementById("btn-retake"),
  btnPrint: document.getElementById("btn-print"),

  btnCopyHashtag: document.getElementById("btn-copy-hashtag"),
  shareToast: document.getElementById("shareToast"),

  thumb1: document.getElementById("thumb1"),
  thumb2: document.getElementById("thumb2"),
  thumb3: document.getElementById("thumb3"),

  stage: document.getElementById("stage"),
  cameraPanel: document.getElementById("cameraPanel"),
  stripPanel: document.getElementById("stripPanel"),
};

let stream = null;
let shots = [];
let busy = false;

/* =========
   CUSTOMIZE
   ========= */
const SHARE_HASHTAG = "#EverAndAlways";

/* ✅ Your custom wedding text PNG (transparent background) */
const TEXT_PNG_SRC = "assets/wedding-text.png"; // <-- put your PNG here
// How the PNG should fit inside the 4th block:
// "contain" = show whole PNG (recommended)
// "cover"   = fill the block (may crop)
const TEXT_PNG_FIT = "contain";

/* Layout tuning (easy tweaks) */
const CARD_PAD = 28;   // outer padding of the whole card
const CARD_GAP = 16;   // gap between the 4 blocks
const CELL_INSET = 0;  // optional inner padding inside each cell

let textOverlayImg = null; // preloaded PNG image

/* =========
   UI helpers
   ========= */
function setStatus(msg) {
  if (els.status) els.status.textContent = msg || "";
}
function setGateNote(msg) {
  if (els.gateNote) els.gateNote.textContent = msg || "";
}
function showToast() {
  if (!els.shareToast) return;
  els.shareToast.classList.add("show");
}
function hideToast() {
  if (!els.shareToast) return;
  els.shareToast.classList.remove("show");
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fadeStage(ms = 300) {
  if (!els.stage) return sleep(ms);
  els.stage.classList.add("fading");
  await sleep(ms);
  els.stage.classList.remove("fading");
}

/**
 * Panels are absolute (inset:0) so we measure using an offscreen clone
 * with position:static to get natural height.
 */
function measurePanelNaturalHeight(panel) {
  if (!panel || !els.stage) return 720;

  const stageRect = els.stage.getBoundingClientRect();
  const width = Math.max(320, Math.round(stageRect.width));

  const clone = panel.cloneNode(true);
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));

  clone.style.position = "static";
  clone.style.inset = "auto";
  clone.style.transform = "none";
  clone.style.opacity = "1";
  clone.style.pointerEvents = "none";
  clone.style.visibility = "hidden";
  clone.style.width = width + "px";
  clone.style.maxWidth = "none";

  const wrap = document.createElement("div");
  wrap.style.position = "absolute";
  wrap.style.left = "-9999px";
  wrap.style.top = "0";
  wrap.style.width = width + "px";
  wrap.style.pointerEvents = "none";
  wrap.style.visibility = "hidden";

  wrap.appendChild(clone);
  document.body.appendChild(wrap);

  const h = Math.ceil(clone.scrollHeight);
  wrap.remove();

  return Math.max(h, 520);
}

let heightRaf = null;
function setStageHeight() {
  if (!els.stage || !els.cameraPanel || !els.stripPanel) return;

  if (heightRaf) cancelAnimationFrame(heightRaf);
  heightRaf = requestAnimationFrame(() => {
    const inStrip = document.body.classList.contains("show-strip");
    const target = inStrip ? els.stripPanel : els.cameraPanel;
    const h = measurePanelNaturalHeight(target);

    els.stage.style.minHeight = "0px";
    els.stage.style.height = h + "px";
  });
}

function showCameraView() {
  document.body.classList.remove("show-strip");
  hideToast();
  setStageHeight();
}
function showStripView() {
  document.body.classList.add("show-strip");
  setStageHeight();
}

/* =========
   Assets preload
   ========= */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // for local assets this is fine; keep same-origin
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function preloadTextOverlay() {
  try {
    textOverlayImg = await loadImage(TEXT_PNG_SRC);
  } catch {
    textOverlayImg = null; // fail silently; we’ll render blank block
  }
}

/* =========
   Camera init (only after entering)
   ========= */
async function initCamera() {
  try {
    setGateNote("Requesting camera access…");
    setStatus("Requesting camera access…");

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    els.video.srcObject = stream;

    await new Promise((res) => {
      els.video.onloadedmetadata = () => res();
    });

    setGateNote("");
    setStatus("Ready? Smile.");
    els.btnStart.disabled = false;
    return true;
  } catch (err) {
    console.error(err);
    const msg = "Camera blocked. Please allow camera permission and reload.";
    setGateNote(msg);
    setStatus(msg);
    els.btnStart.disabled = true;
    return false;
  }
}

/* =========
   Countdown
   ========= */
async function countdown(seconds = 3) {
  els.countdown.classList.add("show");

  for (let i = seconds; i >= 1; i--) {
    els.countdown.textContent = String(i);
    await sleep(750);
  }

  els.countdown.textContent = "Smile…";
  await sleep(520);

  els.countdown.classList.remove("show");
  els.countdown.textContent = "";
}

function flash() {
  els.flash.classList.remove("on");
  void els.flash.offsetWidth;
  els.flash.classList.add("on");
}

/* =========
   GUARANTEED GRAYSCALE (pixel conversion)
   ========= */
function toGrayscaleInPlace(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  return imageData;
}

/* Capture 1 frame -> BW JPEG dataURL */
function captureFrame() {
  const c = els.captureCanvas;
  const ctx = c.getContext("2d", { willReadFrequently: true });

  const vw = els.video.videoWidth || 1280;
  const vh = els.video.videoHeight || 720;
  c.width = vw;
  c.height = vh;

  // draw mirrored
  ctx.save();
  ctx.translate(vw, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(els.video, 0, 0, vw, vh);
  ctx.restore();

  // grayscale (guaranteed)
  const imgData = ctx.getImageData(0, 0, vw, vh);
  toGrayscaleInPlace(imgData);
  ctx.putImageData(imgData, 0, 0);

  // subtle vignette
  const g = ctx.createRadialGradient(
    vw / 2,
    vh / 2,
    Math.min(vw, vh) * 0.18,
    vw / 2,
    vh / 2,
    Math.max(vw, vh) * 0.68
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  return c.toDataURL("image/jpeg", 0.92);
}

function setThumb(index, dataUrl) {
  const img = [els.thumb1, els.thumb2, els.thumb3][index];
  if (!img) return;

  img.onload = () => setStageHeight();
  img.src = dataUrl;
  img.parentElement.classList.add("filled");
}

function clearThumbs() {
  [els.thumb1, els.thumb2, els.thumb3].forEach((img) => {
    img.removeAttribute("src");
    img.parentElement.classList.remove("filled");
  });
}

/* =========
   Card build (2×2 like your reference)
   ========= */
function coverRect(srcW, srcH, dstW, dstH) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let sw, sh, sx, sy;

  if (srcRatio > dstRatio) {
    sh = srcH;
    sw = Math.round(sh * dstRatio);
    sx = Math.round((srcW - sw) / 2);
    sy = 0;
  } else {
    sw = srcW;
    sh = Math.round(sw / dstRatio);
    sx = 0;
    sy = Math.round((srcH - sh) / 2);
  }
  return { sx, sy, sw, sh };
}

function containRect(srcW, srcH, dstW, dstH) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;

  let dw, dh, dx, dy;

  if (srcRatio > dstRatio) {
    dw = dstW;
    dh = Math.round(dstW / srcRatio);
    dx = 0;
    dy = Math.round((dstH - dh) / 2);
  } else {
    dh = dstH;
    dw = Math.round(dstH * srcRatio);
    dy = 0;
    dx = Math.round((dstW - dw) / 2);
  }
  return { dx, dy, dw, dh };
}

async function drawPhotoFillBW(ctx, dataUrl, x, y, w, h) {
  if (!dataUrl) return;

  const img = await loadImage(dataUrl);
  const { sx, sy, sw, sh } = coverRect(img.width, img.height, w, h);

  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });

  tctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  const imgData = tctx.getImageData(0, 0, w, h);
  toGrayscaleInPlace(imgData);
  tctx.putImageData(imgData, 0, 0);

  ctx.drawImage(tmp, x, y);
}

function drawTextOverlay(ctx, x, y, w, h) {
  // Always keep the 4th block white
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);

  if (!textOverlayImg) {
    // If PNG not found, leave clean white block (no error text on wedding site)
    ctx.restore();
    return;
  }

  const inset = Math.max(0, CELL_INSET | 0);
  const tx = x + inset;
  const ty = y + inset;
  const tw = w - inset * 2;
  const th = h - inset * 2;

  if (TEXT_PNG_FIT === "cover") {
    const { sx, sy, sw, sh } = coverRect(textOverlayImg.width, textOverlayImg.height, tw, th);
    ctx.drawImage(textOverlayImg, sx, sy, sw, sh, tx, ty, tw, th);
  } else {
    const { dx, dy, dw, dh } = containRect(textOverlayImg.width, textOverlayImg.height, tw, th);
    ctx.drawImage(textOverlayImg, tx + dx, ty + dy, dw, dh);
  }

  ctx.restore();
}

async function buildCard() {
  const canvas = els.stripCanvas;
  const ctx = canvas.getContext("2d");

  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // plain white card background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // layout
  const pad = CARD_PAD;
  const gap = CARD_GAP;

  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  const cellW = Math.floor((innerW - gap) / 2);
  const cellH = Math.floor((innerH - gap) / 2);

  const x1 = pad;
  const x2 = pad + cellW + gap;
  const y1 = pad;
  const y2 = pad + cellH + gap;

  // photos (no borders)
  await drawPhotoFillBW(ctx, shots[0], x1, y1, cellW, cellH);
  await drawPhotoFillBW(ctx, shots[1], x2, y1, cellW, cellH);
  await drawPhotoFillBW(ctx, shots[2], x1, y2, cellW, cellH);

  // text PNG in the 4th block
  drawTextOverlay(ctx, x2, y2, cellW, cellH);
}

/* =========
   Flow controls
   ========= */
function enableActions(enabled) {
  els.btnPrint.disabled = !enabled;
  els.btnRetake.disabled = !enabled;
}

function resetSession() {
  shots = [];
  clearThumbs();
  enableActions(false);
  hideToast();
  setStatus("Ready? Smile.");
  setStageHeight();
}

async function startSession() {
  if (busy) return;
  busy = true;

  try {
    hideToast();
    showCameraView();
    resetSession();

    els.btnStart.disabled = true;
    setStatus("Get ready… 3 photos coming up.");

    for (let i = 0; i < 3; i++) {
      setStatus(`Photo ${i + 1} of 3`);
      await countdown(3);
      flash();
      await sleep(120);

      const dataUrl = captureFrame();
      shots.push(dataUrl);
      setThumb(i, dataUrl);

      await sleep(60);
      setStageHeight();
      await sleep(420);
    }

    setStatus("Developing your film…");
    await sleep(850);

    setStatus("Building your card…");
    await buildCard();

    setStatus("");
    enableActions(true);
    showStripView();
  } catch (err) {
    console.error(err);
    setStatus("Something went wrong. Please try again.");
  } finally {
    els.btnStart.disabled = false;
    busy = false;
  }
}

function downloadCardPNG() {
  const url = els.stripCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "wedding-photo-card.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadWithAnimation() {
  if (els.btnPrint.disabled || busy) return;

  busy = true;
  els.btnPrint.disabled = true;
  els.btnRetake.disabled = true;

  // refresh card before download
  await buildCard();

  els.stripShell.classList.remove("printing");
  void els.stripShell.offsetWidth;
  els.stripShell.classList.add("printing");

  const downloadAtMs = 1750;
  const endAtMs = 2300;

  setTimeout(() => {
    downloadCardPNG();
  }, downloadAtMs);

  setTimeout(() => {
    els.stripShell.classList.remove("printing");
    els.stripCanvas.style.transform = "translateY(0)";

    showToast();

    els.btnPrint.disabled = false;
    els.btnRetake.disabled = false;
    busy = false;

    setStageHeight();
  }, endAtMs);
}

/* =========
   Events
   ========= */
els.btnEnter.addEventListener("click", async () => {
  if (busy) return;
  busy = true;

  try {
    els.btnEnter.disabled = true;
    setGateNote("Requesting camera access…");

    // show booth container
    document.body.classList.add("booth-on");
    els.booth.setAttribute("aria-hidden", "false");

    // fade gate out
    els.gate.classList.add("is-hiding");
    await sleep(300);

    // preload text PNG (don’t block UX if it fails)
    preloadTextOverlay();

    // init camera
    const ok = await initCamera();
    if (!ok) {
      els.btnEnter.disabled = false;
      return;
    }

    // hide gate from layout after success
    els.gate.style.display = "none";
    setGateNote("");

    showCameraView();
    resetSession();

    // build an "empty" card once (so preview area is ready)
    await buildCard();
    setStageHeight();
  } finally {
    busy = false;
  }
});

els.btnStart.addEventListener("click", startSession);

els.btnRetake.addEventListener("click", async () => {
  if (busy) return;
  busy = true;

  try {
    hideToast();
    setStatus("Resetting the Portrait Room…");
    await fadeStage(300);
    resetSession();
    showCameraView();
    setStatus("Ready? Smile.");
  } finally {
    busy = false;
  }
});

els.btnPrint.addEventListener("click", downloadWithAnimation);

els.btnCopyHashtag?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(SHARE_HASHTAG);
    const prev = els.btnCopyHashtag.textContent;
    els.btnCopyHashtag.textContent = "Copied";
    setTimeout(() => (els.btnCopyHashtag.textContent = prev), 900);
  } catch {
    // silently fail is OK
  }
});

window.addEventListener("resize", () => setStageHeight());

/* =========
   Init (gate only)
   ========= */
document.body.classList.remove("booth-on");
document.body.classList.remove("show-strip");
els.booth.setAttribute("aria-hidden", "true");
hideToast();
setGateNote("");
