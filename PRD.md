# Product Requirements Document (PRD)
# Jira Weaver — Obsidian Plugin

**버전:** v0.5.0
**최종 수정일:** 2026-05-10
**작성자:** 플러그인 기획팀
**상태:** 검토 중
**플러그인 ID:** `jira-weaver`
**GitHub 예정 저장소:** `obsidian-jira-weaver`

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|---|---|---|
| v0.1.0 | 2026-05-10 | 최초 작성 — 핵심 동기화 기능 정의 |
| v0.2.0 | 2026-05-10 | 3.7 필드 매핑 시스템 섹션 추가 |
| v0.3.0 | 2026-05-10 | 플러그인명 Jira Weaver 확정, 3.8 다국어(i18n) 지원 섹션 추가 |
| v0.4.0 | 2026-05-10 | 3.3 Frontmatter 강제 저장 규칙 명확화, 3.5 내 메모 보호 로직 추가, 3.4 위키링크 온톨로지 설계 보강, 3.9 동기화 트리거 정의 추가 |
| v0.5.0 | 2026-05-10 | 3.8 초기 지원 언어에 일본어(ja), 중국어 간체(zh) 추가 — 4개 언어 동시 출시로 변경 |

---

## 1. 개요 (Overview)

### 1.1 플러그인 소개

**Jira Weaver**는 Jira 이슈 데이터를 Obsidian Vault에 자동으로 동기화하는 커뮤니티 플러그인이다. "Weave(엮다)"라는 이름처럼, Jira의 이슈들을 Obsidian의 위키링크·Graph View·Dataview로 이루어진 지식 네트워크에 촘촘히 엮어낸다.

### 1.2 배경 및 문제 정의

- Jira 이슈에 대한 맥락적 노트를 Obsidian에서 작성해도 Jira 이슈와 자동으로 연결되지 않는다.
- Jira 이슈를 확인하려면 항상 브라우저로 전환해야 하며, 오프라인 환경에서는 접근이 불가능하다.
- Obsidian의 Dataview, Graph View 같은 강력한 시각화 기능을 Jira 데이터에 활용할 수 없다.
- 회사마다 Jira 커스텀 필드 구성이 상이하여 고정된 필드 세트로는 모든 조직의 니즈를 충족할 수 없다.
- 글로벌 팀 환경에서 플러그인 UI와 생성 파일이 특정 언어에 고정되면 비영어권 사용자의 접근성이 낮아진다.
- **동기화 시 덮어쓰기로 인해 로컬에서 작성한 개인 메모와 분석 내용이 사라질 수 있다.**

### 1.3 목표

- Jira REST API로 이슈 데이터를 Vault에 자동 동기화한다.
- 각 조직의 커스텀 필드 구성에 맞게 완전히 커스터마이징 가능한 필드 매핑 시스템을 제공한다.
- 모든 Jira 필드 데이터를 YAML Frontmatter에 구조화하여 Dataview 등과 완전 호환되도록 한다.
- 동기화 시 Jira 원본 구역과 사용자 메모 구역을 분리하여 개인 메모를 보호한다.
- 플러그인 UI, 알림 메시지, 생성 파일 본문까지 모든 텍스트를 다국어로 제공한다.

### 1.4 비목표 (Out of Scope)

- Obsidian → Jira 양방향 동기화 (v1.0 이후 검토)
- Jira 첨부파일 다운로드 및 동기화
- Jira Software 스프린트/보드 시각화
- Jira Service Management 티켓 관리
- 클라우드 기반 동기화 서버 운영

---

## 2. 대상 사용자 (Target Users)

| 페르소나 | 역할 | 핵심 니즈 |
|---|---|---|
| **개발자 Alex** | 소프트웨어 엔지니어 | 담당 Jira 이슈 파일에 개인 디버깅 메모를 작성하되, 동기화 시 덮어쓰이지 않길 원한다 |
| **PM Jamie** | 프로젝트 매니저 | Frontmatter에 구조화된 데이터로 Dataview 스프린트 대시보드를 구성하고 싶다 |
| **테크 리드 Sam** | 시니어 개발자 | 담당자·컴포넌트·에픽이 위키링크로 변환되어 Graph View에서 지식 네트워크가 형성되길 원한다 |
| **DevOps Casey** | 시스템 관리자 | 회사 전용 커스텀 필드(배포 환경, SLA 등)까지 Frontmatter에 포함되길 원한다 |
| **글로벌 팀원 Hana** | 한국어 사용 PM | 한국어 UI와 한국어로 생성된 .md 파일로 작업하고 싶다 |

---

## 3. 핵심 기능 요구사항 (Functional Requirements)

### 3.1 설정(Settings) 탭 — 연결 정보

**우선순위:** 🔴 Must Have

| 설정 항목 | 타입 | 필수 여부 | 설명 | 예시 |
|---|---|---|---|---|
| `jiraDomain` | Text | ✅ 필수 | Jira 인스턴스 URL | `https://mycompany.atlassian.net` |
| `personalAccessToken` | Password | ✅ 필수 | Jira PAT (마스킹 표시) | `ATATxxxxxxxx` |
| `targetFolder` | Text | ✅ 필수 | Vault 내 저장 폴더 경로 | `Jira/Issues` |
| `jqlQuery` | Textarea | ✅ 필수 | 동기화할 이슈 필터 JQL | `project = "PROJ" AND status != Done` |
| `maxResults` | Number | ❌ 선택 | 최대 동기화 이슈 수 (기본: 50) | `100` |
| `language` | Select | ❌ 선택 | UI 및 파일 생성 언어 오버라이드 | `자동 감지 / 한국어 / English / 日本語 / 中文` |
| `syncTrigger` | Select | ❌ 선택 | 동기화 트리거 방식 (3.9 참조) | `수동 / 앱 시작 시 / 인터벌` |
| `syncInterval` | Number | ❌ 선택 | 자동 동기화 인터벌 (분, 기본: 30) | `30` |

