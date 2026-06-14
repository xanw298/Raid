import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const RAID_TIMES = ["19시", "20시", "21시"];
const MAX_PARTICIPANTS = 5;
const MAX_JOIN_PER_DAY = 2;
const STORAGE_KEY = "dv3-raid-reservations";
const NICKNAME_KEY = "dv3-raid-nicknames";
const KST_OFFSET = 9 * 60 * 60 * 1000;

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const state = {
  user: null,
  nicknames: JSON.parse(localStorage.getItem(NICKNAME_KEY) || "{}"),
  reservations: JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
  selectedDate: getKstDateKey(new Date()),
};

const $ = (selector) => document.querySelector(selector);
const tables = $("#tables");

$("#googleLoginButton").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    showLoginError(error);
  }
});
$("#logoutButton").addEventListener("click", async () => {
  await signOut(auth);
});
$("#saveNickname").addEventListener("click", () => {
  const nickname = $("#nicknameInput").value.trim();
  if (!nickname) return showNotice("닉네임을 입력해 주세요.", true);
  state.nicknames[state.user.id] = nickname;
  persistNicknames();
  showNotice("닉네임이 저장되었습니다.");
  renderRaidTables();
});
$("#prevDate").addEventListener("click", () => changeDate(-1));
$("#nextDate").addEventListener("click", () => changeDate(1));

tables.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-time]");
  if (!button) return;
  button.dataset.action === "cancel" ? cancelReservation(button.dataset.time) : joinRaid(button.dataset.time);
});
tables.addEventListener("input", (event) => {
  const input = event.target.closest("input[data-ticket-time]");
  if (!input) return;
  const entry = getEntries(input.dataset.ticketTime).find((item) => item.userId === state.user.id);
  if (entry) { entry.tickets = input.value; persistReservations(); }
});

onAuthStateChanged(auth, (firebaseUser) => {
  state.user = firebaseUser ? {
    id: firebaseUser.uid,
    name: firebaseUser.displayName || firebaseUser.email || "Google 사용자",
    email: firebaseUser.email || "",
  } : null;
  render();
});

function persistNicknames() { localStorage.setItem(NICKNAME_KEY, JSON.stringify(state.nicknames)); }
function persistReservations() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.reservations)); }
function getEntries(time) { return (((state.reservations[state.selectedDate] ||= {})[time] ||= [])); }
function savedNickname() { return state.user ? state.nicknames[state.user.id] || "" : ""; }
function userName() { return savedNickname() || state.user.name || "참여자"; }

function joinRaid(time) {
  if (!savedNickname()) return showNotice("참여 전 닉네임을 저장해 주세요.", true);
  if (!canReserveSelectedDate()) return showNotice("다음날 예약은 22시 이후부터 가능합니다.", true);
  const joinedCount = RAID_TIMES.filter((raidTime) => getEntries(raidTime).some((item) => item.userId === state.user.id)).length;
  if (joinedCount >= MAX_JOIN_PER_DAY) return showNotice("하루에 최대 2개 시간대만 참여할 수 있습니다.", true);
  const entries = getEntries(time);
  if (entries.length >= MAX_PARTICIPANTS) return showNotice("해당 시간대 예약이 마감되었습니다.", true);
  entries.push({ userId: state.user.id, name: userName(), tickets: "" });
  persistReservations();
  showNotice(`${time} 레이드에 참여했습니다.`);
  renderRaidTables();
}

function cancelReservation(time) {
  const entries = getEntries(time);
  const index = entries.findIndex((item) => item.userId === state.user.id);
  if (index >= 0) entries.splice(index, 1);
  persistReservations();
  showNotice(`${time} 예약을 취소했습니다.`);
  renderRaidTables();
}

function canReserveSelectedDate() {
  const today = getKstDateKey(new Date());
  if (state.selectedDate <= today) return true;
  return getKstHour(new Date()) >= 22;
}

function changeDate(delta) {
  const date = new Date(`${state.selectedDate}T00:00:00+09:00`);
  date.setDate(date.getDate() + delta);
  state.selectedDate = getKstDateKey(date);
  showNotice("");
  renderDate(); renderRaidTables();
}

function render() {
  $("#loginCard").classList.toggle("hidden", Boolean(state.user));
  $("#reservationApp").classList.toggle("hidden", !state.user);
  if (!state.user) return;
  $("#accountName").textContent = state.user.email || state.user.name;
  $("#nicknameInput").value = savedNickname();
  renderDate(); renderRaidTables();
}

function renderDate() {
  const date = new Date(`${state.selectedDate}T00:00:00+09:00`);
  $("#dateLabel").textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full", timeZone: "Asia/Seoul" }).format(date);
}

function renderRaidTables() {
  const reservable = canReserveSelectedDate();
  tables.innerHTML = RAID_TIMES.map((time) => {
    const entries = getEntries(time);
    const joined = entries.some((item) => item.userId === state.user.id);
    const full = entries.length >= MAX_PARTICIPANTS;
    const buttonText = joined ? "예약 취소" : full ? "예약 마감" : "참여하기";
    const disabled = !joined && (!reservable || full);
    const rows = entries.map((item, index) => `
      <tr>
        <td>${index + 1}</td><td>${escapeHtml(item.name)}</td>
        <td>${item.userId === state.user.id ? `<input class="ticket-input" data-ticket-time="${time}" type="number" min="0" inputmode="numeric" value="${escapeHtml(item.tickets)}" aria-label="보유 티켓 수" />` : escapeHtml(item.tickets || "-")}</td>
      </tr>`).join("");
    return `<article class="settings-card raid-card">
      <div class="raid-header"><span class="raid-time">${time}</span><span class="status-pill ${full ? "closed" : ""}">${full ? "마감" : `${entries.length}/${MAX_PARTICIPANTS}`}</span></div>
      <table><thead><tr><th>${time}</th><th>참여자</th><th>보유 티켓 수</th></tr></thead><tbody>${rows || `<tr><td colspan="3">아직 참여자가 없습니다.</td></tr>`}</tbody></table>
      <div class="raid-actions"><button class="primary-button ${joined ? "cancel-button" : ""}" data-action="${joined ? "cancel" : "join"}" data-time="${time}" ${disabled ? "disabled" : ""}>${buttonText}</button></div>
    </article>`;
  }).join("");
  if (!reservable) showNotice("다음날 이후 예약은 한국 시간 22시 이후부터 가능합니다.", true);
}

function showLoginError(error) {
  const message = error?.code === "auth/unauthorized-domain"
    ? "Firebase Authentication 승인된 도메인에 현재 GitHub Pages 도메인을 추가해 주세요."
    : "Google 로그인에 실패했습니다. Firebase 설정을 확인해 주세요.";
  const loginHint = $("#loginError");
  loginHint.textContent = message;
  loginHint.classList.remove("hidden");
}

function showNotice(message, error = false) { const notice = $("#notice"); notice.textContent = message; notice.classList.toggle("error", error); }
function getKstDateKey(date) { return new Date(date.getTime() + KST_OFFSET).toISOString().slice(0, 10); }
function getKstHour(date) { return new Date(date.getTime() + KST_OFFSET).getUTCHours(); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
