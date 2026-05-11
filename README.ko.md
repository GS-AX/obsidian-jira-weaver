# Jira Weaver

**Jira Weaver**는 Jira 이슈 데이터를 Obsidian Vault에 자동으로 동기화하는 커뮤니티 플러그인입니다. "Weave(엮다)"라는 이름처럼, Jira 이슈들을 Obsidian의 위키링크·Graph View·Dataview로 이루어진 지식 네트워크에 촘촘히 엮어냅니다.

> **Language:** [English README](README.md)

---

## 주요 기능

- **원클릭 동기화** — Jira 이슈를 YAML Frontmatter가 포함된 Markdown 파일로 가져오기
- **커스텀 필드 매핑** — Jira 시스템 필드 및 커스텀 필드를 Obsidian Frontmatter 키에 자유롭게 매핑
- **다중 JQL 프로파일** — 서로 다른 JQL 쿼리를 각기 다른 폴더로 동시에 동기화
- **메모 보호** — `<!-- jira-weaver:end -->` 마커 아래에 작성한 개인 메모를 동기화 시 보존
- **위키링크 래핑** — 필드 값을 `[[위키링크]]`로 변환해 Graph View·Dataview 활용
- **동기화 로그 패널** — 프로파일별 생성/수정/건너뜀/오류 이력
- **필드 프리셋 내보내기/가져오기** — Vault 간 또는 팀원과 필드 매핑 설정 공유
- **다국어 UI** — English, 한국어, 日本語, 中文(简体); Obsidian 앱 언어 자동 감지
- **유연한 인증** — Bearer 토큰(Jira Server/Data Center) 또는 이메일+API 토큰 Basic 인증(Jira Cloud)
- **동기화 트리거** — 수동, 시작 시, 또는 설정 간격마다 자동 실행

---

## 설치

### Obsidian 커뮤니티 플러그인에서 설치 (권장)

1. **설정 → 커뮤니티 플러그인 → 탐색** 을 엽니다.
2. **Jira Weaver**를 검색하고 **설치**를 클릭합니다.
3. 플러그인을 활성화합니다.

### 수동 설치