### 3.2 Jira API 통신

**우선순위:** 🔴 Must Have

#### 인증 방식
- **Jira Server / Data Center:** `Authorization: Bearer {token}`
- **Jira Cloud:** `Authorization: Basic base64(email:apiToken)` (v0.4에서 추가)

#### API 호출 흐름

```
[Jira Weaver Plugin]
     │
     ├─► GET /rest/api/2/field
     │       커스텀 필드 목록 조회 (Field Mapping UI용)
     │
     └─► POST /rest/api/2/search
             body: { jql, maxResults, fields: [활성화 필드 ID 목록] }
                  │
                  ▼
             FieldMapping 규칙 적용
             → Frontmatter 구조화 (전체 Jira 데이터)
             → 위키링크 변환 규칙 적용
             → 파일 구역 분리 (Jira 구역 / 메모 구역)
             → i18n 텍스트 적용
                  │
                  ▼
             .md 파일 생성 / 업데이트 (메모 보호)
```

#### 오류 처리

| 오류 상황 | 처리 방식 |
|---|---|
| 네트워크 연결 실패 | `t('error.network')` Notice 표시 |
| 401 Unauthorized | `t('error.auth')` Notice 표시 |
| 400 Bad Request (JQL) | `t('error.jql', { message })` Notice 표시 |
| 설정 미완료 | `t('error.settingsIncomplete')` Notice 표시 |

---

### 3.3 Frontmatter 구조화 및 강제 저장 규칙

**우선순위:** 🔴 Must Have

> **핵심 원칙:** 필드 매핑에서 활성화된 **모든** Jira 필드 데이터는 예외 없이 YAML Frontmatter 영역에 구조화된 속성값으로 저장되어야 한다. 이것이 Dataview를 통한 대시보드, 필터링, 집계가 작동하는 기술적 전제 조건이다.

#### 3.3.1 Frontmatter 강제 저장 규칙

- 필드 매핑에서 활성화(`isEnabled: true`)된 모든 필드는 **반드시** Frontmatter에 저장된다.
- `description` 필드는 유일한 예외로, 본문(Body) 구역에 삽입되며 Frontmatter에는 포함되지 않는다.
- Frontmatter는 항상 파일의 **최상단 첫 줄**부터 시작하는 YAML 블록(`---`으로 시작하고 `---`으로 닫힘)이어야 한다.
- Frontmatter 내 키 이름은 언어 설정과 무관하게 **영문 소문자 + 언더스코어** 형식으로 고정한다. (Dataview 쿼리 호환성 보장)
- 값이 `null`인 필드 처리 방식은 설정으로 선택 가능하다: `생략(기본값)` 또는 `null 명시`.

#### 3.3.2 Frontmatter 완성 예시

```yaml
---
jira_key: "MY-123"
title: "Fix login page crash"
status: "In Progress"
priority: "High"
type: "Bug"
assignee: "[[Alex Kim]]"
reporter: "[[Jamie Lee]]"
created: 2026-04-01
updated: 2026-05-09T14:30:00
due_date: 2026-05-15
labels:
  - frontend
  - critical
components:
  - "[[Authentication]]"
  - "[[UI]]"
fix_versions:
  - "v2.3.0"
jira_url: "https://mycompany.atlassian.net/browse/MY-123"
linked_issues:
  - "[[MY-100_Related_issue]]"
epic: "[[EPIC-42_Performance_Improvement]]"
sprint: "Sprint 42"
story_points: 5
deploy_env: "[[Production]]"
sla_tier: "P1"
---
```

#### 3.3.3 Dataview 호환성 보장 규칙

| 데이터 유형 | 저장 형식 | 예시 |
|---|---|---|
| 문자열 | 큰따옴표 감싸기 | `status: "In Progress"` |
| 날짜 | `YYYY-MM-DD` | `due_date: 2026-05-15` |
| 날짜+시간 | ISO 8601 | `updated: 2026-05-09T14:30:00` |
| 숫자 | 따옴표 없이 | `story_points: 5` |
| 불리언 | `true` / `false` | `is_blocked: true` |
| 단일 위키링크 | 큰따옴표 감싼 위키링크 | `assignee: "[[Alex Kim]]"` |
| 배열 | YAML 리스트 형식 | `labels:\n  - frontend` |
| 위키링크 배열 | 위키링크를 YAML 리스트로 | `components:\n  - "[[Auth]]"` |
| null/빈 값 | 키 생략 (기본) 또는 `null` 명시 | *(생략)* |

---

### 3.4 본문(Body) 구성, 위키링크 변환 및 온톨로지 설계

**우선순위:** 🔴 Must Have

#### 3.4.1 파일 전체 구조 (구역 분리 설계)

파일은 세 개의 구역으로 명확히 분리된다. 이 구조는 동기화 시 메모 보호의 기술적 기반이다.

```
┌─────────────────────────────────────────┐
│  [구역 A] YAML Frontmatter              │  ← 동기화 시 항상 덮어씀
│  ---                                    │
│  jira_key: "MY-123"                     │
│  status: "In Progress"                  │
│  ...                                    │
│  ---                                    │
├─────────────────────────────────────────┤
│  [구역 B] Jira 원본 콘텐츠              │  ← 동기화 시 항상 덮어씀
│                                         │
│  # MY-123: Fix login page crash         │
│  > View in Jira | Status | Priority     │
│  ## 📋 Description                      │
│  [이슈 description 내용]                │
│  ## 🔗 Related Info                     │
│  | Assignee | [[Alex Kim]] |            │
│  ...                                    │
│  <!-- jira-weaver:end -->               │  ← 구역 B 종료 마커
├─────────────────────────────────────────┤
│  [구역 C] 사용자 메모 (보호 구역)        │  ← 동기화 시 절대 덮어쓰지 않음
│                                         │
│  ## ✏️ 내 메모                           │
│  (사용자가 자유롭게 작성하는 공간)        │
│  - 디버깅 중 발견한 점: ...             │
│  - 관련 PR: [[PR-456]]                  │
└─────────────────────────────────────────┘
```

