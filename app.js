/* Vintage Photo Booth
   - 3 photos with countdown
   - GUARANTEED black & white (pixel-level grayscale) for:
     capture, thumbs, strip, and download
   - PRINT PHOTO = animation + download (no print dialog)
*/

const els = {
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
   CUSTOMIZE THESE (your bottom text)
   ========= */
const STRIP_DATE = "21.04.2029";
const STRIP_NAMES = "SHREK • FIONA";

/* =========
   CUSTOMIZE INITIALS HERE
   ========= */
const INITIAL_LEFT = "S";
const INITIAL_RIGHT = "F";


/* =========
   UI helpers
   ========= */
function setStatus(msg) {
  els.status.textContent = msg || "";
}

/**
 * IMPORTANT:
 * Your panels are absolute (inset:0), so their scrollHeight becomes
 * at least the stage height (circular measurement).
 * Solution: measure using an offscreen clone with position:static.
 */
function measurePanelNaturalHeight(panel) {
  if (!panel || !els.stage) return 720;

  const stageRect = els.stage.getBoundingClientRect();
  const width = Math.max(320, Math.round(stageRect.width));

  // Clone the panel
  const clone = panel.cloneNode(true);

  // Remove IDs from the clone to avoid duplicates
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));

  // Force clone to natural layout sizing
  clone.style.position = "static";
  clone.style.inset = "auto";
  clone.style.transform = "none";
  clone.style.opacity = "1";
  clone.style.pointerEvents = "none";
  clone.style.visibility = "hidden";
  clone.style.width = width + "px";
  clone.style.maxWidth = "none";

  // Wrapper that is offscreen but measurable
  const wrap = document.createElement("div");
  wrap.style.position = "absolute";
  wrap.style.left = "-9999px";
  wrap.style.top = "0";
  wrap.style.width = width + "px";
  wrap.style.pointerEvents = "none";
  wrap.style.visibility = "hidden";

  wrap.appendChild(clone);
  document.body.appendChild(wrap);

  // Measure
  const h = Math.ceil(clone.scrollHeight);

  // Cleanup
  wrap.remove();

  // Safety floor so it never collapses too small
  return Math.max(h, 520);
}

let heightRaf = null;
function setStageHeight() {
  if (!els.stage || !els.cameraPanel || !els.stripPanel) return;

  // Debounce into next frame (prevents measuring mid-transition/layout)
  if (heightRaf) cancelAnimationFrame(heightRaf);
  heightRaf = requestAnimationFrame(() => {
    const inStrip = document.body.classList.contains("show-strip");
    const target = inStrip ? els.stripPanel : els.cameraPanel;

    const h = measurePanelNaturalHeight(target);

    // Ensure we never keep an old minHeight around
    els.stage.style.minHeight = "0px";
    els.stage.style.height = h + "px";
  });
}

function showStripView() {
  document.body.classList.add("show-strip");
  setStageHeight();
}

