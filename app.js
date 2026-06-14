import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const RAID_TIMES = ["19시", "20시", "21시"];
const MAX_PARTICIPANTS = 5;
const MAX_JOIN_PER_DAY = 2;
const NICKNAME_KEY = "dv3-raid-nicknames";
const AUTH_USER_KEY = "dv3-raid-auth-user";
const KST_OFFSET = 9 * 60 * 60 * 1000;

let auth;
let db;
let unsubscribeReservations = null;

const state = {
  user: null,
  nicknames: JSON.parse(localStorage.getItem(NICKNAME_KEY) || "{}"),
  reservations: [],
  selectedDate: getKstDateKey(new Date()),
};

const $ = (selector) => document.querySelector(selector);
const tables = $("#tables");
const googleLoginButton = $("#googleLoginButton");
const kakaoBrowserNotice = $("#kakaoBrowserNotice");
const openChromeButton = $("#openChromeButton");
const isKakaoTalkBrowser = /KAKAOTALK/i.test(navigator.userAgent);

if (isKakaoTalkBrowser) {
  showKakaoBrowserNotice();
} else {
  prepareFirebaseLogin();
}

googleLoginButton.addEventListener("click", async () => {
  if (isKakaoTalkBrowser) return;

  if (!auth) {
    showLoginError(null, "Firebase가 아직 초기화되지 않아 로그인할 수 없습니다.");
    return;
  }

  try {
    hideLoginError();
    googleLoginButton.disabled = true;
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    showLoginError(error);
  } finally {
    googleLoginButton.disabled = false;
  }
});

openChromeButton.addEventListener("click", openCurrentPageInChrome);

$("#logoutButton").addEventListener("click", async () => {
  if (auth) await signOut(auth);
});

$("#saveNickname").addEventListener("click", async () => {
  const nickname = $("#nicknameInput").value.trim();

  if (!nickname) return showNotice("닉네임을 입력해 주세요.", true);

  state.nicknames[state.user.id] = nickname;
  persistNicknames();

  await updateMyReservationsName(nickname);

  showNotice("닉네임이 저장되었습니다.");
  renderRaidTables();
});

$("#prevDate").addEventListener("click", () => changeDate(-1));
$("#nextDate").addEventListener("click", () => changeDate(1));

tables.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-time]");
  if (!button) return;

  if (button.dataset.action === "cancel") {
    await cancelReservation(button.dataset.time);
  } else {
    await joinRaid(button.dataset.time);
  }
});

tables.addEventListener("input", async (event) => {
  const input = event.target.closest("input[data-ticket-time]");
  if (!input) return;

  await saveMyTicket(input.dataset.ticketTime, input.value);
});

function prepareFirebaseLogin() {
  googleLoginButton.disabled = true;
  googleLoginButton.textContent = "로그인 준비 중...";

  try {
    const firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);

    googleLoginButton.disabled = false;
    googleLoginButton.innerHTML =
      '<span class="google-mark" aria-hidden="true">G</span>Google로 로그인';

    onAuthStateChanged(auth, handleAuthStateChanged);
  } catch (error) {
    showLoginError(error, "Firebase 초기화에 실패했습니다. firebase-config.js 설정을 확인해 주세요.");
  }
}

function handleAuthStateChanged(firebaseUser) {
  if (firebaseUser) {
    state.user = {
      id: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email || "Google 사용자",
      email: firebaseUser.email || "",
    };

    localStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify({
        displayName: state.user.name,
        email: state.user.email,
      })
    );

    hideLoginError();
    subscribeReservations();
  } else {
    state.user = null;
    state.reservations = [];
    localStorage.removeItem(AUTH_USER_KEY);

    if (unsubscribeReservations) {
      unsubscribeReservations();
      unsubscribeReservations = null;
    }
  }

  render();
}

function reservationsCollectionRef() {
  return collection(db, "raidReservations", state.selectedDate, "participants");
}

