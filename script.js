const page = document.querySelector(".profile-page");
const audio = document.querySelector(".audio");
const range = document.querySelector(".song-range");
const elapsedLabel = document.querySelector(".elapsed");
const durationLabel = document.querySelector(".duration");
const albumState = document.querySelector(".album-state");
const mainToggle = document.querySelector(".main-toggle");
const toggleButtons = document.querySelectorAll('[data-action="toggle"]');
const restartButtons = document.querySelectorAll('[data-action="restart"]');
const presence = document.querySelector(".discord-presence");
const presenceAvatar = document.querySelector(".presence-avatar");
const presenceName = document.querySelector(".presence-name");
const presenceStatus = document.querySelector(".presence-status");
const viewCount = document.querySelector(".view-count");

// Put your Discord user ID here. Join Lanyard Discord first for live status.
const DISCORD_USER_ID = "1021433794705768518";
const VIEW_COUNT_KEY = "linkpage-wexz-view-count-fallback";
const VIEW_COUNTER_URL = "https://api.counterapi.dev/v1/linkpage-wexz/profile-views/up";
const VIEW_COUNTER_BASELINE = 35;
const DISCORD_STATUS_LABELS = {
  online: "discord online",
  idle: "discord idle",
  dnd: "do not disturb",
  offline: "discord offline",
};

let discordSocket;
let heartbeatTimer;
let reconnectTimer;

function formatTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function setPlaying(playing) {
  page.dataset.playing = playing ? "true" : "false";
  albumState.textContent = playing ? "pause" : "play";
  mainToggle.setAttribute("aria-label", playing ? "Pause song" : "Play song");
  mainToggle.classList.toggle("is-paused", playing);
}

function formatViewCount(count) {
  return new Intl.NumberFormat("en-US").format(count);
}

function setViewCount(count) {
  viewCount.textContent = formatViewCount(count);
}

function syncFallbackViewCount(start) {
  let count = start + 1;

  try {
    const saved = Number(localStorage.getItem(VIEW_COUNT_KEY));
    count = Number.isFinite(saved) && saved >= start ? saved + 1 : count;
    localStorage.setItem(VIEW_COUNT_KEY, String(count));
  } catch {
    // Keep the page usable if browser storage is disabled.
  }

  setViewCount(count);
}

