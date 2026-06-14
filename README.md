# 드빌3 레이드 예약 사이트

정적 HTML/CSS/JavaScript로 만든 드빌3 레이드 예약 프로토타입입니다. GitHub Pages에서 동작하도록 Firebase Authentication의 Google 로그인 팝업 방식을 사용합니다.

## 기능

- Firebase Authentication `signInWithPopup(new GoogleAuthProvider())` 기반 Google 로그인
- 카카오톡 인앱 브라우저 감지 시 Chrome에서 열기 안내
- 로그인 후 닉네임 저장
- 날짜 이동 헤더
- 19시, 20시, 21시 레이드 예약 표
- 시간대별 참여자, 보유 티켓 수 입력
- 사용자당 하루 최대 2개 시간대 참여 제한
- 다음날 이후 예약은 한국 시간 22시 이후 가능
- 시간대별 최대 5명 예약 마감
- iOS 설정 앱 느낌의 카드형 디자인

## Firebase 설정

1. Firebase Console에서 웹 앱을 만들고 `firebase-config.js`의 `firebaseConfig` 값을 실제 프로젝트의 **Firebase SDK 설정 객체**로 교체하세요. Google Cloud OAuth 클라이언트 ID는 입력하지 않습니다.
2. Firebase Console > Authentication > Sign-in method에서 Google 제공업체를 사용 설정하세요.
3. Firebase Console > Authentication > Settings > Authorized domains에 GitHub Pages 도메인을 추가하세요.
   - 사용자 페이지 예: `사용자명.github.io`
   - 커스텀 도메인을 사용하면 해당 도메인도 추가하세요.
4. 저장소 Settings > Pages에서 배포 브랜치와 폴더를 선택하면 정적 파일 그대로 `/Raid/` 경로에 배포됩니다. 이 프로젝트는 `./app.js`, `./styles.css`, `./firebase-config.js` 상대 경로를 사용하므로 GitHub Pages 프로젝트 경로에서도 동작합니다.

## 로그인 오류 점검

- 이 코드에는 이전 Google Identity Services 스크립트나 OAuth 클라이언트 ID 직접 입력 방식을 사용하지 않습니다.
- 배포 후에도 예전 Google Identity Services 요청이 보이면 브라우저 캐시 또는 GitHub Pages 캐시가 이전 `index.html`을 보고 있는 것이므로 강력 새로고침 후 다시 확인하세요.
- Firebase Google 로그인은 Firebase 프로젝트의 Web app `firebaseConfig`와 Authentication Google 제공업체 설정만 사용합니다.

## 실행

브라우저에서 `index.html`을 열거나 정적 서버로 실행하세요.

```bash
python3 -m http.server 8000
```