function reservationDocRef(userId = state.user.id) {
  return doc(db, "raidReservations", state.selectedDate, "participants", userId);
}

function subscribeReservations() {
  if (!db || !state.user) return;

  if (unsubscribeReservations) {
    unsubscribeReservations();
    unsubscribeReservations = null;
  }

  unsubscribeReservations = onSnapshot(
    reservationsCollectionRef(),
    (snapshot) => {
      state.reservations = snapshot.docs.map((docSnap) => ({
        userId: docSnap.id,
        ...docSnap.data(),
      }));

      renderRaidTables();
    },
    (error) => {
      console.error("예약 목록 불러오기 실패", error);
      showNotice("예약 목록을 불러오지 못했습니다. Firestore 규칙을 확인해 주세요.", true);
    }
  );
}

async function joinRaid(time) {
  if (!savedNickname()) {
    return showNotice("참여 전 닉네임을 저장해 주세요.", true);
  }

  if (!canReserveSelectedDate()) {
    return showNotice("다음날 예약은 22시 이후부터 가능합니다.", true);
  }

  const myReservations = state.reservations.filter((item) => item.userId === state.user.id);

  if (myReservations.some((item) => item.time === time)) {
    return showNotice("이미 해당 시간대에 참여했습니다.", true);
  }

  if (myReservations.length >= MAX_JOIN_PER_DAY) {
    return showNotice("하루에 최대 2개 시간대만 참여할 수 있습니다.", true);
  }

  const entries = getEntries(time);

  if (entries.length >= MAX_PARTICIPANTS) {
    return showNotice("해당 시간대 예약이 마감되었습니다.", true);
  }

  await setDoc(reservationDocRef(), {
    userId: state.user.id,
    name: userName(),
    time,
    tickets: "",
    updatedAt: Date.now(),
  });

  showNotice(`${time} 레이드에 참여했습니다.`);
}

async function cancelReservation(time) {
  const myReservation = state.reservations.find(
    (item) => item.userId === state.user.id && item.time === time
  );

  if (!myReservation) return;

  await deleteDoc(reservationDocRef());

  showNotice(`${time} 예약을 취소했습니다.`);
}