1. [최신 릴리스](https://github.com/obsidian-jira-weaver/obsidian-jira-weaver/releases)에서 `main.js`, `manifest.json`, `styles.css`를 다운로드합니다.
2. `<Vault 경로>/.obsidian/plugins/jira-weaver/` 폴더에 복사합니다.
3. Obsidian을 재시작하고 **설정 → 커뮤니티 플러그인**에서 플러그인을 활성화합니다.

---

## 빠른 시작

### 1. 연결 설정

**설정 → Jira Weaver**를 엽니다.

| 항목 | 설명 |
|---|---|
| **인증 방식** | Server/Data Center는 `Bearer 토큰`, Cloud는 `Basic 인증` |
| **Jira 이메일** | (Cloud 전용) Atlassian 계정 이메일 주소 |
| **Jira 도메인** | 기본 URL, 예: `https://mycompany.atlassian.net` |
| **개인 액세스 토큰** | API 토큰; 로컬에만 저장되며 외부로 전송되지 않음 |

### 2. JQL 프로파일 추가

**JQL 프로파일** 섹션에서 **프로파일 추가**를 클릭하세요.

- **프로파일 이름** — 동기화 로그에 표시될 이름
- **JQL 쿼리** — 예: `assignee = currentUser() AND sprint in openSprints()`
- **대상 폴더** — 이슈 파일이 저장될 Vault 폴더 (자동 생성)
- **최대 결과 수** — 동기화당 최대 이슈 수 (기본값 50)

토글로 프로파일을 활성화하고 저장하세요.

### 3. 동기화 실행

**명령 팔레트** (`Ctrl/Cmd+P`)에서 검색:

| 명령 | 설명 |
|---|---|
| `Jira Weaver: Sync Issues` | 일반 동기화 (변경되지 않은 이슈는 건너뜀) |
| `Jira Weaver: Force Sync Issues (Overwrite All)` | 업데이트 시간 무관하게 모든 파일 덮어쓰기 |
| `Jira Weaver: Reload Field List` | Jira 필드 목록 새로고침 (커스텀 필드 확인 필요) |
| `Jira Weaver: Open Sync Log` | 동기화 이력 패널 열기 |

---

## 생성 파일 형식

각 이슈는 `<KEY> <요약>.md` 형태의 Markdown 파일로 저장됩니다.

```markdown
---
key: PRJ-123
title: 로그인 버그 수정
status: In Progress
priority: High
assignee: 홍길동
reporter: 김철수
created: "2025-01-15"
updated: "2025-04-01"
jira_url: https://mycompany.atlassian.net/browse/PRJ-123
---

## 📋 설명

Jira에서 가져온 이슈 설명…

## 🔗 관련 정보

| 필드     | 값          |
|----------|-------------|
| 상태     | In Progress |
| 우선순위 | High        |

*마지막 동기화: 2025-05-10 09:30*

<!-- jira-weaver:end -->

## ✏️ 내 메모

마커 아래의 내용은 모두 내 것입니다 — 동기화 후에도 보존됩니다.
```

---

## 메모 보호

`<!-- jira-weaver:end -->` 마커가 Jira 관리 영역(위)과 개인 메모 영역(아래)을 구분합니다. 동기화할 때마다 마커 위의 내용만 덮어씁니다.

마커가 없을 때는 **메모 보호 → 마커가 없을 때** 설정이 동작을 제어합니다:

| 설정 | 동작 |
|---|---|
| **덮어쓰기** (기본값) | 파일 전체를 새로 씁니다 |
| **파일 건너뛰기** | 파일을 그대로 두고 경고를 기록합니다 |
| **파일 끝에 추가** | 파일 끝에 새 Jira 블록을 추가합니다 |

---

## 필드 매핑

**설정 → Jira Weaver → 필드 매핑**에서 Frontmatter에 기록할 Jira 필드를 커스터마이즈하세요.

- **필드 새로고침**을 클릭해 Jira 인스턴스의 전체 필드 목록(커스텀 필드 포함)을 가져옵니다.
- 필드를 토글로 켜고 끄거나, 드래그로 순서를 바꿉니다.
- **편집**을 클릭해 세부 설정:
  - **Obsidian 키** — Frontmatter에 쓰일 YAML 키 이름
  - **값 유형** — 원시값 정규화 방식 (문자열, 숫자, 배열 등)
  - **JSON 경로** — 중첩 값 추출 경로 (예: `fields.sprint[0].name`)
  - **위키링크** — 값을 Obsidian `[[위키링크]]`로 래핑

### 프리셋 내보내기/가져오기

**프리셋 내보내기** / **프리셋 가져오기** 버튼으로 필드 매핑 설정을 Vault 루트의 `jira-weaver-preset.json` 파일로 저장하거나 불러옵니다.

---

## 동기화 트리거

| 트리거 | 설명 |
|---|---|
| **수동** | 명령을 직접 실행할 때만 동기화 |
| **시작 시** | Obsidian이 열릴 때 한 번 동기화 |
| **주기적** | N분마다 자동 동기화 (1~1440분) |

---

## 개인정보 및 보안

- 도메인 URL, 토큰, 이메일은 Obsidian 플러그인 데이터(`data.json`)에 로컬로만 저장됩니다. 설정한 Jira 인스턴스 외부로는 **절대 전송되지 않습니다**.
- 네트워크 요청은 사용자가 직접 설정한 도메인으로만 이루어집니다.

---

## 문제 해결

| 증상 | 해결 방법 |
|---|---|
| "인증 실패" 알림 | PAT 만료 여부 확인; Cloud 사용자는 **Jira 이메일**도 설정 필요 |
| "JQL 오류" 알림 | Jira 이슈 검색에서 JQL을 먼저 테스트 |
| 커스텀 필드가 보이지 않음 | 연결 정보 입력 후 **필드 새로고침** 클릭 |
| 파일이 생성되지 않음 | JQL 쿼리 결과와 대상 폴더 경로 확인 |
| 동기화 후 메모가 사라짐 | 파일에 `<!-- jira-weaver:end -->` 마커가 있는지 확인 |

---

## 기여하기

개발 환경 설정, 코딩 규칙, PR 가이드라인은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

---

## 라이선스

[MIT](LICENSE)