**구역 경계 마커:**
- 구역 B 종료 / 구역 C 시작의 경계는 HTML 주석 마커로 표시한다.
- 마커: `<!-- jira-weaver:end -->`
- 파일 최초 생성 시 마커 아래에 `## ✏️ My Notes` (언어 설정에 따라 다국어) 헤더와 빈 줄을 자동 삽입한다.
- 사용자가 마커를 임의로 삭제하면 구역 C 보호가 해제됨을 설정 탭에서 안내한다.

#### 3.4.2 본문 구역 B 렌더링 예시 (언어별)

**한국어 모드:**
```markdown
# MY-123: 로그인 페이지 크래시 수정

> **[Jira에서 보기](https://...)** | 상태: `진행 중` | 우선순위: `높음`

## 📋 설명

[이슈 description 내용]

## 🔗 연관 정보

| 항목 | 내용 |
|---|---|
| 담당자 | [[Alex Kim]] |
| 보고자 | [[Jamie Lee]] |
| 컴포넌트 | [[Authentication]], [[UI]] |
| 에픽 | [[EPIC-42_Performance_Improvement]] |
| 연결된 이슈 | [[MY-100_관련_이슈]] |

---
*최종 동기화: 2026-05-10 14:30:00*

<!-- jira-weaver:end -->
```

**영어 모드:**
```markdown
# MY-123: Fix login page crash

> **[View in Jira](https://...)** | Status: `In Progress` | Priority: `High`

## 📋 Description

[Issue description content]

## 🔗 Related Info

| Field | Value |
|---|---|
| Assignee | [[Alex Kim]] |
| Reporter | [[Jamie Lee]] |
| Components | [[Authentication]], [[UI]] |
| Epic | [[EPIC-42_Performance_Improvement]] |
| Linked Issues | [[MY-100_Related_issue]] |

---
*Last synced: 2026-05-10 14:30:00*

<!-- jira-weaver:end -->
```

#### 3.4.3 위키링크 자동 변환 규칙 (온톨로지 설계)

위키링크는 단순 텍스트 변환이 아니라, **Obsidian 내 지식 네트워크(온톨로지)를 자동 형성**하는 핵심 메커니즘이다. 아래 규칙을 따른다.

**기본 위키링크 변환 대상 (Default):**

| 필드 | 변환 전 (Jira 원본) | 변환 후 (Obsidian) | 생성되는 링크 노드 |
|---|---|---|---|
| 담당자 (`assignee`) | `"Alex Kim"` | `"[[Alex Kim]]"` | 담당자 인물 노드 |
| 보고자 (`reporter`) | `"Jamie Lee"` | `"[[Jamie Lee]]"` | 보고자 인물 노드 |
| 컴포넌트 (`components`) | `["Auth", "UI"]` | `["[[Auth]]", "[[UI]]"]` | 컴포넌트 시스템 노드 |
| 연결된 이슈 (`issuelinks`) | `"MY-100"` | `"[[MY-100_이슈제목]]"` | 연관 이슈 노드 |
| 에픽 (`epic`) | `"EPIC-42"` | `"[[EPIC-42_에픽제목]]"` | 에픽 계층 노드 |

**사용자 정의 위키링크 변환:**
- 필드 매핑 설정에서 `isWikiLink: true`로 설정된 모든 커스텀 필드에 적용된다.
- 예: `deploy_env` 필드의 값 `"Production"` → `"[[Production]]"` → Graph View에서 배포 환경 노드 형성

**위키링크 변환 규칙 상세:**

```
1. 단일 값 필드
   "Production" → "[[Production]]"

2. 배열 값 필드
   ["Auth", "UI"] → ["[[Auth]]", "[[UI]]"]

3. 이슈 키 연결 (issuelinks, epic)
   "MY-100" → 해당 이슈 파일명 조회 → "[[MY-100_이슈제목]]"
   (파일이 없으면 "[[MY-100]]" 로 fallback)

4. 사용자(User) 필드
   { displayName: "Alex Kim" } → "[[Alex Kim]]"

5. 위키링크 적용 제외 항목 (언어 무관 고정)
   - Frontmatter 키 이름
   - 파일명
   - 날짜/숫자/불리언 타입 필드
```

**온톨로지 효과 — Graph View에서 형성되는 지식 네트워크:**

```
[[Alex Kim]] ←──── MY-123 ────→ [[Authentication]]
                     │
                     ├──────→ [[EPIC-42_Performance]]
                     │
                     ├──────→ [[MY-100_Related_issue]]
                     │
                     └──────→ [[Production]]

결과: Alex Kim 노드를 클릭하면 그가 담당한 모든 이슈가 시각화됨
      Authentication 노드를 클릭하면 관련 모든 이슈와 팀원이 연결됨
```

---

### 3.5 파일 덮어쓰기 로직 및 사용자 메모 보호

**우선순위:** 🔴 Must Have

> **핵심 원칙:** Jira 이슈가 업데이트되어 동기화가 재실행될 때, 사용자가 구역 C(메모 보호 구역)에 작성한 모든 내용은 **절대 덮어쓰지 않는다.**

#### 3.5.1 동기화 판단 흐름