async function saveMyTicket(time, tickets) {
  const myReservation = state.reservations.find(
    (item) => item.userId === state.user.id && item.time === time
  );

  if (!myReservation) return;

  await setDoc(
    reservationDocRef(),
    {
      ...myReservation,
      tickets,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

async function updateMyReservationsName(nickname) {
  const myReservation = state.reservations.find((item) => item.userId === state.user.id);
  if (!myReservation) return;

  await setDoc(
    reservationDocRef(),
    {
      name: nickname,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

function getEntries(time) {
  return state.reservations
    .filter((item) => item.time === time)
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
}

function persistNicknames() {
  localStorage.setItem(NICKNAME_KEY, JSON.stringify(state.nicknames));
}

function savedNickname() {
  return state.user ? state.nicknames[state.user.id] || "" : "";
}

function userName() {
  return savedNickname() || state.user.name || "참여자";
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
  state.reservations = [];

  showNotice("");
  renderDate();
  renderRaidTables();
  subscribeReservations();
}

function render() {
  $("#loginCard").classList.toggle("hidden", Boolean(state.user));
  $("#reservationApp").classList.toggle("hidden", !state.user);

  if (!state.user) return;

  $("#accountName").textContent = state.user.email || state.user.name;
  $("#nicknameInput").value = savedNickname();

  renderDate();
  renderRaidTables();
}

function renderDate() {
  const date = new Date(`${state.selectedDate}T00:00:00+09:00`);

  $("#dateLabel").textContent = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function renderRaidTables() {
  if (!state.user) return;

  const reservable = canReserveSelectedDate();

  tables.innerHTML = RAID_TIMES.map((time) => {
    const entries = getEntries(time);
    const joined = entries.some((item) => item.userId === state.user.id);
    const full = entries.length >= MAX_PARTICIPANTS;
    const buttonText = joined ? "예약 취소" : full ? "예약 마감" : "참여하기";
    const disabled = !joined && (!reservable || full);

    const rows = entries
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>
              ${
                item.userId === state.user.id
                  ? `<input class="ticket-input" data-ticket-time="${time}" type="number" min="0" inputmode="numeric" value="${escapeHtml(item.tickets || "")}" aria-label="보유 티켓 수" />`
                  : escapeHtml(item.tickets || "-")
              }
            </td>
          </tr>
        `
      )
      .join("");

    return `
      <article class="settings-card raid-card">
        <div class="raid-header">
          <span class="raid-time">${time}</span>
          <span class="status-pill ${full ? "closed" : ""}">
            ${full ? "마감" : `${entries.length}/${MAX_PARTICIPANTS}`}
          </span>
        </div>

        <table>
          <thead>
            <tr>
              <th>${time}</th>
              <th>참여자</th>
              <th>보유 티켓 수</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="3">아직 참여자가 없습니다.</td></tr>`}
          </tbody>
        </table>

        <div class="raid-actions">
          <button
            class="primary-button ${joined ? "cancel-button" : ""}"
            data-action="${joined ? "cancel" : "join"}"
            data-time="${time}"
            ${disabled ? "disabled" : ""}
          >
            ${buttonText}
          </button>
        </div>
      </article>
    `;
  }).join("");

  if (!reservable) {
    showNotice("다음날 이후 예약은 한국 시간 22시 이후부터 가능합니다.", true);
  }
}

function showKakaoBrowserNotice() {
  googleLoginButton.classList.add("hidden");
  kakaoBrowserNotice.classList.remove("hidden");
  hideLoginError();
}

function openCurrentPageInChrome() {
  const currentUrl = window.location.href;

  if (/Android/i.test(navigator.userAgent)) {
    const url = new URL(currentUrl);
    const intentPath = `${url.host}${url.pathname}${url.search}`;

    window.location.href = `intent://${intentPath}#Intent;scheme=${url.protocol.replace(
      ":",
      ""
    )};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(currentUrl)};end`;

    return;
  }

  window.location.href = currentUrl;
}

function hideLoginError() {
  const loginHint = $("#loginError");

  loginHint.textContent = "";
  loginHint.classList.add("hidden");
}

function showLoginError(error, fallbackMessage) {
  const message = fallbackMessage || getFirebaseErrorMessage(error);
  const loginHint = $("#loginError");

  loginHint.textContent = error?.code ? `${message} (${error.code})` : message;
  loginHint.classList.remove("hidden");

  console.error("Firebase Google login error", error);
}

function getFirebaseErrorMessage(error) {
  if (error?.code === "auth/unauthorized-domain") {
    return "Firebase Authentication 승인된 도메인에 현재 GitHub Pages 도메인을 추가해 주세요.";
  }

  if (error?.code === "auth/popup-blocked") {
    return "팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해 주세요.";
  }

  if (error?.code === "auth/operation-not-allowed") {
    return "Firebase Authentication에서 Google 로그인 제공업체를 사용 설정해 주세요.";
  }

  if (error?.code === "auth/invalid-api-key") {
    return "firebase-config.js의 apiKey가 올바른 Firebase Web app 설정인지 확인해 주세요.";
  }

  return "Google 로그인에 실패했습니다. Firebase 설정과 브라우저 콘솔 오류를 확인해 주세요.";
}

function showNotice(message, error = false) {
  const notice = $("#notice");

  notice.textContent = message;
  notice.classList.toggle("error", error);
}

function getKstDateKey(date) {
  return new Date(date.getTime() + KST_OFFSET).toISOString().slice(0, 10);
}

function getKstHour(date) {
  return new Date(date.getTime() + KST_OFFSET).getUTCHours();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char]));
}
