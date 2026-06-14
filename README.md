# 드빌3 레이드 예약 사이트

정적 HTML/CSS/JavaScript로 만든 드빌3 레이드 예약 프로토타입입니다.

## 기능

- Google Identity Services 기반 구글 로그인 UI
- 로그인 후 닉네임 저장
- 날짜 이동 헤더
- 19시, 20시, 21시 레이드 예약 표
- 시간대별 참여자, 보유 티켓 수 입력
- 사용자당 하루 최대 2개 시간대 참여 제한
- 다음날 이후 예약은 한국 시간 22시 이후 가능
- 시간대별 최대 5명 예약 마감
- iOS 설정 앱 느낌의 카드형 디자인

## 실행

브라우저에서 `index.html`을 열거나 정적 서버로 실행하세요.

```bash
python3 -m http.server 8000
```

> 실제 구글 로그인을 사용하려면 `index.html`의 `YOUR_GOOGLE_CLIENT_ID`를 Google Cloud Console에서 발급받은 OAuth 클라이언트 ID로 바꾸세요.