```
동기화 시작
    │
    ▼
이슈 키로 기존 파일 존재 여부 확인
    │
    ├─ [파일 없음]
    │       │
    │       ▼
    │   새 파일 생성
    │   - 구역 A (Frontmatter) 작성
    │   - 구역 B (Jira 원본 콘텐츠) 작성
    │   - 구역 B 종료 마커 삽입: <!-- jira-weaver:end -->
    │   - 구역 C 헤더 자동 삽입: ## ✏️ 내 메모 / ## ✏️ My Notes
    │   - 완료
    │
    └─ [파일 있음]
            │
            ▼
        Frontmatter의 updated 값과 Jira의 updated 비교
            │
            ├─ [Jira updated ≤ 로컬 updated] → 변경 없음, 스킵
            │
            └─ [Jira updated > 로컬 updated] → 업데이트 필요
                        │
                        ▼
                파일 내 <!-- jira-weaver:end --> 마커 탐색
                        │
                        ├─ [마커 있음]
                        │       │
                        │       ▼
                        │   구역 C 내용 메모리에 임시 저장
                        │   구역 A + 구역 B 를 새 Jira 데이터로 교체
                        │   마커 재삽입: <!-- jira-weaver:end -->
                        │   구역 C 내용 원위치 복원
                        │   완료 ✅
                        │
                        └─ [마커 없음 — 사용자가 삭제한 경우]
                                │
                                ▼
                            설정의 'noMarkerBehavior' 값에 따라 처리
                            ┌─ "skip"    → 파일 전체 스킵 + 경고 Notice
                            ├─ "append"  → 파일 끝에 Jira 데이터 추가 (기존 내용 보존)
                            └─ "overwrite" → 전체 파일 덮어쓰기 (기본값, 사용자 확인 후)
```

#### 3.5.2 마커 없음 처리 설정 (`noMarkerBehavior`)

설정 탭에서 선택 가능 (기본값: `overwrite`):

| 옵션 | 동작 | 권장 대상 |
|---|---|---|
| `overwrite` | 전체 파일 덮어쓰기 (메모 손실 가능, 경고 Notice 표시) | 기본값 |
| `skip` | 해당 파일 동기화 건너뜀 + 경고 목록 표시 | 메모 보호 최우선 사용자 |
| `append` | 파일 맨 끝에 최신 Jira 데이터 블록 추가 | 히스토리 보존 선호 사용자 |

#### 3.5.3 강제 동기화(Force Sync) 시 메모 보호

`Force Sync Issues (Overwrite All)` 커맨드 실행 시에도 구역 C 보호는 **동일하게 적용**된다. "Force"의 의미는 `updated` 시간 비교를 건너뛰고 모든 이슈를 재동기화하는 것이지, 사용자 메모를 삭제하는 것이 아니다.

#### 3.5.4 동기화 결과 요약 Notice

```
# 한국어
✅ Jira Weaver 동기화 완료
- 신규 생성: 5건  /  업데이트: 3건  /  스킵: 42건  /  오류: 0건
⚠️ 마커 없음(메모 보호 불가) 경고: 2건 → [파일 목록 보기]

# 영어
✅ Jira Weaver sync complete
- Created: 5  /  Updated: 3  /  Skipped: 42  /  Errors: 0
⚠️ No marker (memo protection unavailable): 2 files → [View list]
```

---

### 3.6 커맨드 팔레트 등록

**우선순위:** 🔴 Must Have

커맨드 이름은 영어 고정 (Obsidian 커맨드 팔레트 검색 일관성 유지).

| 커맨드 이름 | 동작 |
|---|---|
| `Jira Weaver: Sync Issues` | 증분 동기화 (메모 보호 포함) |
| `Jira Weaver: Force Sync Issues (Overwrite All)` | updated 비교 생략, 전체 재동기화 (메모 보호 포함) |
| `Jira Weaver: Reload Field List` | Jira 필드 목록 재조회 |

---

### 3.7 필드 매핑 시스템 (Field Mapping System)

**우선순위:** 🔴 Must Have

#### 3.7.1 Field Mapping 패널 구조 (듀얼 패널)

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️ Field Mapping                          [Reload Fields ↺] │
├─────────────────────┬───────────────────────────────────────┤
│  📋 Available Fields│  🗂️ Active Mappings                    │
│                     │                                       │
│  🔍 [검색창______]  │  ≡  summary   →  title        [편집]  │
│                     │  ≡  status    →  status        [편집]  │
│  — System Fields —  │  ≡  assignee  →  assignee 🔗  [편집]  │
│  ☑ summary          │  ≡  customfield_10016                  │
│  ☑ status           │     → sprint                  [편집]  │
│  ☐ reporter         │                                       │
│                     │  [+ Add Custom Field Manually]        │
│  — Custom Fields —  │                                       │
│  ☑ customfield_10016│  🔗 = 위키링크 변환 활성화 표시        │
│    (Sprint)         │                                       │
└─────────────────────┴───────────────────────────────────────┘
```

#### 3.7.2 필드 상세 설정 모달

```
┌─────────────────────────────────────────────────────┐
│  Field Settings: customfield_10016 (Sprint)         │
├─────────────────────────────────────────────────────┤
│  【1】 Obsidian Key  : [ sprint             ]       │
│  【2】 Value Type    : ◉text ○number ○date ...      │
│  【3】 Wiki Link     : □ [[위키링크]]로 감싸기        │
│  【4】 JSON Path     : ○자동 ◉수동: [fields.sprint[0].name] │
│                                                     │
│  미리보기: sprint: "Sprint 42"                       │
│                       [취소]  [저장]                 │
└─────────────────────────────────────────────────────┘
```

#### 3.7.3 필드 매핑 데이터 타입

```typescript
type FieldValueType =
  | "text" | "number" | "date" | "datetime"
  | "boolean" | "array" | "user" | "user_array";

interface FieldMapping {
  jiraFieldId: string;      // "customfield_10016"
  jiraFieldName: string;    // "Sprint"
  obsidianKey: string;      // "sprint"
  valueType: FieldValueType;
  isWikiLink: boolean;
  jsonPath: string | null;  // null = 자동 추출
  isEnabled: boolean;
  order: number;
}