function showCameraView() {
  document.body.classList.remove("show-strip");
  setStageHeight();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function initCamera() {
  try {
    setStatus("Requesting camera access…");

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    els.video.srcObject = stream;

    await new Promise(res => {
      els.video.onloadedmetadata = () => res();
    });

    setStatus("Ready. Press “Start 3-Shot Session”.");
  } catch (err) {
    console.error(err);
    setStatus("Camera blocked. Please allow camera permission and reload.");
  }
}

async function countdown(seconds = 3) {
  els.countdown.classList.add("show");
  for (let i = seconds; i >= 1; i--) {
    els.countdown.textContent = String(i);
    await sleep(750);
  }
  els.countdown.textContent = "•";
  await sleep(180);
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
    const r = d[i], g = d[i + 1], b = d[i + 2];
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

  // convert to grayscale (guaranteed)
  const imgData = ctx.getImageData(0, 0, vw, vh);
  toGrayscaleInPlace(imgData);
  ctx.putImageData(imgData, 0, 0);

  // subtle vignette
  const g = ctx.createRadialGradient(
    vw / 2, vh / 2, Math.min(vw, vh) * 0.18,
    vw / 2, vh / 2, Math.max(vw, vh) * 0.68
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

  img.onload = () => setStageHeight(); // ✅ stage grows correctly when thumb appears
  img.src = dataUrl;

  img.parentElement.classList.add("filled");
}

function clearThumbs() {
  [els.thumb1, els.thumb2, els.thumb3].forEach(img => {
    img.removeAttribute("src");
    img.parentElement.classList.remove("filled");
  });
}

/* =========
   STRIP BUILD
   ========= */
async function buildStrip() {
  const canvas = els.stripCanvas;
  const ctx = canvas.getContext("2d");

  const W = canvas.width;   // 600
  const H = canvas.height;  // 1800

  const pad = 28;
  const gap = 12;
  const topPadExtra = 30;
  const bottomArea = 320;

  const photoW = W - pad * 2;
  const photoH = Math.floor((H - pad * 2 - topPadExtra - bottomArea - gap * 2) / 3);

  ctx.clearRect(0, 0, W, H);

  // strip background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // tiny paper tint
  const paper = ctx.createLinearGradient(0, 0, W, H);
  paper.addColorStop(0, "rgba(0,0,0,0.025)");
  paper.addColorStop(1, "rgba(0,0,0,0.01)");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // photos
  for (let i = 0; i < 3; i++) {
    const y = pad + topPadExtra + i * (photoH + gap);
    if (shots[i]) {
      await drawStripPhotoBW(ctx, shots[i], pad, y, photoW, photoH);
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.03)";
      roundRect(ctx, pad, y, photoW, photoH, 12);
      ctx.fill();
      ctx.restore();
    }
  }

  // bottom text positions
  const initialsY = H - pad - 110;
  const dateY = initialsY - 145;
  const namesY = H - pad - 34;

  ctx.textAlign = "center";

  // DATE
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = "22px 'Times New Roman', Times, serif";
  ctx.fillText(STRIP_DATE, W / 2, dateY);

  // INITIALS
  const centerX = W / 2;
  const letterSize = 120;
  const letterSpacing = 70;
  const liftAmount = 20;

  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.font = `${letterSize}px 'Times New Roman', Times, serif`;

  ctx.fillText(INITIAL_LEFT, centerX - letterSpacing, initialsY - liftAmount);
  ctx.fillText(INITIAL_RIGHT, centerX + letterSpacing, initialsY + 10);

  // diagonal line
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 2;

  const lineHeight = 120;
  const lineTilt = 35;
  const lineCenterY = initialsY - 40;

  ctx.beginPath();
  ctx.moveTo(centerX + lineTilt, lineCenterY - lineHeight / 2);
  ctx.lineTo(centerX - lineTilt, lineCenterY + lineHeight / 2);
  ctx.stroke();

  // NAMES
  ctx.fillStyle = "rgba(0,0,0,0.60)";
  ctx.font = "25px 'Times New Roman', Times, serif";
  ctx.fillText(STRIP_NAMES, W / 2, namesY);

  // line under names
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 180, namesY + 22);
  ctx.lineTo(W / 2 + 180, namesY + 22);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function drawStripPhotoBW(ctx, dataUrl, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();

  const inset = 8;
  const ix = x + inset;
  const iy = y + inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;

  const img = await loadImage(dataUrl);
  const { sx, sy, sw, sh } = coverRect(img.width, img.height, iw, ih);

  const tmp = document.createElement("canvas");
  tmp.width = iw;
  tmp.height = ih;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });

  tctx.drawImage(img, sx, sy, sw, sh, 0, 0, iw, ih);

  const imgData = tctx.getImageData(0, 0, iw, ih);
  toGrayscaleInPlace(imgData);
  tctx.putImageData(imgData, 0, 0);

  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 8;

  ctx.drawImage(tmp, ix, iy);

  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(ix + 1, iy + 1, iw - 2, ih - 2);

  ctx.restore();
}

function enableActions(enabled) {
  els.btnPrint.disabled = !enabled;
}

function resetSession() {
  shots = [];
  clearThumbs();
  enableActions(false);
  setStatus("Ready. Press “Start 3-Shot Session”.");

  // ensure camera buttons show correctly
  els.btnRetake.disabled = true;
  els.btnStart.disabled = false;

  setStageHeight();
}

async function startSession() {
  if (busy) return;
  busy = true;

  try {
    showCameraView();
    resetSession();

    els.btnStart.disabled = true;
    els.btnRetake.disabled = true;
    setStatus("Get ready… 3 photos coming up.");

    for (let i = 0; i < 3; i++) {
      setStatus(`Photo ${i + 1} of 3`);
      await countdown(3);
      flash();
      await sleep(120);

      const dataUrl = captureFrame();
      shots.push(dataUrl);
      setThumb(i, dataUrl);

      // give layout a moment to update, then measure
      await sleep(60);
      setStageHeight();

      await sleep(420);
    }

    setStatus("Building your strip…");
    await buildStrip();

    setStatus("Your strip is ready. Press PRINT PHOTO.");
    enableActions(true);
    els.btnRetake.disabled = false;

    showStripView();
  } catch (err) {
    console.error(err);
    setStatus("Something went wrong. Please try again.");
  } finally {
    els.btnStart.disabled = false;
    busy = false;
  }
}

function downloadStripPNG() {
  const url = els.stripCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "photo-strip.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function printLikeDownload() {
  if (els.btnPrint.disabled || busy) return;

  els.btnPrint.disabled = true;

  await buildStrip();

  els.stripShell.classList.remove("printing");
  void els.stripShell.offsetWidth;
  els.stripShell.classList.add("printing");

  const downloadAtMs = 1750;
  const resetAtMs = 2300;

  setTimeout(() => {
    downloadStripPNG();
  }, downloadAtMs);

setTimeout(() => {
  els.stripShell.classList.remove("printing");
  els.btnPrint.disabled = false;

  // ✅ reset strip position for next run
  els.stripCanvas.style.transform = "translateY(0)";

  resetSession();
  showCameraView();
  requestAnimationFrame(() => setStageHeight());
}, resetAtMs);

}

/* =========
   Events
   ========= */
els.btnStart.addEventListener("click", startSession);

els.btnRetake.addEventListener("click", async () => {
  if (busy) return;

  showCameraView();
  resetSession();

  await buildStrip(); // keeps strip canvas ready (optional)
  setStageHeight();
});

els.btnPrint.addEventListener("click", printLikeDownload);

/* =========
   Init
   ========= */
showCameraView();
initCamera().then(async () => {
  await buildStrip();
  resetSession();
  setStageHeight();
});

window.addEventListener("resize", () => setStageHeight());