async function syncViewCount() {
  if (!viewCount) return;

  const start = Number(viewCount.dataset.start || viewCount.textContent || 19);
  const initialCount = Number.isFinite(start) ? start : 36;
  setViewCount(initialCount);

  try {
    const response = await fetch(VIEW_COUNTER_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("View counter request failed");

    const payload = await response.json();
    const remoteCount = Number(payload?.count ?? payload?.value ?? payload?.data);
    if (!Number.isFinite(remoteCount)) throw new Error("View counter payload invalid");

    const count = Math.max(initialCount, VIEW_COUNTER_BASELINE + remoteCount);
    setViewCount(count);

    try {
      localStorage.setItem(VIEW_COUNT_KEY, String(count));
    } catch {
      // Ignore storage failures; the global counter already worked.
    }
  } catch {
    syncFallbackViewCount(initialCount);
  }
}

function syncTime() {
  const duration = audio.duration || 0;
  const elapsed = audio.currentTime || 0;
  const progress = duration ? Math.min(100, (elapsed / duration) * 100) : 0;

  elapsedLabel.textContent = formatTime(elapsed);
  durationLabel.textContent = formatTime(duration);
  range.value = String(progress);
  range.style.setProperty("--progress", `${progress}%`);
}

async function togglePlay() {
  if (!audio.paused) {
    audio.pause();
    setPlaying(false);
    return;
  }

  try {
    await audio.play();
    setPlaying(true);
  } catch {
    setPlaying(false);
  }
}

function prepareAutoplayFallback() {
  const retry = (event) => {
    if (event?.target?.closest?.("a, button, input")) return;
    cleanup();
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  const cleanup = () => {
    page.removeEventListener("pointerdown", retry);
    window.removeEventListener("keydown", retry);
  };

  albumState.textContent = "tap";
  page.addEventListener("pointerdown", retry);
  window.addEventListener("keydown", retry);
}

async function autoplaySong() {
  audio.volume = 0.78;

  try {
    await audio.play();
    setPlaying(true);
  } catch {
    setPlaying(false);
    prepareAutoplayFallback();
  }
}

function restartSong() {
  audio.currentTime = 0;
  syncTime();
  if (!audio.paused) {
    audio.play().catch(() => setPlaying(false));
  }
}

function setDiscordStatus(status, label) {
  if (!presence || !presenceStatus) return;
  presence.dataset.status = status;
  presenceStatus.textContent = label;
}

function discordAvatarUrl(user) {
  if (!user?.id || !user?.avatar) return "";
  const extension = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
}

function applyDiscordPresence(data) {
  const status = data?.discord_status || "offline";
  const user = data?.discord_user;
  const displayName = user?.display_name || user?.global_name || user?.username;
  const avatar = discordAvatarUrl(user);

  setDiscordStatus(status, DISCORD_STATUS_LABELS[status] || DISCORD_STATUS_LABELS.offline);
  if (displayName && presenceName) presenceName.textContent = displayName;
  if (avatar && presenceAvatar) presenceAvatar.src = avatar;
}

async function fetchDiscordPresence() {
  const userId = DISCORD_USER_ID.trim();
  if (!userId) {
    setDiscordStatus("offline", DISCORD_STATUS_LABELS.offline);
    return;
  }

  setDiscordStatus("loading", "checking discord");

  try {
    const response = await fetch(`https://api.lanyard.rest/v1/users/${userId}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Discord status request failed");

    const payload = await response.json();
    applyDiscordPresence(payload?.data);
  } catch {
    setDiscordStatus("offline", DISCORD_STATUS_LABELS.offline);
  }
}

function scheduleDiscordReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectDiscordPresence, 5000);
}

function connectDiscordPresence() {
  const userId = DISCORD_USER_ID.trim();
  if (!userId) {
    setDiscordStatus("offline", DISCORD_STATUS_LABELS.offline);
    return;
  }

  if (!("WebSocket" in window)) {
    fetchDiscordPresence();
    setInterval(fetchDiscordPresence, 30000);
    return;
  }

  clearInterval(heartbeatTimer);
  clearTimeout(reconnectTimer);
  setDiscordStatus("loading", "connecting discord");

  const socket = new WebSocket("wss://api.lanyard.rest/socket");
  discordSocket = socket;

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.op === 1) {
      socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: userId } }));
      heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ op: 3 }));
        }
      }, message.d?.heartbeat_interval || 30000);
      return;
    }

    if (message.op === 0 && (message.t === "INIT_STATE" || message.t === "PRESENCE_UPDATE")) {
      applyDiscordPresence(message.d);
    }
  });

  socket.addEventListener("close", () => {
    if (discordSocket !== socket) return;
    clearInterval(heartbeatTimer);
    scheduleDiscordReconnect();
  });

  socket.addEventListener("error", () => {
    setDiscordStatus("offline", DISCORD_STATUS_LABELS.offline);
  });
}

page.addEventListener("pointermove", (event) => {
  page.style.setProperty("--mx", `${event.clientX}px`);
  page.style.setProperty("--my", `${event.clientY}px`);
});

range.addEventListener("input", () => {
  const duration = audio.duration || 0;
  if (!duration) return;
  audio.currentTime = (Number(range.value) / 100) * duration;
  syncTime();
});

toggleButtons.forEach((button) => button.addEventListener("click", togglePlay));
restartButtons.forEach((button) => button.addEventListener("click", restartSong));

audio.addEventListener("loadedmetadata", syncTime);
audio.addEventListener("timeupdate", syncTime);
audio.addEventListener("pause", () => setPlaying(false));
audio.addEventListener("play", () => setPlaying(true));
audio.addEventListener("ended", () => setPlaying(false));

syncTime();
syncViewCount();
connectDiscordPresence();
autoplaySong();