type NoMarkerBehavior = "overwrite" | "skip" | "append";

interface JiraPluginSettings {
  jiraDomain: string;
  personalAccessToken: string;
  targetFolder: string;
  jqlQuery: string;
  maxResults: number;
  language: "auto" | "en" | "ko" | "ja" | "zh";
  syncTrigger: "manual" | "onStartup" | "interval";
  syncInterval: number;
  noMarkerBehavior: NoMarkerBehavior;
  nullFieldBehavior: "omit" | "explicit";
  fieldMappings: FieldMapping[];
}
```

#### 3.7.4 기본 제공 필드 매핑 (Default Mappings)

| 순서 | Jira Field ID | Obsidian Key | Value Type | 위키링크 | 비고 |
|---|---|---|---|---|---|
| 1 | `summary` | `title` | `text` | ❌ | 파일명에도 사용 |
| 2 | `issuetype.name` | `type` | `text` | ❌ | |
| 3 | `status.name` | `status` | `text` | ❌ | |
| 4 | `priority.name` | `priority` | `text` | ❌ | |
| 5 | `assignee` | `assignee` | `user` | ✅ | 기본 위키링크 |
| 6 | `reporter` | `reporter` | `user` | ✅ | 기본 위키링크 |
| 7 | `created` | `created` | `date` | ❌ | |
| 8 | `updated` | `updated` | `datetime` | ❌ | 덮어쓰기 비교 기준 |
| 9 | `duedate` | `due_date` | `date` | ❌ | |
| 10 | `labels` | `labels` | `array` | ❌ | |
| 11 | `components` | `components` | `array` | ✅ | 기본 위키링크 |
| 12 | `fixVersions` | `fix_versions` | `array` | ❌ | |
| 13 | `issuelinks` | `linked_issues` | `array` | ✅ | 기본 위키링크 |
| 14 | `epic` | `epic` | `text` | ✅ | 기본 위키링크 |
| 15 | `description` | *(본문 구역 B 삽입)* | `text` | ❌ | Frontmatter 제외 |

#### 3.7.5 값 변환 파이프라인

```
raw JSON
  → [1] JSON Path 추출
  → [2] ValueType 변환 (날짜 포맷, 숫자 파싱 등)
  → [3] isWikiLink 적용
  → [4] YAML 직렬화 (Dataview 호환 형식)
  → Frontmatter 키-값 쌍 완성
```

#### 3.7.6 예외 처리

| 상황 | 처리 방식 |
|---|---|
| 필드 값 `null` | `nullFieldBehavior` 설정에 따라 생략 또는 `null` 명시 |
| JSON Path 오류 | 건너뜀 + 콘솔 경고 |
| `obsidianKey` 중복 | 저장 시 유효성 검사로 차단 |
| 커스텀 필드 Jira에서 삭제됨 | 기존 매핑 유지 + ⚠️ 경고 뱃지 |
| 알 수 없는 객체 타입 | JSON 문자열 fallback |

---

### 3.8 다국어(i18n) 지원 시스템

**우선순위:** 🔴 Must Have

#### 3.8.1 다국어 적용 범위

| 범주 | 적용 대상 |
|---|---|
| **A. 플러그인 UI** | 설정 탭 레이블, 버튼, 섹션 제목, 툴팁, 플레이스홀더 |
| **B. 알림 메시지** | Notice 팝업, 오류 메시지, 동기화 결과 요약 |
| **C. 파일 본문** | .md 파일의 섹션 헤더, 테이블 라벨, 메타 텍스트, 메모 구역 헤더 |
| **D. 문서** | README.md (영어) + README.ko.md (한국어) |

**다국어 적용 제외 (언어 무관 고정):**

| 항목 | 이유 |
|---|---|
| Frontmatter 키 이름 | Dataview 쿼리 호환성 |
| 파일명 형식 | OS 호환성, 링크 안정성 |
| 위키링크 내부 텍스트 | 링크 대상 노드 일관성 |
| 커맨드 팔레트 커맨드 이름 | 커뮤니티 검색 일관성 |
| 구역 경계 마커 `<!-- jira-weaver:end -->` | 파서 안정성 |

#### 3.8.2 지원 언어

**초기 출시 (v0.1.0 ~):**

| 언어 코드 | 언어 | 파일명 | 상태 |
|---|---|---|---|
| `en` | English | `locales/en.json` | ✅ 기본값 (fallback) |
| `ko` | 한국어 | `locales/ko.json` | ✅ 초기 지원 |
| `ja` | 日本語 | `locales/ja.json` | ✅ 초기 지원 |
| `zh` | 中文(简体) | `locales/zh.json` | ✅ 초기 지원 |

**향후 추가 예정:**

| 언어 코드 | 언어 | 예정 버전 |
|---|---|---|
| `zh-TW` | 中文(繁體) | 커뮤니티 기여 시 |
| `de` | Deutsch | 커뮤니티 기여 시 |
| 기타 | 커뮤니티 기여 환영 | — |

#### 3.8.3 언어 감지 로직

```
플러그인 로드
    │
    ▼
settings.language 값 확인
    ├─ "ko" / "en" / "ja" / "zh" → 해당 언어 사용
    └─ "auto" → Obsidian 앱 언어 감지
                    ├─ "ko" → ko.json
                    ├─ "en" → en.json
                    └─ 미지원 언어 → en.json (fallback)
```

#### 3.8.4 번역 파일 구조

번역 파일(`locales/*.json`)의 실제 내용(키-값 쌍)은 **구현 단계에서 Claude가 소스코드 컨텍스트를 참조하여 직접 작성**한다. PRD에는 구조 규칙만 정의한다.

**네임스페이스 구조 (키 계층):**

| 네임스페이스 | 포함 내용 |
|---|---|
| `settings.*` | 설정 탭의 모든 레이블, 설명, 플레이스홀더, 버튼 텍스트 |
| `notice.*` | 동기화 결과, 진행 중, 성공/실패 Notice 메시지 |
| `error.*` | 네트워크, 인증, JQL, 파일 쓰기 등 오류 메시지 |
| `file.*` | .md 파일 본문의 섹션 헤더, 테이블 라벨, 메타 텍스트 |

**변수 치환 규칙:**
- 패턴: `{{변수명}}` (Mustache 스타일)
- 예: `"Created: {{created}}"` + `{ created: 5 }` → `"Created: 5"`
- 미정의 변수는 `{{변수명}}` 그대로 출력 (디버깅 용이)

**언어별 파일 및 담당:**

| 파일 | 언어 | 작성 방식 |
|---|---|---|
| `locales/en.json` | English | 구현 시 Claude 작성 (기본 fallback) |
| `locales/ko.json` | 한국어 | 구현 시 Claude 작성 |
| `locales/ja.json` | 日本語 | 구현 시 Claude 작성 |
| `locales/zh.json` | 中文(简体) | 구현 시 Claude 작성 |

**Fallback 규칙:**
- 현재 언어 파일에 키가 없으면 → `en.json` fallback
- `en.json`에도 없으면 → 키 이름 그대로 출력

#### 3.8.5 i18n 모듈 설계

```typescript
type SupportedLocale = "en" | "ko" | "ja" | "zh";

class I18n {
  load(locale: SupportedLocale): void;
  t(key: string, vars?: Record<string, string | number>): string;
  getCurrentLocale(): SupportedLocale;
  // 키 없음 → en.json fallback → 키 이름 그대로 출력
}

export const i18n = new I18n();
export const t = i18n.t.bind(i18n);
```

- 외부 i18n 라이브러리 미사용 (번들 크기 최소화)
- 변수 치환: `{{key}}` 패턴 (Mustache 스타일)
- 번역 파일은 빌드 번들에 정적 포함 (런타임 fetch 미사용)

---

### 3.9 동기화 트리거 정의

**우선순위:** 🔴 Must Have

> **핵심 원칙:** 사용자의 작업 패턴(온라인/오프라인, 실시간 vs 배치)에 맞게 동기화 시점을 선택할 수 있어야 한다. 모든 트리거 방식은 동일한 동기화 로직(3.5)과 메모 보호 로직을 사용한다.

#### 3.9.1 트리거 방식 정의

| 트리거 | 설정값 | 동작 | 권장 대상 |
|---|---|---|---|
| **수동** | `manual` | 커맨드 팔레트로만 실행 | 온라인/오프라인 혼용, 동기화 시점 직접 제어 선호 |
| **앱 시작 시** | `onStartup` | Obsidian 앱 로드 완료 후 1회 자동 실행 | 항상 최신 상태로 시작하길 원하는 사용자 |
| **인터벌** | `interval` | 설정한 분 주기로 백그라운드 자동 실행 | 실시간에 가까운 동기화가 필요한 PM/팀 리더 |

#### 3.9.2 각 트리거 상세 동작

**수동 (`manual`, 기본값):**

```
사용자: Ctrl+P → "Jira Weaver: Sync Issues"
    │
    ▼
동기화 로직 실행 (3.5)
    │
    ▼
완료 Notice 표시
```

**앱 시작 시 (`onStartup`):**

```
Obsidian 앱 로드
    │
    ▼
plugin.onload() 실행
    │
    ▼
네트워크 연결 확인
    ├─ [연결됨] → 동기화 로직 실행 → 완료 Notice
    └─ [연결 안 됨] → 조용히 건너뜀 (Notice 미표시, 콘솔 로그만)
```

**인터벌 (`interval`):**

```
plugin.onload()
    │
    ▼
setInterval(syncFn, syncInterval * 60 * 1000) 등록
    │
    ▼ (매 N분마다)
네트워크 연결 확인
    ├─ [연결됨] → 동기화 로직 실행 → 상태바 업데이트
    └─ [연결 안 됨] → 건너뜀, 다음 인터벌에 재시도

plugin.onunload()
    │
    ▼
clearInterval() 등록 해제
```

#### 3.9.3 동기화 상태 표시 (Status Bar)

`onStartup` 또는 `interval` 트리거 사용 시 Obsidian 하단 상태바에 마지막 동기화 시각 표시:

```
Jira Weaver: Last synced 14:30  (수동 클릭 시 즉시 동기화 실행)
Jira Weaver: Syncing...         (동기화 진행 중)
Jira Weaver: ❌ Sync failed     (오류 발생 시, 클릭 시 재시도)
```

#### 3.9.4 트리거 관련 엣지 케이스

| 상황 | 처리 방식 |
|---|---|
| 인터벌 동기화 중 수동 동기화 요청 | 진행 중인 동기화 완료 후 새 요청 실행 (동시 실행 방지 Lock) |
| 앱 시작 시 설정 미완료 | 동기화 건너뜀, 설정 완료 안내 Notice 1회 표시 |
| 오프라인 상태에서 인터벌 트리거 | 조용히 건너뜀, 온라인 복귀 시 다음 인터벌에 자동 재시도 |
| 동기화 실행 중 앱 종료 | 진행 중이던 파일까지만 저장, 미완료 파일은 다음 동기화 때 처리 |

---

## 4. 비기능 요구사항 (Non-Functional Requirements)

### 4.1 성능

| 항목 | 목표 |
|---|---|
| 50건 이슈 동기화 소요 시간 | 10초 이내 |
| 100건 이슈 동기화 소요 시간 | 20초 이내 |
| 필드 목록 조회 소요 시간 | 3초 이내 |
| i18n 번역 파일 로드 오버헤드 | 50ms 미만 |
| Obsidian UI 블로킹 | 금지 (모든 작업 비동기 처리) |

### 4.2 보안

- PAT는 `loadData()` / `saveData()`로 플러그인 데이터 파일에 저장 (Vault 외부)
- 로그에 PAT 노출 금지
- HTTPS 통신만 허용 (HTTP URL 입력 시 경고)

### 4.3 안정성

- Jira API 응답 실패 시 기존 로컬 파일 유지
- 동기화 도중 오류 발생 시 해당 이슈만 건너뛰고 나머지 진행
- 필드 매핑 설정 오류 시에도 핵심 필드(`jira_key`, `title`, `status`)는 항상 동기화 보장
- i18n 키 누락 시 fallback 처리로 동작 중단 방지
- 메모 보호 구역(구역 C) 처리 실패 시 **파일 전체 쓰기를 중단**하고 오류 보고 (메모 손실 방지 최우선)

### 4.4 호환성

| 항목 | 요구사항 |
|---|---|
| Obsidian 최소 버전 | `1.4.0` 이상 |
| Jira 버전 | Server 8.x, Data Center 9.x 이상 / Cloud |
| 사용 Obsidian API | `FileSystemAdapter`, `requestUrl`, `Plugin`, `PluginSettingTab`, `Modal` |
| Dataview 플러그인 | 호환 (미설치 시에도 정상 동작) |
| 언어 코드 기준 | BCP 47 / ISO 639-1 |

---

## 5. 기술 아키텍처 (Technical Architecture)

### 5.1 파일 구조

```
obsidian-jira-weaver/
├── src/
│   ├── main.ts               # 플러그인 진입점, 커맨드 등록, 트리거 초기화
│   ├── settings.ts           # 연결 정보 + 트리거 + 메모 보호 설정 UI
│   ├── fieldMappingTab.ts    # Available Fields / Active Mappings 패널 UI
│   ├── fieldMappingModal.ts  # 필드 상세 설정 모달
│   ├── jiraClient.ts         # Jira REST API 통신
│   ├── fieldResolver.ts      # JSON Path 추출 + ValueType 변환 파이프라인
│   ├── fileManager.ts        # Vault 파일 CRUD, 구역 파서, 메모 보호 로직
│   ├── markdownBuilder.ts    # 동적 Frontmatter + 구역 B 생성, 마커 삽입
│   ├── syncScheduler.ts      # 동기화 트리거 관리 (수동/시작/인터벌) ← NEW
│   ├── wikiLinkResolver.ts   # 위키링크 변환 규칙 엔진 ← NEW
│   ├── i18n.ts               # 다국어 지원 모듈
│   └── types.ts              # 공유 타입 정의
├── locales/
│   ├── en.json               # 영어 번역 (기본 fallback)
│   ├── ko.json               # 한국어 번역
│   ├── ja.json               # 일본어 번역
│   └── zh.json               # 중국어 간체 번역
├── scripts/
│   └── check-i18n.ts         # 번역 키 누락 검증
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── README.md
├── README.ko.md
└── CONTRIBUTING.md
```

### 5.2 핵심 모듈 책임

| 모듈 | 책임 |
|---|---|
| `main.ts` | 플러그인 생명주기, 커맨드 등록, i18n 초기화, syncScheduler 초기화 |
| `settings.ts` | 전체 설정 UI (연결/필드/언어/트리거/메모보호 옵션) |
| `fieldMappingTab.ts` | 듀얼 패널 UI, 체크박스 토글, 드래그앤드롭 |
| `fieldMappingModal.ts` | 필드 Key/Type/위키링크/JSONPath 설정 모달 |
| `jiraClient.ts` | 인증 헤더, `/field` 조회, `/search` 조회, 오류 처리 |
| `fieldResolver.ts` | JSON Path 추출, ValueType 변환, YAML 직렬화 |
| `fileManager.ts` | 파일 존재 확인, **구역 파서** (A/B/C 분리), 메모 보호 로직, 파일 쓰기 |
| `markdownBuilder.ts` | Frontmatter 문자열 생성, 구역 B 마크다운 생성, `<!-- jira-weaver:end -->` 마커 삽입 |
| `syncScheduler.ts` | `manual` / `onStartup` / `interval` 트리거 관리, 동시 실행 방지 Lock |
| `wikiLinkResolver.ts` | 필드 타입별 위키링크 변환 규칙, 이슈 키 → 파일명 조회, fallback 처리 |
| `i18n.ts` | 번역 로드, `t()` 함수, 언어 감지, fallback |
| `types.ts` | `FieldMapping`, `JiraPluginSettings`, `SyncTrigger`, `NoMarkerBehavior` 등 |

### 5.3 주요 의존성

| 패키지 | 용도 |
|---|---|
| `obsidian` | Obsidian Plugin API (peer dependency) |
| `esbuild` | 번들링 |
| `@types/node` | Node.js 타입 |
| `typescript` | TypeScript 컴파일러 |

---

## 6. 사용자 경험 (UX) 시나리오

### 시나리오 1: Alex — 개인 메모 보호

1. `MY-123_Fix_login_page_crash.md` 파일에서 `<!-- jira-weaver:end -->` 아래 메모 작성
   ```
   ## ✏️ 내 메모
   - 재현 조건: Chrome 120+ + 로그인 세션 만료 동시 발생
   - 관련 PR: [[PR-456_session_fix]]
   ```
2. Jira에서 이슈 상태가 `In Progress → Review`로 변경
3. `Sync Issues` 실행 → Frontmatter의 `status: "Review"` 업데이트
4. **"내 메모" 구역은 그대로 보존** ✅

### 시나리오 2: Jamie — Dataview 대시보드

```dataview
TABLE status, priority, assignee, story_points, sprint, due_date
FROM "Jira/Issues"
WHERE sprint = "Sprint 42" AND status != "Done"
SORT story_points DESC
```
모든 Jira 필드가 Frontmatter에 구조화되어 있으므로 쿼리가 완벽히 작동.

### 시나리오 3: Sam — Graph View 온톨로지

`deploy_env: "[[Production]]"` + `assignee: "[[Alex Kim]]"` + `components: ["[[Auth]]"]`
→ Graph View에서 Production 환경 이슈 전체, Alex 담당 이슈 전체, Auth 컴포넌트 관련 이슈 전체를 클릭 한 번으로 시각화

### 시나리오 4: 인터벌 동기화 사용자

1. 설정: 트리거 = `인터벌`, 주기 = `15분`
2. Obsidian 열어두고 작업 중 → 15분마다 자동 동기화
3. 상태바: `Jira Weaver: Last synced 14:30`
4. 오프라인 전환 → 동기화 조용히 건너뜀, 온라인 복귀 후 다음 인터벌에 자동 재시도

---

## 7. 마일스톤 (Roadmap)

### v0.1.0 — MVP
- [x] 연결 정보 설정 탭
- [x] JQL 기반 이슈 동기화
- [x] 기본 Frontmatter + Body 생성
- [x] 위키링크 변환 (담당자, 컴포넌트, 연결 이슈)
- [x] Incremental sync (updated 비교)
- [x] 커맨드 팔레트 등록 (수동 트리거)

### v0.2.0 — 필드 매핑 시스템
- [x] 커스텀 필드 자동 탐지
- [x] Available/Active 듀얼 패널 UI
- [x] 필드 상세 설정 모달
- [x] JSON Path 변환 파이프라인

### v0.3.0 — 다국어 지원
- [x] i18n 모듈 + en/ko/ja/zh 번역 파일 (4개 언어 동시 출시)
- [x] Obsidian 앱 언어 자동 감지 + 수동 오버라이드
- [x] UI/Notice/파일 본문 전체 다국어 적용
- [x] README.md + README.ko.md

### v0.4.0 — 안정성 강화 ← **현재 설계 범위**
- [x] Frontmatter 강제 저장 규칙 및 Dataview 호환성 명확화
- [x] 파일 3구역 분리 설계 (A: Frontmatter / B: Jira 콘텐츠 / C: 메모 보호)
- [x] `<!-- jira-weaver:end -->` 마커 기반 메모 보호 로직
- [x] `noMarkerBehavior` 옵션 (overwrite / skip / append)
- [x] 위키링크 온톨로지 설계 (에픽 포함, 변환 규칙 상세화)
- [x] `wikiLinkResolver.ts` 모듈 분리
- [x] 동기화 트리거 3종 정의 (manual / onStartup / interval)
- [x] `syncScheduler.ts` 모듈 및 동시 실행 방지 Lock
- [x] 상태바 동기화 상태 표시
- [x] 트리거 엣지 케이스 처리 (오프라인, 동시 실행 등)

### v0.5.0 — 고급 기능
- [x] Jira Cloud Basic Auth 지원
- [x] 여러 JQL 프로파일 지원
- [x] 동기화 로그 뷰(View) 패널
- [x] 필드 매핑 프리셋 내보내기/가져오기
- [ ] 커뮤니티 번역 기여 추가 언어 (zh-TW, de 등)

### v1.0.0 — 커뮤니티 등록
- [ ] Obsidian Community Plugin 심사 통과
- [ ] 양방향 동기화 검토

---

## 8. 성공 지표 (Success Metrics)

| 지표 | 목표 (출시 3개월 후) |
|---|---|
| GitHub Stars | 100+ |
| 주간 활성 설치 수 | 500+ |
| 사용자 보고 버그 | 월 3건 이하 |
| 커뮤니티 플러그인 등록 | v1.0.0 내 완료 |
| 지원 언어 수 | 출시 시 4개 (en/ko/ja/zh), v0.5.0 이후 커뮤니티 기여로 확장 |
| 메모 손실 관련 버그 보고 | **0건** (절대 목표) |

---

## 9. 부록

### 9.1 Dataview 활용 예시 쿼리

```dataview
TABLE status, priority, assignee, story_points, sprint, due_date
FROM "Jira/Issues"
WHERE sprint = "Sprint 42" AND status != "Done"
SORT story_points DESC
```

```dataview
TABLE length(rows) AS "이슈 수", sum(rows.story_points) AS "총 SP"
FROM "Jira/Issues"
GROUP BY deploy_env
```

### 9.2 파일 구역 분리 — 파서 구현 가이드 (개발자 참고)

`fileManager.ts`의 구역 파서는 다음 순서로 파일을 분석한다:

```
1. 파일 전체 읽기
2. 정규식으로 Frontmatter 추출: /^---\n([\s\S]*?)\n---/
3. 문자열 탐색으로 마커 위치 확인: indexOf('<!-- jira-weaver:end -->')
4. 마커 위치 기준으로 구역 B와 구역 C 분리
5. 구역 C 내용을 변수에 임시 저장
6. 구역 A + 구역 B 새 내용으로 교체
7. 마커 재삽입
8. 구역 C 내용 복원
9. 파일 저장
```

### 9.3 참고 문서

- [Obsidian Plugin API 공식 문서](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Jira REST API v2 — Field 목록 조회](https://developer.atlassian.com/server/jira/platform/rest/v10000/api-group-issue-fields/#api-rest-api-2-field-get)
- [Jira REST API v2 — Issue 검색](https://developer.atlassian.com/server/jira/platform/rest/v10000/api-group-issue-search/#api-rest-api-2-search-post)
- [Obsidian Community Plugin 심사 가이드](https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md)
- [Dataview 플러그인 문서](https://blacksmithgu.github.io/obsidian-dataview/)
- [BCP 47 언어 태그 표준](https://www.rfc-editor.org/rfc/rfc5646)
