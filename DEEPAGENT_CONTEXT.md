# DeepAgent × QuickDapp Integration — Full Context

> **이 파일은 로컬 전용입니다. `.gitignore`에 등록되어 있으므로 커밋되지 않습니다.**
>
> **AI에게**: 새 채팅 세션을 시작할 때 이 파일을 먼저 읽고 시작하세요. 작업 진행 시 이 파일을 업데이트하세요. 새로운 결정, 대화, 코드 변경이 있을 때마다 해당 섹션을 갱신하세요.
>
> **AI에게 — 작업 시작 전 필수 절차**:
> 1. `git fetch origin lanchain_deepagent` 실행하여 스테판의 최신 코드를 가져온다.
> 2. `git log <현재 base commit>..origin/lanchain_deepagent --oneline --stat`으로 새 커밋을 분석한다.
> 3. HITL/DeepAgent 관련 파일(`remixAIPlugin.tsx`, `libs/remix-ai-core/src/inferencers/deepagent/`, `libs/remix-ui/remix-ai-assistant/`)에 변경이 있는지 확인한다.
> 4. 변경이 있으면 내용과 의도를 파악하고, 충돌 가능성을 보고한다.
> 5. 필요시 rebase를 제안한다.
> 이 절차를 거쳐야 항상 최신 상태에서 작업을 시작할 수 있다.

---

## 1. 프로젝트 개요

Remix IDE의 AI 시스템을 LangChain DeepAgent 기반으로 업그레이드하는 프로젝트.
스테판(STetsing)이 주도하며, 수영(hsy822)은 QuickDapp 담당 + UI 관련 작업을 맡음.

---

## 2. 브랜치 구조

```
master
  ├── lanchain_deepagent (스테판, PR #7028, WIP 라벨)
  │     ├── poc/quickdapp-deepagent (수영, PR 없음 — 브랜치만 push)
  │     │     → 1 commit: "add QuickDapp MCP tools for DeepAgent integration"
  │     │     → ⚠️ POC 전용. 랭체인 도입 초기에 QuickDapp 담당자로서 MCP 도구 연동 방식을
  │     │        탐색하기 위해 만든 실험 브랜치. 중요도 낮음. 나중에 remix-ai 중심부 구현
  │     │        완료 후 이 코드를 참고하여 본 작업 진행 예정.
  │     │
  │     └── feature/deepagent-human-in-the-loop (수영, 현재 작업 브랜치)
  │           → Human in the Loop 구현
  │
  └── feature/remix-ai-quickdapp-integration (수영, 이전 작업 — 폐기됨)
```

### 브랜치 규칙 (스테판과 합의)
- DeepAgent 관련 모든 PR은 `lanchain_deepagent` 브랜치를 target으로 한다 (master 아님)
- 스테판이 리뷰 후 머지

---

## 3. 스테판의 노션 로드맵 — 5개 영역

### 3-1. Add Subagents
**목표**: 전문 서브에이전트(Security Auditor, Code Reviewer, Gas Optimizer)를 병렬로 생성/실행

**Acceptance Criteria:**
- [ ] 최소 3개 서브에이전트 (Security, Code Review, Gas) 정상 spawn
- [ ] 가능한 경우 병렬 실행
- [ ] 결과를 하나의 coherent report로 집계
- [ ] 모든 라이프사이클 단계에 이벤트 발생
- [ ] 서브에이전트 실패 시 메인 에이전트로 폴백
- [ ] 타임아웃으로 무한 실행 방지

**현재 상태**: 프롬프트 정의만 됨 (`SECURITY_AUDITOR_SUBAGENT_PROMPT`, `CODE_REVIEWER_SUBAGENT_PROMPT`)
**담당**: 스테판

### 3-2. Planning & Task Decomposition
**목표**: 복잡한 프롬프트를 자동으로 3-10개 태스크로 분해, 의존성 그래프 관리

**AC:**
- [ ] 계획 생성 및 관리
- [ ] 계획 검증 로직
- [ ] 태스크 순서를 위한 의존성 그래프
- [ ] LLM을 사용해 복잡한 프롬프트를 태스크로 분해
- [ ] 태스크 간 관계 구축
- [ ] 가능하면 서브에이전트에 태스크 할당

**현재 상태**: 타입 정의만 됨 (`IDeepAgentPlan`, `IDeepAgentTodo`)
**담당**: 스테판

### 3-3. Human in the Loop ⭐ (수영 담당, 구현 진행 중)
**목표**: 위험한 도구 실행 전 사용자 승인 UI

**AC:**
- [x] 모든 파일 쓰기에 사용자 승인 필요
- [x] Diff 뷰어 (before/after) — 인라인 방식
- [x] 인라인 편집
- [ ] 도구 실행 정책 설정 UI (자동/수동/위험한 것만) — 로직은 구현됨, UI 미구현
- [ ] UI 백업 액션 (취소/롤백) — 취소는 구현, 롤백은 미구현

**현재 구현 상태**: 섹션 12 참조

### 3-4. Context Management
**목표**: 토큰 효율적 메모리 관리, 시각화

**AC:**
- [ ] 토큰 카운팅
- [ ] 자동 요약/pruning
- [ ] 메모리 시각화
- [ ] 토큰 사용량 표시
- [ ] 컨텍스트 길이 초과 시 graceful handling
- [ ] 메모리 초기화 기능

**현재 상태**: IndexedDB 기반 `DeepAgentMemoryBackend` 존재 (토큰 관련 기능 없음)
**담당**: 미정 (백엔드는 스테판, 시각화 UI는 수영 가능)

### 3-5. DeepAgent React UI ⭐ (수영, 구현 진행 중)
**목표**: DeepAgent 전용 React 컴포넌트

**AC:**
- [x] 도구 호출 카드 (Tool Call Card) — `ToolCallCard.tsx`
- [x] 에이전트 상태 패널 (실행중/대기/완료) — `AgentStatusBar.tsx`
- [x] Thinking 지원 — `ThinkingBubble.tsx`
- [x] 서브에이전트 상태 표시 — `SubagentPanel.tsx`
- [ ] 태스크 의존성 시각화 — `TaskVisualizerPanel.tsx` (미구현)
- [ ] 실시간 스트리밍 UI (Phase 6 채팅 리뉴얼)
- [ ] 에러 상태 표시

**현재 상태**: AC 4개 완료 (Phase 0~4). 섹션 20 참조
**담당**: 수영

---

## 4. 현재 구현 상태 (PR #7028 + #7030)

### 스테판의 구현 (PR #7028, lanchain_deepagent)

| 파일 | 줄 수 | 역할 |
|------|------|------|
| `DeepAgentInferencer.ts` | 561 | LangChain Agent 래퍼, Claude Sonnet 4.5, 스트리밍 |
| `RemixToolAdapter.ts` | 326 | MCP 도구 → LangChain `DynamicStructuredTool` 변환 |
| `RemixFilesystemBackend.ts` | 345 | Remix FileManager 브릿지 (read/write/edit/ls) |
| `DeepAgentPrompts.ts` | 441 | 시스템 프롬프트 (메인 + 서브에이전트) |
| `DeepAgentMemoryBackend.ts` | 283 | IndexedDB 영속 메모리 |
| `deepagent.ts` (types) | 88 | 타입 정의 (config, plan, todo, subagent, error) |
| `remixAIPlugin.tsx` | +213 | 3-tier 라우팅 (DeepAgent → MCP → Remote) |

**3-tier 폴백 라우팅:**
```typescript
if (deepAgentEnabled && deepAgentInferencer) → DeepAgent (Claude Sonnet 4.5)
else if (mcpEnabled && mcpInferencer) → MCPInferencer (기존)
else → RemoteInferencer (기존)
```

**프록시 서버**: 별도 레포 (remix-langchain-proxyserver), localhost:4000
**모델**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) 고정
**신규 의존성**: `@langchain/anthropic`, `@langchain/core`, `@langchain/langgraph`, `deepagents`, `langchain`
**삭제**: `xstate` (Nudge 시스템과 함께)

### 수영의 POC (poc/quickdapp-deepagent, PR 없음)

> ⚠️ **낮은 우선순위**. 랭체인 도입 초기에 QuickDapp 담당자로서 MCP 도구가 DeepAgent와
> 어떻게 연동되는지 탐색하기 위한 실험 브랜치. remix-ai 중심부(HITL, Subagents 등)
> 구현이 끝난 후 이 코드를 참고하여 본격 작업 예정.

| 파일 | 유형 | 역할 |
|------|------|------|
| `DappHandler.ts` | 신규 | MCP 도구 6종 정의 (dapp_create/update/list/open/get_status/navigate) |
| `dapp-system-prompt.ts` | 신규 | DApp 관리 AI 지침 (115줄) |
| `RemixMCPServer.ts` | 수정 | DApp 도구 등록 + 권한 매핑 |
| `mcpTools.ts` | 수정 | `DAPP` enum 추가 |
| `quick-dapp-v2.tsx` (plugin) | 수정 | `listDapps`, `getDappStatus`, `getDappFiles` 메서드 추가 |
| `index.ts` | 수정 | `DappManager` export 추가 |

**핵심 원칙**: `remixAIPlugin.tsx`와 스테판의 DeepAgent 코드는 일절 수정하지 않음.
MCP 도구를 등록하면 `RemixToolAdapter`가 자동으로 LangChain으로 변환.

---

## 5. 기존 브랜치 (feature/remix-ai-quickdapp-integration)와의 관계

### 재활용된 것
- `DappHandler.ts` — 그대로 포팅
- `dapp-system-prompt.ts` — 그대로 포팅
- `QuickDappV2 Plugin API 확장` — 그대로 포팅

### 폐기된 것
- `DappAgent` (키워드 매칭 + enrichPrompt) — DeepAgent가 LLM 기반 도구 선택으로 대체
- `remixAIPlugin.tsx` 이벤트/MCP 인증 변경 — 스테판 버전과 충돌, 스테판 버전이 정본

### 충돌했던 이유
- 기존 브랜치에서 `refreshMCPServersOnAuthChange()` 등을 삭제했으나, 스테판은 유지+확장
- 기존 브랜치에서 이벤트 emit을 삭제했으나, 스테판도 독립적으로 같은 삭제를 함
- → 머지 대신 새 브랜치에서 필요한 것만 깨끗하게 포팅하는 것이 안전

---

## 6. 스테판과의 대화 기록 (2026-04-13)

### 핵심 합의 사항
1. **모든 DeepAgent 관련 PR은 `lanchain_deepagent` 브랜치를 target** (master 아님)
2. **병렬 작업 후 머지** — 스테판과 수영이 각자 맡은 영역 작업 후 합침
3. **수영의 역할**: Human in the Loop (UI) → DeepAgent React UI 순서로 작업
4. **스테판의 역할**: Subagents, Planning, Context Management 등 백엔드 중심

### 스테판의 발언 요약
- QuickDapp은 "advanced feature of the workflow" — 이미 DeepAgent 워크플로우의 일부로 인식
- "DeepAgent stuff is really nasty" — 아직 master에 합칠 단계가 아님
- "you have a much more solid background on UI stuff" — UI 작업 추천
- React UI는 "one of the stuff that had to come towards the end" — 마지막 단계
- "adding sub agent or planning or human in the loop is something we might be doing now" — 이것들이 먼저

---

## 7. 미해결 사항

### 당장 해결 필요
- [x] **API 키**: Yann에게 새 키 요청 → 2026-04-13 대화 중 Yann이 제공 완료
- [x] **E2E 테스트**: write_file (Approve/Reject) 동작 확인 완료. edit_file도 동작 확인
- [x] **스테판에게 담당 영역 전달**: HITL + React UI 담당 DM 전달 완료 (2026-04-14)
- [x] **Human in the Loop 브랜치 생성**: `feature/deepagent-human-in-the-loop` 생성 완료

### 기술적 미확인
- [ ] DappHandler의 2-Phase 패턴이 DeepAgent 에이전트 루프와 호환되는지
- [ ] DApp 도구 description이 AI의 정확한 도구 선택을 유도하는지 (false positive/negative)
- [ ] `getDappFiles()`의 워크스페이스 전환 부작용이 DeepAgent의 다른 도구와 충돌하는지

### 장기적 결정 필요
- [ ] DeepAgent가 파일시스템 직접 쓰기를 할 수 있으므로, `ai-dapp-generator`를 계속 쓸지 아니면 DeepAgent가 직접 DApp 코드를 생성하는 방식으로 바꿀지
- [ ] Human in the Loop에서 DApp 생성 승인 단위 (도구 호출 단위? 파일 단위?)
- [ ] 프록시 서버의 프로덕션 배포 방안 (현재 localhost:4000 하드코딩)

---

## 8. LangChain 기술 참고

### 핵심 개념
- **`createDeepAgent`**: LangGraph 기반 에이전트 생성
- **`DynamicStructuredTool`**: MCP 도구를 LangChain 도구로 변환 (RemixToolAdapter가 자동)
- **`streamEvents()`**: v2 이벤트 스트리밍 (on_chat_model_stream, on_tool_start 등)
- **`interrupt`**: Human-in-the-loop용 에이전트 일시정지 메커니즘
- **`useStream`**: React hook (LangChain 프론트엔드 패턴, 아직 미도입)

### LangChain 프론트엔드 docs
- URL: https://docs.langchain.com/oss/python/langchain/frontend/overview
- 패턴: Message rendering, Tool calling cards, Human-in-the-loop, Branching chat
- UI 컴포넌트: Conversation, Message, Tool, Reasoning

---

## 9. 프록시 서버 세팅 (로컬 테스트용)

```bash
cd /Users/sooyounhyun/Desktop/dev/remix-front-back/remix-langchain-proxyserver
# .env 파일에 유효한 ANTHROPIC_API_KEY 설정 필요
# PORT=4000 (DeepAgentInferencer에 하드코딩됨)
npm start

# Remix IDE 실행 (별도 터미널)
cd /Users/sooyounhyun/Desktop/dev/remix-front-back/remix-project
yarn serve

# 브라우저: http://localhost:8080
# Settings → DeepAgent 활성화 → 페이지 새로고침
```

---

## 10. 파일 위치 요약

```
remix-project/
├── apps/remix-ide/src/app/plugins/
│   ├── remixAIPlugin.tsx          ← 스테판 영역 (HITL 이벤트 릴레이만 추가)
│   └── quick-dapp-v2.tsx          ← 수영 (Plugin API 확장)
├── libs/remix-ai-core/src/
│   ├── inferencers/deepagent/     ← 스테판 영역 + HITL 관련 수정
│   │   ├── DeepAgentInferencer.ts ← EventEmitter 전달 추가
│   │   ├── DeepAgentPrompts.ts
│   │   ├── RemixFilesystemBackend.ts ← BackendProtocol alias + approval gate 연결
│   │   └── RemixToolAdapter.ts    ← ToolApprovalGate 추가 (MCP 도구용)
│   ├── helpers/
│   │   └── dapp-system-prompt.ts  ← 수영 (포팅)
│   ├── remix-mcp-server/
│   │   ├── RemixMCPServer.ts      ← 수영 (도구 등록만)
│   │   ├── handlers/DappHandler.ts ← 수영 (신규)
│   │   └── types/mcpTools.ts      ← 수영 (DAPP enum)
│   ├── storage/
│   │   └── deepAgentMemoryBackend.ts ← 스테판 영역
│   └── types/
│       ├── deepagent.ts           ← 스테판 영역
│       └── humanInTheLoop.ts      ← 수영 (HITL 타입, 도구 분류, 정책)
├── libs/remix-ui/
│   ├── quick-dapp-v2/             ← 수영 영역
│   ├── remix-ai-assistant/src/components/
│   │   ├── remix-ui-remix-ai-assistant.tsx ← HITL 모달 통합 + React UI 핸들러
│   │   ├── ToolApprovalModal.tsx  ← 수영 (HITL 승인/거절/편집 UI)
│   │   ├── ToolCallCard.tsx      ← 수영 (신규, Phase 1 — 도구 호출 카드)
│   │   ├── AgentStatusBar.tsx    ← 수영 (신규, Phase 2 — 에이전트 상태바)
│   │   ├── ThinkingBubble.tsx    ← 수영 (신규, Phase 3 — Claude reasoning)
│   │   ├── SubagentPanel.tsx     ← 수영 (신규, Phase 4 — 서브에이전트 리스트)
│   │   └── chat.tsx              ← 컴포넌트 통합 (ToolCallCard, ThinkingBubble, SubagentPanel)
│   │   src/css/
│   │   ├── deepagent-ui.css      ← 수영 (신규, 전용 CSS — Bootstrap 변수 기반)
│   │   ├── color.css             ← NLUX/Bootstrap 색상 매핑
│   │   └── remix-ai-assistant.css ← 기존 채팅 스타일
│   │   src/lib/
│   │   └── toolDescriptions.ts   ← 수영 (Phase 1 — 도구 아이콘/메시지 매핑)
│   └── settings/                  ← 도구 정책 설정 UI (미구현)
└── DEEPAGENT_CONTEXT.md           ← 이 파일 (.gitignore 등록됨)
```

---

## 11. 아키텍처 결정 로그

### 결정 1: Human in the Loop — Tool Wrapping vs LangChain interrupt() (2026-04-14)

**결정**: Tool Wrapping 방식 채택

**배경**: LangChain/LangGraph에는 `interrupt()`라는 정식 HITL 메커니즘이 있다. 이는 그래프 실행을 완전히 중단하고, 상태를 디스크에 저장한 뒤, 사용자 승인 후 재개하는 방식이다.

**왜 interrupt()를 사용하지 않는가:**
- `interrupt()`를 사용하려면 `createDeepAgent()` 함수에 `interruptBefore: ['tools']` 옵션을 추가해야 함
- `createDeepAgent()`는 `deepagents`라는 외부 npm 패키지에 있으며, 스테판이 관리하는 별도 레포
- 이 패키지를 fork/수정/퍼블리시하는 것은 수영의 작업 범위를 넘음
- Remix IDE는 브라우저 기반 단일 사용자 환경이므로, interrupt()의 핵심 장점(서버 상태 영속, 세션 복원)이 필요 없음

**Tool Wrapping이 충분한 이유:**
- 도구의 `func`을 Promise로 감싸서 UI 모달을 띄우고 사용자 응답을 대기
- LangChain 입장에서는 도구가 "오래 걸리는 것"처럼 보일 뿐, 정상 동작
- 위험한 도구만 선별적으로 게이트 적용 가능 (읽기 전용 도구는 바로 실행)
- `RemixToolAdapter.ts`만 수정하면 되므로 스테판 코드 변경 불필요

**유일한 차이**: 페이지 새로고침 시 대기 중인 승인 요청이 날아감. 하지만 채팅에서 모달이 떠 있는 동안 페이지를 새로고침할 일은 사실상 없으므로 무관.

**향후**: 나중에 Remix IDE가 서버 기반 에이전트 아키텍처로 전환되면 그때 interrupt()을 검토할 수 있음. 현재는 불필요.

---

### 결정 2: POC 브랜치를 lanchain_deepagent에서 분기 (2026-04-13)

**결정**: `poc/quickdapp-deepagent`를 `origin/lanchain_deepagent`에서 분기

**왜:**
- 기존 `feature/remix-ai-quickdapp-integration` 브랜치는 `remixAIPlugin.tsx`에서 스테판 코드와 심각한 충돌 발생
- 머지 대신 필요한 코드만 깨끗하게 새 브랜치에 포팅하는 것이 안전
- DappAgent(키워드 매칭)는 DeepAgent(LLM 기반 도구 선택)에 의해 대체되므로 폐기

---

### 결정 3: 내장 도구 vs MCP 도구 — 이중 approval 지점 (2026-04-14)

**발견**: `deepagents` npm 패키지에는 두 종류의 도구가 있다:
1. **내장 도구** (`write_file`, `read_file`, `edit_file`, `ls` 등) — 라이브러리 내부에서 `RemixFilesystemBackend`의 메서드를 직접 호출
2. **MCP 도구** (`dapp_create`, `dapp_list` 등) — `RemixToolAdapter`가 LangChain 도구로 변환

**문제**: 초기 계획에서는 `RemixToolAdapter`에서만 approval gate를 적용하면 된다고 생각했다.
하지만 실제로 가장 위험한 `write_file`은 내장 도구이며, `RemixToolAdapter`를 거치지 않는다.

**해결**: approval을 두 곳에서 적용:
- `RemixFilesystemBackend.write_file()` — 내장 `write_file`/`edit_file` 도구가 호출하는 지점
- `ToolApprovalGate` in `RemixToolAdapter` — MCP 도구 (`dapp_create` 등)

둘 다 같은 `EventEmitter`와 같은 `ToolApprovalModal`을 공유한다.

**왜 이렇게 되었나**: `deepagents` 라이브러리의 내부 구조를 사전에 확인하지 않고 구현했기 때문. 라이브러리가 `backend.write()`, `backend.edit()` 등의 메서드를 직접 호출하고, `createWriteFileTool` 등의 내부 팩토리 함수에서 도구를 생성한다는 것을 `node_modules/deepagents/dist/index.js`를 분석한 후에야 파악했다.

**교훈**: 외부 라이브러리와 연동할 때는 반드시 실제 코드(특히 번들된 dist 파일)를 분석해서 호출 시그니처와 기대하는 반환값을 먼저 확인해야 한다.

---

### 결정 4: RemixFilesystemBackend BackendProtocol 호환 (2026-04-14)

**문제**: `deepagents` 라이브러리가 기대하는 `BackendProtocol`과 `RemixFilesystemBackend`의 메서드 시그니처가 불일치:

| 라이브러리 호출 | 기존 구현 | 문제 |
|---|---|---|
| `backend.write(path, content)` → `{ error?, metadata?, filesUpdate? }` | `write_file(path, content)` → `void` | 메서드 이름 + 반환값 불일치 |
| `backend.read(path, offset, limit)` → `string` | `read_file(path)` → `string` | offset/limit 미지원 |
| `backend.edit(path, old, new, replaceAll)` → `{ error?, occurrences? }` | `edit_file(path, edits[])` → `void` | 시그니처 완전히 다름 |
| `backend.lsInfo(path)` → `{ path, is_dir }[]` | `lsInfo(path)` → `{ name, isDirectory }[]` | 필드명 불일치 |

**해결**: 기존 `write_file()`, `read_file()`, `edit_file()` 메서드는 그대로 유지하고, 라이브러리가 호출하는 `write()`, `read()`, `edit()` alias 메서드를 추가. `lsInfo()` 반환 형식만 변경.

**사이드이펙트 분석 (확인 완료):**
- `write_file()`, `read_file()`, `edit_file()` — 기존 메서드 내부에서만 호출되며, 다른 파일에서 직접 호출 없음
- `new RemixFilesystemBackend()` — `DeepAgentInferencer.ts:69`에서만 생성. 생성자에 `eventEmitter?` optional 파라미터 추가는 기존 호출과 호환
- `lsInfo()` — 라이브러리가 내부에서만 호출. 우리 코드에서 직접 호출 없음
- `eventEmitter`가 없으면 approval 없이 즉시 실행 (기존 동작과 동일)

---

## 12. Human in the Loop — 구현 상세 (feature/deepagent-human-in-the-loop)

### 구현 완료 항목

**신규 파일:**
| 파일 | 역할 |
|---|---|
| `libs/remix-ai-core/src/types/humanInTheLoop.ts` | 타입, 도구 위험도 분류, 정책 로직 |
| `libs/remix-ui/remix-ai-assistant/src/components/ToolApprovalModal.tsx` | 승인/거절/편집 모달 (diff, 타이머) |

**수정 파일:**
| 파일 | 변경 |
|---|---|
| `RemixFilesystemBackend.ts` | `write()`/`read()`/`edit()` alias 추가, `write_file()` 내 approval 연결, `lsInfo()` 반환 형식 수정 |
| `RemixToolAdapter.ts` | `ToolApprovalGate` 클래스 추가 (MCP 도구 래핑) |
| `DeepAgentInferencer.ts` | ApprovalGate 생성, EventEmitter를 BackEnd에 전달 |
| `remixAIPlugin.tsx` | `onToolApprovalRequired` 릴레이 + `respondToToolApproval` 메서드 |
| `remix-ui-remix-ai-assistant.tsx` | 모달 state/이벤트/핸들러/렌더링 |

### 이벤트 흐름

```
내장 도구 (write_file):
  AI가 write_file 호출
  → deepagents가 backend.write() 호출
  → RemixFilesystemBackend.write() → write_file()
  → requestWriteApproval() — EventEmitter로 이벤트 emit
  → remixAIPlugin이 릴레이 → UI 모달 표시
  → 사용자 Approve/Reject → 같은 경로를 역방향으로
  → write_file()이 실제 쓰기 실행 or 에러 throw

MCP 도구 (dapp_create 등):
  AI가 dapp_create 호출
  → ToolApprovalGate가 func을 가로챔
  → EventEmitter로 이벤트 emit
  → 같은 모달, 같은 흐름
```

### 테스트 결과 (2026-04-14)

| 시나리오 | 결과 |
|---|---|
| Approve → 파일 생성 | ✅ 동작 확인 |
| Reject → 파일 미생성 | ✅ 동작 확인 |
| Edit → 수정된 내용 반영 | ✅ 코드 흐름 검증 완료 (E2E 대기) |
| 읽기 전용 도구 → 모달 없음 | ✅ 동작 확인 |
| 60초 타임아웃 | ✅ 타이머 버그 수정 완료 (E2E 대기) |
| edit_file → approval 연동 | ✅ 구현 완료 — toolName 'edit_file' 표시 |

### 디버깅 로그

모든 HITL 로그는 **조건부**로 전환됨.
활성화: `localStorage.setItem('hitl_debug', 'true')` → 페이지 새로고침

```
[HITL] read_file: ...                     ← Backend (hitlDebug)
[HITL] Approval response: ...             ← Backend (hitlDebug)
[HITL] relay → ...                        ← Plugin (조건부)
[HITL] request: ...                       ← UI (조건부)
[HITL] approve/reject: ...                ← UI (조건부)
[HITL] response → ...                     ← Plugin (조건부)
```

### 2026-04-15 작업 내역

- [x] `origin/lanchain_deepagent` 최신으로 rebase (충돌 3건 해결)
- [x] `edit()` alias — 'edit_file'로 approval 요청, 이중 승인 방지
- [x] `edit_file()` — 동일하게 `requestWriteApproval` + `writeFileInternal`
- [x] `writeFileInternal()` 도입 — approval 후 직접 쓰기
- [x] `requestWriteApproval(toolName)` 파라미터 추가
- [x] 타이머 버그 수정 — `stopTimer()`, `dismissedRef` guard
- [x] Reject 버튼 → `handleReject` 래퍼로 타이머 정리
- [x] 디버그 로그 조건부 전환 (`hitl_debug` localStorage 키)
- [x] MCP 도구(`file_write`, `file_create` 등)에 `approvalGate.wrap()` 적용
- [x] LLM hallucination 문제 해결 (chatHistory 제거 + MemorySaver/checkpointer)
- [x] Yann PR #7080 변경사항 적용 (skills, checkpointer, read/grep 수정)
- [x] `rejectedPaths` 제거 — 매번 사용자에게 묻도록 변경
- [x] React StrictMode 중복 마운트 수정
- [x] 시스템 프롬프트 강화 (도구 사용 의무화)
- [x] `on_tool_start` 버그 수정 (`console.log` → `event.emit`)

### 남은 작업

- [ ] E2E 테스트 — write_file, edit_file, Edit 모드, 타임아웃, Reject 후 재시도 확인
- [ ] Settings UI — 도구 정책 선택 패널
- [ ] 디버깅용 Proxy wrapper 및 verbose 로그 정리 (프로덕션 전)
- [x] PR 생성 (WIP) → 스테판 리뷰 대기
- [x] 스테판에게 DM 전달
- [x] `[HITL]` 디버그 로그 정리 → 조건부 전환 완료
- [x] 과도한 주석 정리

### Git 커밋 내역

```
feature/deepagent-human-in-the-loop (→ lanchain_deepagent)

3c3f238418  add human-in-the-loop approval for DeepAgent tool execution
c346385cc3  fix hallucination, add MCP tool approval gate, add MemorySaver checkpointer

pushed: 2026-04-15 15:00 KST (force-with-lease, rebase 이후)
```

---

## 13. 아키텍처 결정 로그 (2026-04-15 오후, 추가분)

### 결정 5: MCP 도구 경로도 HITL 적용 (2026-04-15)

**발견**: 에이전트에게 두 가지 파일 쓰기 경로가 있었다:
1. **내장 도구** (`write_file`) → `backend.write()` → `RemixFilesystemBackend` → HITL ✅
2. **MCP 도구** (`file_write`, `file_create`) → `RemixToolAdapter.convertExternalMCPTools()` → `FileWriteHandler.execute()` → **HITL 없음** ❌

에이전트가 내장 도구에서 Reject되면 MCP 도구 경로로 우회할 수 있었다.

**해결**: `convertExternalMCPTools()`에서 각 MCP 도구의 `func`을 `approvalGate.wrap()`으로 감쌈.
위험한 MCP 도구(`file_write`, `file_create`, `file_replace`, `file_move`, `file_copy`, `file_delete`)는 HITL 모달을 거치고, 읽기 전용 도구(`file_read`, `read_file_chunk`, `grep_file`, `directory_list`)는 즉시 실행.

**수정 파일**:
- `RemixToolAdapter.ts` — `convertExternalMCPTools()` 내부에 `approvalGate.wrap()` 추가
- `humanInTheLoop.ts` — MCP 도구명을 `TOOL_METADATA`와 `SAFE_TOOLS`에 등록

---

### 결정 6: chatHistory 제거 + LangGraph MemorySaver 도입 (2026-04-15)

**문제**: edit 후 write 요청 시 LLM이 도구를 호출하지 않고 "만들었습니다"라고 텍스트만 생성 (hallucination).

**원인 분석**:
1. `buildChatPrompt()`가 이전 대화를 `{ role: 'assistant', content: '텍스트' }` 형태로만 반환
2. `tool_use` 블록이 포함되지 않음 — LangChain의 `AIMessage(content)` 생성 시 소실
3. LLM이 이전 패턴을 보고 "도구 없이 텍스트만 응답하면 된다"고 학습 (in-context learning)
4. 결과: write_file 도구를 호출하지 않고, 파일 내용을 텍스트로만 생성

**해결 — Yann PR #7080 방향 채택**:
```typescript
// 1. chatHistory를 agent에 넘기지 않음
const messages = [
  { role: 'user', content: prompt }
]

// 2. LangGraph MemorySaver가 에이전트 내부 상태를 관리
const checkpointer = new MemorySaver()
const agentConfig = { ..., checkpointer }

// 3. 각 요청은 독립 세션 (고유 thread_id)
streamEvents({ messages }, {
  version: 'v2',
  configurable: { thread_id: `remix-${Date.now()}-${random}` }
})
```

**왜 이 방향이 맞는가**:
- Yann의 PR #7080에서 동일한 접근 — `MemorySaver` + `checkpointer` + `thread_id`
- LangGraph 체크포인터는 `tool_use` 블록을 포함한 **완전한 대화 상태**를 관리
- `buildChatPrompt()`의 불완전한 히스토리가 필요 없어짐
- 각 프롬프트가 독립 세션이므로 이전 대화 패턴이 오염되지 않음

**부가 수정**: 시스템 프롬프트(`DeepAgentPrompts.ts`)에 "MUST use tools for ALL file operations" 규칙 추가. `MemorySaver`가 근본 해결이고, 프롬프트는 방어적 보강.

**Yann PR #7080에서 추가 적용한 것**:
- `skills: ["skills/"]` — deepagents 스킬 시스템 활성화
- `read()` offset/limit optional 처리 — BackendProtocol 호환 버그 수정
- `grep()` 경로 수정 — Remix `readdir`이 전체 경로를 키로 반환하므로 중복 경로 제거

---

### 결정 7: rejectedPaths 제거 — 매번 사용자에게 묻기 (2026-04-15)

**배경**: Reject 후 LLM이 같은 파일을 재시도하는 "리젝트 루프"를 막기 위해 `rejectedPaths` Set을 도입했었음.

**제거 이유**:
1. 같은 경로라도 LLM이 **다른 내용**으로 재시도할 수 있음 — 사용자가 평가할 기회를 줘야 함
2. 사용자가 **마음을 바꿀 수 있음** — "역시 만들어줘"
3. 페이지 새로고침 전까지 영구 차단은 과도함
4. 리젝트 루프는 시스템 프롬프트("report the failure honestly, do NOT retry")로 충분히 방어 가능

**리스크**: Reject 후 LLM이 같은 파일로 즉시 재시도하면 모달이 연속으로 뜰 수 있음. 테스트에서 이 현상이 나타나면 시스템 프롬프트를 추가 보강하거나, 단일 agent 실행 내에서만 유효한 제한적 `rejectedPaths`를 재도입할 수 있음.

---

### 결정 8: React StrictMode 중복 마운트 대응 (2026-04-15)

**문제**: `ToolApprovalModal`이 6번 MOUNTED 로그를 찍음 — React StrictMode가 개발 모드에서 컴포넌트를 unmount → remount 하기 때문.

**수정**:
- `console.log('MOUNTED')` → `useEffect` 안으로 이동 (렌더마다 안 찍힘)
- `useEffect` cleanup에서 `stopTimer()` 호출 → StrictMode 언마운트 시 이전 타이머 정리
- `dismissedRef.current = false` 리셋 → StrictMode 재마운트 시 깨끗한 상태
- dependency를 `[request.requestId]`로 변경 → 새 요청에만 타이머 시작

---

### 결정 9: `on_tool_start` 이벤트 emit 수정 (2026-04-15)

**스테판 원본 코드**:
```typescript
console.log('onStreamResult', `\n[Using tool: ${toolName}]\n\n\n`)
```

**문제**: `console.log`로 되어 있어서 채팅 UI에 `[Using tool: ...]`이 표시되지 않았음. `this.event.emit('onStreamResult', ...)`이어야 함.

**수정**: `this.event.emit('onStreamResult', ...)`으로 변경. 스테판의 의도에 부합하는 버그 수정으로 판단.

---

## 14. 프로덕션 전 정리 체크리스트

| 항목 | 상태 | 비고 |
|------|------|------|
| Proxy wrapper (DeepAgentInferencer) | ⬜ 제거 필요 | 디버깅용. 로그는 제거됐지만 Proxy 자체는 아직 있음 |
| `[HITL]` verbose 로그 | ✅ 정리 완료 | ~50개 → 6개로 축소 (핵심만 유지) |
| `on_tool_start` emit | ✅ 원복 완료 | `console.log`로 원복. 버그 아니었음 (스테판 의도) |
| 시스템 프롬프트 강화 | ✅ 유지 | 방어적 보강, 삭제 없이 추가만 |
| 15초 safety-net 타이머 | ✅ 제거 완료 | `runAgent()` 종료 시 flush로 대체됨 |

---

## 15. 2026-04-16 작업 내역

### 15-1. Edit 배칭 (Batched Edit Approval)

**문제**: AI가 `edit()` 도구를 여러 번 호출하면 (예: 이벤트 추가 + 함수 추가), 매번 모달이 뜸 → UX 불가능.

**해결**:
- `RemixFilesystemBackend`에 `editBatches` Map 도입
- `edit()` 호출 시 파일에 안 쓰고 `virtualContent`에 누적
- flush 시 한번에 합쳐서 ONE diff로 승인 요청

**Flush 트리거 (2개)**:
1. `DeepAgentInferencer.runAgent()` 스트림 종료 직후 → `flushAllPendingBatches()`
2. 비-edit 메서드 (`ls`, `cwd`, `write_file` 등) 호출 시 → `flushAllPendingBatches()`

**15초 타이머는 제거됨**: 위 2개 트리거로 충분. 불필요한 복잡성.

### 15-2. Approve 버튼 추가

**문제**: 위젯에 Reject + Review Changes만 있었음. 에디터 안 열고 바로 승인하려면 버튼이 없음.

**해결**: `ToolApprovalModal`에 3개 버튼 동시 표시:
- **Reject** (빨간) — 거절
- **Approve** (초록) — 에디터 안 열고 바로 승인
- **🔍 Review Changes** — 에디터에서 diff 확인 후 결정

### 15-3. on_tool_start 원복

**배경**: 스테판 원본 코드에서 `console.log('onStreamResult', ...)`를 버그로 판단하고 `this.event.emit('onStreamResult', ...)`로 변경했었음.

**결과**: 채팅에 `[Using tool: ls]`, `[Using tool: write_file]` 등의 텍스트가 날것으로 노출됨.

**판단**: 스테판이 의도적으로 `console.log`를 사용한 것. 채팅 스트림이 아닌 개발자 콘솔에만 표시하려는 의도. → `console.log`로 원복.

**향후**: 섹션 3-5 (DeepAgent React UI)에서 도구 호출 카드 UI를 만들 때 제대로 구현할 것.

### 15-4. 로그 정리

**~50개 → 6개**로 축소.

제거한 것:
- `[Step 1]`~`[Step 11]` 단계별 로그 전부
- content length, alias delegation, file exists 확인 로그
- `[HITL][Proxy]` 모든 메서드 호출 로그
- diffLines raw chunks 디버그 로그
- Modal MOUNTED, APPROVE, REJECT, REVIEW CHANGES 로그
- 에디터 widget emit 로그

남겨둔 것 (핵심 6개):
- `flushEditBatch:` — 배치 flush 시점
- `No eventEmitter — auto-approving` — HITL 비활성 시 진단
- `requestWriteApproval:` — 내장 도구 승인 요청
- `Requesting approval:` — MCP 도구 승인 요청
- `User decision:` — 승인/거절 결과
- `TIMEOUT — auto-rejecting:` — 60초 타임아웃

### 15-5. 사이드이펙트 분석 결과

**결론: 안전함.** 이유:
- 추가한 이벤트(`customDiffAccepted` 등)는 우리 코드만 listen. 다른 코드에 영향 0
- 새 메서드/클래스는 기존 코드 위에 얹은 것. 기존 동작 불변
- optional 파라미터 사용. 안 넘기면 기존 동작 유지
- Subagents, Planning, Context Management 등 다른 로드맵 영역 미접촉

**스테판에게 알려야 할 것**:
- MemorySaver/checkpointer (이미 공유됨)
- edit 배칭 설계 (PR 리뷰 시 설명 필요)

### 15-6. 알려진 미해결 이슈

1. **유저가 중간에 정지(빨간 네모) 클릭 시 위젯 잔류**: AI 챗은 "Request stopped by user!"로 멈추지만, 이미 emit된 approval 요청의 위젯은 그대로 남음. → 챗 중지 이벤트에서 `setPendingApproval(null)` 호출이 필요. **다음 작업에서 수정 예정.**

2. **AI가 파일을 못 찾는 경우 edit 배칭 꼬임**: AI가 `edit()` 호출 시 파일이 실제로는 있지만 read 실패하면 배치가 시작 안 됨 → 이후 flush에서 빈 배치 처리 문제. → **원인 추가 조사 필요.**

3. **여분 `}` 이슈**: 특정 edit 조합에서 diff 결과에 `}`가 추가로 보이는 현상. diffLines 라이브러리의 trailing newline 처리 관련 가능성. → **추가 재현 및 조사 필요.**

4. **위젯 잔류 (부분 accept/reject 후)**: 에디터에서 일부 변경사항만 accept하고 일부는 reject한 후 위젯이 남는 경우 보고됨. → **이중 emit 타이밍 이슈 관련 가능성. 추가 재현 필요.**

---

## 16. 아키텍처 결정 로그 (2026-04-16 추가분)

### 결정 10: on_tool_start는 console.log 유지 (2026-04-16)

**배경**: `DeepAgentInferencer.ts`에서 스테판이 `console.log('onStreamResult', ...)`로 작성한 것을 버그로 판단하고 `this.event.emit(...)`로 변경.

**문제**: 채팅에 `[Using tool: ls]` 등이 텍스트로 노출됨. UX 불량.

**결론**: 스테판이 의도적으로 콘솔에만 출력하도록 한 것. → 원복. 나중에 도구 호출 카드 UI (섹션 3-5)에서 제대로 구현.

### 결정 11: 15초 safety-net 타이머 제거 (2026-04-16)

**배경**: edit 배칭 초기 구현에서 "에이전트가 edit만 하고 다른 도구를 안 부르면 flush가 안 되니까" 15초 후 자동 flush하는 타이머를 넣었음.

**제거 이유**: `runAgent()` 종료 시 직접 `flushAllPendingBatches()`를 호출하는 방식으로 변경 후, 타이머가 발동할 일이 없음. 불필요한 복잡성.

### 결정 12: Approve 버튼 분리 (2026-04-16)

**배경**: 기존에는 Review Changes 버튼만 있어서 반드시 에디터를 열어야 승인할 수 있었음.

**변경**: Approve 버튼 추가. 에디터 열지 않고 즉시 승인 가능. 간단한 변경(파일 생성 등)에서 유용.

---

*마지막 업데이트: 2026-04-20 16:42 KST*

---

## 17. 스테판 PR 피드백 대응 (2026-04-20)

### 17-1. 피드백 원문

스테판(STetsing)이 PR 리뷰에서 4가지 피드백:

1. **충돌(Conflicts)** — 브랜치에 충돌이 있음
2. **리베이스(ALWAYS rebase)** — main langchain 브랜치에 리베이스해야 함
3. **Approval gate on all tools** — 컴파일 결과 조회는 승인 과정을 거치면 안 됨
4. **Branch is so heavy** — remixAI 어시스턴트에서 타이핑이 느림 (lag)

### 17-2. 리베이스 수행 (이슈 1 & 2)

**백업**: `backup/hitl-before-rebase-2026-04-20`

**리베이스 전 상태**:
```
feature/deepagent-human-in-the-loop (51e3c31)
  ← fb6bfb5 (옛 lanchain_deepagent, PR #7080 머지 전)
```

**리베이스 후 상태**:
```
feature/deepagent-human-in-the-loop (02f8f36 → 471f69c)
  ← 945de75 (최신 lanchain_deepagent, PR #7080 포함)
```

**충돌 5건 해결**:
- `DeepAgentInferencer.ts`: MemorySaver import (세미콜론 차이), checkpointer 생성 (주석 차이), thread_id 주석 (우리만 추가) — 3건
- `RemixFilesystemBackend.ts`: `read()` offset/limit 주석 (우리만 추가), `grep()` 경로 주석 (우리만 추가) — 2건
- 모두 **같은 코드에 대한 주석/포맷팅 차이**. 스테판 코드를 base로 유지, 우리 참조 주석(`// Ref: Yann PR #7080`)을 보존.

### 17-3. SAFE_TOOLS 확장 (이슈 3)

**변경 파일**: `libs/remix-ai-core/src/types/humanInTheLoop.ts`

**변경 전**: 16개 도구만 등록 → `get_compilation_result` 등 누락 → 불필요한 승인 모달 표시

**변경 후**: ~50개 도구를 카테고리별로 정리하여 등록:

| 카테고리 | 주요 추가 도구 |
|---------|--------------|
| 컴파일/분석 | `get_compilation_result`, `get_compilation_result_sources_by_file_path`, `get_compiler_versions`, `get_verified_contract_from_etherscan`, `compile_with_hardhat/foundry/truffle`, `slither_scan` |
| 디버깅 | `start_debug_session`, `decode_local_variable`, `decode_state_variable`, `extract_locals_at`, `decode_locals_at`, `extract_state_at`, `decode_state_at`, `storage_view_at`, `jump_to`, `get_stack_at`, `get_scopes_with_root` |
| 환경/계정 | `get_current_environment`, `get_account_balance`, `get_user_accounts`, `get_foundry_hardhat_info` |
| 스킬 | `get_skill`, `list_skills` |
| 유틸리티 | `wei_to_ether`, `ether_to_wei`, `decimal_to_hex`, `hex_to_decimal`, `timestamp_to_date`, `chartjs_generate` |
| 튜토리얼 | `tutorials_list`, `start_tutorial` |
| AMP | `amp_query`, `amp_dataset_manifest` |

**설계 원칙**: 화이트리스트 방식 유지. `SAFE_TOOLS`에 없고 `TOOL_METADATA`에도 없는 도구는 기본 `{ risk: 'medium' }`으로 승인 모달이 뜸. 새 MCP 도구 추가 시 읽기 전용이면 여기에 등록 필요.

### 17-4. Proxy wrapper 제거 + 성능 프로파일링 (이슈 4)

#### Proxy wrapper 제거

**변경 파일**: `libs/remix-ai-core/src/inferencers/deepagent/DeepAgentInferencer.ts`

**변경 전**:
```typescript
const rawBackend = new RemixFilesystemBackend(plugin, this.event)
this.filesystemBackend = new Proxy(rawBackend, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver)
    if (typeof value === 'function') {
      return function (...args) { return value.apply(target, args) }
    }
    return value
  }
}) as any
```

**변경 후**:
```typescript
this.filesystemBackend = new RemixFilesystemBackend(plugin, this.event) as any
```

**이유**: 디버깅용이었으나 로그는 이미 제거된 상태. 모든 메서드 호출을 인터셉트하는 오버헤드만 남아있었음.

#### 성능 프로파일링 결과

`remix-ui-remix-ai-assistant.tsx`에 `performance.now()` 기반 렌더 프로파일러를 임시 삽입하여 측정:

| 지표 | DeepAgent ON | DeepAgent OFF |
|------|-------------|--------------|
| 타이핑 중 SLOW render (>5ms) 경고 | 없음 | 없음 |
| "hello world test" 입력 시 렌더 수 | ~20 | ~20 |
| 렌더당 시간 | <5ms | <5ms |
| 초기 로딩 렌더 | 15ms, 36ms (정상) | 10ms, 21ms (정상) |

**결론**: HITL React 코드(pendingApproval state, useCallback 체인 등)는 **타이핑 lag의 원인이 아님**. 렌더 속도와 횟수가 DeepAgent ON/OFF에서 동일. 스테판이 느낀 lag는 다른 요인(MCP 서버 초기화 CPU 부하, development 빌드 오버헤드 등)이 원인일 가능성.

프로파일링 코드는 확인 후 제거 완료.

### 17-5. switch 문 들여쓰기 원복

**변경 파일**: `libs/remix-ai-core/src/inferencers/deepagent/RemixToolAdapter.ts`

`jsonSchemaToZod()` 내 switch/case 문의 들여쓰기가 스테판 원본(case 앞 8칸)과 달랐음(우리 6칸). 코드 로직 변경 없이 포맷팅만 원복하여 PR diff 노이즈 방지.

### 17-6. 디버그 로그 정리 + Edit 배칭 리팩토링

**변경 파일**: `libs/remix-ai-core/src/inferencers/deepagent/RemixFilesystemBackend.ts`

두 번째 커밋(`lint`)에서 수행한 작업:

1. **디버그 로그 대폭 정리**: `[HITL][Backend][Step N]` 형태의 상세 디버그 로그 ~20개 제거. 핵심 로그 1개만 유지 (`requestWriteApproval` 호출 시).

2. **Edit 배칭 로직 완성**:
   - `editBatches` Map 추가: 파일별로 `{ originalContent, virtualContent, totalEdits }` 관리
   - `edit()` 메서드: 즉시 승인 요청 대신 가상 콘텐츠만 업데이트하고 즉시 반환
   - `flushEditBatch()`: 파일별 누적 편집을 하나의 diff로 승인 요청
   - `flushAllPendingBatches()`: 모든 파일의 미결 배치를 순차 flush
   - `cwd()`, `write_file()`, `edit_file()`, `ls()`, `lsInfo()`, `mkdir()`, `globInfo()` 에서 `flushAllPendingBatches()` 호출 → 에이전트가 다른 작업으로 넘어가기 전 반드시 flush

3. **read_file() 배치 인식**: 배칭 중인 파일의 `read_file()` 호출 시 디스크 대신 virtualContent 반환

4. **REJECTED 메시지 강화**: `"Do NOT retry this operation or use alternative tools/methods"` 추가하여 에이전트의 재시도 방지

### 17-7. 커밋 히스토리

리베이스 후 현재 브랜치 커밋 순서 (oldest → newest):
```
945de75  origin/lanchain_deepagent (base — Stefan's latest)
├── eb32f68  add human-in-the-loop approval for DeepAgent tool execution
├── b79e187  fix hallucination, add MCP tool approval gate, add MemorySaver checkpointer
├── 8c5ed1b  batch edit approvals into single diff
├── 02f8f36  expand SAFE_TOOLS for read-only MCP tools, remove Proxy wrapper
└── 471f69c  lint
```

**Push**: `git push --force-with-lease origin feature/deepagent-human-in-the-loop`
- force push 이유: 리베이스로 이전 커밋 해시가 변경됨

---

## 18. 2026-04-22 동기화 작업 — lanchain_deepagent 최신 통합

### 18-1. 배경

스테판의 PR 리뷰 피드백(충돌 해결, 리베이스) 이후에도 `origin/lanchain_deepagent`에 추가 작업이 머지됨:
- **PR #7092** (스테판): feature/task 머지 → 태스크 분해, Mistral AI 모델 연동, 서브에이전트 실체화, 스킬 로더
- **PR #7108** (Yann): 인라인 위젯 기반 Diff 리뷰 → **Monaco DiffEditor 기반 다중 세션 리뷰**로 완전 교체

PR #7108은 HITL과 직접 관련됨 — `showCustomDiff`, `customDiffAccepted`, `customDiffRejected` 등의 이벤트 기반이 변경됨.

### 18-2. 작업 순서

#### Step 1: 백업 생성
```
backup/hitl-before-sync-2026-04-22 → 471f69c (이전 HEAD)
```

#### Step 2: Yann PR #7108 머지
- Fast-forward로 깔끔하게 적용
- DiffEditor 기반 다중 세션 리뷰 시스템 도입

#### Step 3: lanchain_deepagent 최신으로 리베이스 (12개 커밋)
리베이스 대상 커밋 (스테판 PR #7092에서 온 것들):
```
0f739bf  tool display UI a bit longer
83cf0b4  minor
b8b4511  no orphaned user cancellation, steps separated llm messages
4b4543a  adding frontend generator subagent
724cf15  minor
9ce8034  connecting models to deepagent -> mistralai
4c7b180  resolved race condition on mcp connection and deepagen init
c52b04d  task breakdown / decomposition
e9c6c80  add skill loader
cb4c8fb  loading skills
14bfc3d  adding task decomposition and execution
59ba89f  multiple decomposition subagents
```

#### Step 4: 충돌 해결 (12개 중 3개 커밋에서 발생)

**커밋 1 (`39f40a27d8` — HITL 기본 구현)**:
- `remixAIPlugin.tsx`: 스테판의 subagent/task 이벤트 리스너 + 수영의 HITL approval 이벤트 리스너 **양쪽 모두 유지**
- `remix-ui-remix-ai-assistant.tsx`: 이벤트 off() 핸들러 — **양쪽 모두 유지**

**커밋 2 (`9916c1dd00` — hallucination fix, MCP gate)**:
- `DeepAgentInferencer.ts` 3곳:
  - `on_chain_start/end`: 스테판의 subagent/task 이벤트 핸들링 유지, 수영의 debug log 제거
  - `on_tool_start`: 스테판의 `onToolCall` emit 유지, 수영의 `onStreamResult` emit 제거
  - `on_tool_end`: 스테판 버전 유지, 수영의 verbose debug log 제거

**커밋 3 (`12b013f281` — batch edit)**:
- `DeepAgentInferencer.ts` 1곳: `on_tool_start` (커밋 2와 동일 패턴) — 스테판 `onToolCall` emit 유지

**커밋 4~12**: 충돌 없이 자동 적용 ✅

#### Step 5: 빌드 에러 수정
- **TS2393: Duplicate function implementation** — 리베이스로 `RemixFilesystemBackend.ts`에 `edit()` 메서드가 두 개 공존:
  1. 56줄: `edit(filePath, oldString, newString, replaceAll)` — deepagents 라이브러리용 배칭 로직 (현재 사용)
  2. 314줄: `edit(file_path, edits: EditInstruction[])` — 이전 alias (edit_file 위임용)
  → **314줄의 구 alias 제거**로 해결

### 18-3. 리베이스 후 브랜치 상태

```
c12216d  origin/lanchain_deepagent (base — PR #7092 + #7108 포함)
├── 39f40a27  add human-in-the-loop approval for DeepAgent tool execution
├── 9916c1dd  fix hallucination, add MCP tool approval gate, add MemorySaver checkpointer
├── 12b013f2  batch edit approvals into single diff
├── c2486433  expand SAFE_TOOLS for read-only MCP tools, remove Proxy wrapper
├── b5489569  lint
├── 46116301  use diff editor and add accept changes
├── 9c6fb812  discard diff
├── 0911a062  emit event
├── 63c59238  multiple diff session
├── 74de7159  approve / reject all
├── 66968304  make sure the file is open before opening the diff
└── 353b63f1  hasUnacceptedChanges return false  ← HEAD
```

### 18-4. Yann의 DiffEditor 아키텍처 변경 요약

**이전 (인라인 위젯)**:
- `pendingApproval: ToolApprovalRequest | null` — 단건 처리
- 에디터 내 인라인 accept/decline 위젯

**이후 (DiffEditor, PR #7108)**:
- `pendingApprovals: ToolApprovalRequest[]` — 다건 동시 처리
- Monaco DiffEditor (`editor.showCustomDiff()`) — 좌우 비교
- `customDiffAccepted` / `customDiffRejected` 이벤트
- "Approve All" / "Discard All" 일괄 처리 UI
- 다중 diff 세션 관리 (`reviewingApprovals` Set, `pendingDiffApprovalRef`)

### 18-5. 스테판 PR #7092 신규 기능 요약

| 기능 | 설명 |
|------|------|
| 태스크 분해 | 복잡한 프롬프트를 3~10개 태스크로 자동 분해 |
| Mistral AI | 모델 선택 가능 (anthropic ↔ mistralai), Settings에서 전환 |
| 서브에이전트 | Security Auditor, Code Reviewer, Frontend Generator 실체화 |
| 스킬 로더 | `skills/` 폴더에서 에이전트 스킬 로드 |
| MCP 초기화 | race condition 수정 — MCP 연결 완료 후 DeepAgent 초기화 |
| 사용자 취소 | orphaned cancellation 방지 — 중단 시 깨끗한 정리 |

이벤트 시스템 확장:
- `onSubagentStart` / `onSubagentComplete` — 서브에이전트 라이프사이클
- `onTaskStart` / `onTaskComplete` — 태스크 분해 진행 상태
- `onToolCall` — 도구 실행 시작/종료 (UI 카드 표시용)

### 18-6. 발견된 이슈 — readdir 경로 문제 ⚠️

**증상**: `directory_list` 도구가 `contracts` 폴더의 파일 목록을 반환하지 못함.
에이전트가 "contracts 폴더가 비어 있습니다"라고 응답.

**원인 분석**:
- Remix `fileManager.readdir('contracts')` API가 key를 **full path**로 반환하는 것으로 보임:
  ```javascript
  { "contracts/1_Storage.sol": { isDirectory: false }, ... }
  ```
- `DirectoryListHandler` (`FileManagementHandler.ts:540~574`)에서 `fullPath = args.path + '/' + file` 로 경로를 조합하면:
  ```
  "contracts/" + "contracts/1_Storage.sol" = "contracts/contracts/1_Storage.sol"  ← 중복!
  ```
- `isDirectory('contracts/contracts/1_Storage.sol')` 호출 실패 → catch에서 조용히 skip → 빈 리스트

**같은 패턴이 존재하는 코드**:
- `RemixFilesystemBackend.ls()` — `Object.keys(files).map(name => ...)` 에서 name이 full path일 수 있음
- `RemixFilesystemBackend.lsInfo()` — 동일
- `RemixFilesystemBackend.grepRaw()` — 주석에 "Remix readdir returns full paths as keys (Ref: Yann PR #7080)"라고 이미 언급됨

**우리의 판단 — 수정하지 않음**:
1. `FileManagementHandler.ts`와 `RemixFilesystemBackend.ls()` / `normalizePath()`는 **스테판의 인프라 코드**이며, 수영의 HITL 영역이 아님
2. `readdir`의 반환 형식이 워크스페이스 타입이나 Remix 버전에 따라 다를 수 있음 — 확실하지 않은 상태에서 수정하면 **사이드 이펙트 위험**
3. 스테판/Yann이 이 코드로 정상 동작하고 있었을 가능성 → 환경 차이일 수 있음
4. **스테판에게 보고하여 확인받는 것이 안전**

**임시 대응**: HITL 테스트 시 파일 경로를 직접 지정하는 프롬프트로 우회 가능:
```
❌ "contracts 폴더의 파일들을 읽어줘"  (directory_list 호출 → 빈 결과)
✅ "contracts/1_Storage.sol 파일을 읽어줘" (read_file 직접 호출 → 정상)
```

### 18-7. 아키텍처 결정 로그 (2026-04-22 추가분)

#### 결정 13: 충돌 해결 원칙 — 스테판 코드 우선 (2026-04-22)

**원칙**: 리베이스 충돌 시 **스테판의 upstream 코드를 기본으로 유지**하고, 수영의 HITL 이벤트 리스너만 추가.

**이유**:
- 스테판의 코드가 새로운 아키텍처 방향 (subagent, task, onToolCall 등)
- 수영의 이전 커밋에 있던 debug log (`★ TOOL START`, `console.log Event:` 등)는 이미 정리 대상이었음
- 양쪽 이벤트 리스너는 서로 독립적 (subagent 이벤트 ≠ HITL approval 이벤트)이므로 공존 가능

#### 결정 14: 인프라 코드 수정 자제 (2026-04-22)

**결정**: `FileManagementHandler.ts`, `RemixFilesystemBackend.normalizePath()`, `RemixFilesystemBackend.ls()` 등 **스테판의 인프라 코드는 수정하지 않음**.

**이유**: 섹션 18-6 참조. `readdir` 동작의 불확실성, 사이드 이펙트 위험, 원저자 의도 파악 부족.

#### 결정 15: duplicate edit() 제거는 필수 (2026-04-22)

**결정**: `RemixFilesystemBackend.ts`의 구 `edit(file_path, edits[])` alias 제거.

**이유**: TypeScript 컴파일러가 TS2393 에러를 발생시킴. 리베이스로 두 버전의 `edit()` 메서드가 공존하게 된 것이며, 새 배칭 로직의 `edit(filePath, oldString, newString, replaceAll)` 만 있으면 됨. `edit_file()` 메서드 자체는 그대로 유지.

### 18-8. 커밋 히스토리 (push 예정)

```
c12216d  origin/lanchain_deepagent (base)
├── [HITL commits 1-5]
├── [DiffEditor commits 6-12 — Yann's PR #7108]
└── (new) fix: remove duplicate edit() method causing TS2393 after rebase
```

**Push**: `git push --force-with-lease origin feature/deepagent-human-in-the-loop`
- force push 이유: 리베이스로 이전 커밋 해시가 모두 변경됨
- `--force-with-lease`: 다른 사람이 그 사이에 push한 게 있으면 거부 (안전장치)

### 18-9. 남은 작업

- [ ] `readdir` 경로 문제를 스테판에게 보고
- [x] DiffEditor 기반 HITL E2E 테스트 → 섹션 19 참조
- [x] 사용자 취소 시 pendingApprovals 정리 → 수정 완료

---

## 19. HITL 테스트 결과 및 AC 검증 (2026-04-23)

### 19-1. 스테판 로드맵 AC 검증

**원문 (스테판 노션):**
> User must interact with AI for replacing auto-approve file writes with comprehensive approval UI: diff viewer, inline editing, timeout handling, and tool execution policies.

| # | AC | 상태 | 구현 근거 |
|---|-----|------|----------|
| 1 | No file writes occur without explicit user approval | ✅ | `write_file()` → `requestWriteApproval()`, `edit()` → 배칭 후 flush에서 승인 요청, MCP 쓰기 도구 → `approvalGate.wrap()` |
| 2 | customDiff modal clearly shows before/after comparison | ✅ | `showCustomDiff()` → Monaco DiffEditor (좌우 비교), Yann PR #7108 통합 |
| 3 | Users can edit proposed changes before approving | ✅ | DiffEditor에서 수정 가능, Accept 시 `editor.getText()`로 최종 내용 반영 |
| 4 | UI backed up actions | ❓ | 의미 불확실 — 스테판에게 확인 필요. "UI-backed actions"(모든 도구 실행의 UI 가시화)이면 React UI (섹션 3-5) 작업 범위, "UI backup actions"(롤백)이면 현재 불필요로 판단 |

**결론**: 핵심 AC 3개 완료. AC 4는 스테판에게 의미 확인 후 판단.

### 19-2. 테스트 시나리오 결과

| # | 시나리오 | 기대 동작 | 결과 |
|---|---------|----------|------|
| 1 | **write_file Approve** — "SimpleStorage.sol 만들어줘" | 모달 표시 → Approve → 파일 생성 | ✅ |
| 2 | **write_file Reject** — 파일 생성 요청 후 Reject | 모달 표시 → Reject → 파일 미생성, AI 재시도 안 함 | ✅ |
| 3 | **Review Changes (DiffEditor)** — 기존 파일 수정 | Review 클릭 → DiffEditor → Accept All/Discard All | ✅ |
| 4 | **Edit 배칭** — 한 파일에 여러 edit 요청 | edit 중간에 모달 없음 → flush 시 combined diff 1개만 | ✅ |
| 5 | **읽기 전용 도구** — "파일 읽어줘" | 모달 없이 즉시 실행 | ✅ |
| 6 | **컴파일 결과 조회** — compile + get_compilation_result | SAFE_TOOLS 등록됨 → 모달 없음 | ✅ |
| 7 | **60초 타임아웃** — 모달 무응답 | 0초 도달 시 자동 Reject | ✅ |
| 8 | **사용자 정지 (빨간 네모)** — 모달 표시 중 정지 | 모달 정리됨 (pendingApprovals 초기화) | ✅ (수정 완료) |
| 9 | **Hallucination 방지** — 연속 프롬프트 | 도구 실제 호출 (텍스트만 생성 안 함) | ✅ (MemorySaver) |
| 10 | **directory_list 경로 문제** — "contracts 폴더 파일 읽어줘" | ⚠️ 빈 결과 반환 | ❌ 이슈 — 섹션 19-3 참조 |

### 19-3. 알려진 이슈 — `directory_list` 경로 중복

**증상**: AI에게 "contracts 폴더의 파일을 읽어줘"라고 하면 `directory_list` 도구가 빈 결과를 반환. 에이전트가 "contracts 폴더가 비어 있습니다"라고 응답.

**원인**: Remix `fileManager.readdir('contracts')` API가 key를 full path로 반환:
```javascript
{ "contracts/1_Storage.sol": { isDirectory: false }, ... }
```
`DirectoryListHandler`에서 `fullPath = args.path + '/' + file`로 조합하면:
```
"contracts/" + "contracts/1_Storage.sol" = "contracts/contracts/1_Storage.sol"  ← 중복!
```
`isDirectory('contracts/contracts/1_Storage.sol')` 실패 → catch에서 skip → 빈 리스트.

**영향 범위**:
- `FileManagementHandler.ts` (DirectoryListHandler) — **스테판 인프라 코드**
- `RemixFilesystemBackend.ls()`, `lsInfo()` — 동일 패턴 존재 가능
- `grepRaw()` — 이미 주석에 언급됨 (Ref: Yann PR #7080)

**우리의 판단**: **수정하지 않음**. 스테판의 인프라 코드이며, `readdir` 반환 형식이 워크스페이스 타입에 따라 다를 수 있어 사이드이펙트 위험.

**임시 우회**: 파일 경로를 직접 지정하면 정상 동작:
```
❌ "contracts 폴더의 파일들을 읽어줘"
✅ "contracts/1_Storage.sol 파일을 읽어줘"
```

**→ 스테판에게 보고 필요.**

*마지막 업데이트: 2026-04-23 16:40 KST*

---

## 20. DeepAgent React UI — 구현 상세 (2026-04-23)

> **브랜치**: `feature/deepagent-human-in-the-loop` (HITL 위에서 작업 중)  
> **작업 근거**: 스테판 노션 로드맵 섹션 3-5 "DeepAgent React UI" (AC #1~#6)

### 20-1. 스테판의 AC (노션 원문) vs 구현 상태

| # | AC | 상태 | 구현 컴포넌트 |
|---|-----|------|--------------|
| 1 | Tool calls display in card format with all info | ✅ | `ToolCallCard.tsx` |
| 2 | Thinking supported | ✅ | `ThinkingBubble.tsx` + 백엔드 이벤트 파이프라인 |
| 3 | Agent status indicator always shows current activity | ✅ | `AgentStatusBar.tsx` |
| 4 | Subagent panel updates in real-time | ✅ | `SubagentPanel.tsx` + `on_tool_start` 기반 감지 |
| 5 | Task visualizer shows dependency graph clearly | ❌ | `TaskVisualizerPanel.tsx` (미구현) |
| 6 | Components are responsive | ⚠️ | CSS 반응형 기본 적용, 추가 폴리싱 필요 |

**추가 요구사항 (노션):**
- [x] Loading spinner during execution → ToolCallCard pending 상태
- [x] Collapsible results → ToolCallCard completed 상태 (접기/펼치기)
- [x] Auto-hide after some time → 완료된 카드 5초 후 자동 접기
- [ ] Cancel button → 기존 stopRequest 연결 (AgentStatusBar에 표시만, 별도 취소 버튼 미구현)
- [ ] Parent-child relationship → SubagentPanel 트리 구조 (현재 리스트만)
- [ ] Task accepting/modifying/submitting → TaskVisualizerPanel 상호작용 (미구현)
- [ ] Chat component revamp → Phase 6 (미구현)

### 20-2. 구현 단계별 상세

#### Phase 0: 백엔드 이벤트 보강 + ChatMessage 인터페이스 확장

**목적**: 모든 UI 컴포넌트의 데이터 기초 구축

**ChatMessage 인터페이스 확장** (`interfaces.ts`):
```typescript
interface ChatMessage {
  // ... 기존 필드 ...
  
  // 도구 호출 히스토리 (ToolCallCard용)
  toolCalls?: ToolCallRecord[]
  
  // 서브에이전트 히스토리 (SubagentPanel용)
  subagentHistory?: SubagentRecord[]
  
  // 태스크 히스토리 (TaskVisualizerPanel용)
  taskHistory?: TaskRecord[]
  
  // Claude thinking/reasoning (ThinkingBubble용)
  thinkingContent?: string
}
```

**이벤트 핸들러 리팩토링** (`remix-ui-remix-ai-assistant.tsx`):
- `handleToolCall`: 기존 boolean 플래그 → `toolCalls[]` 배열로 누적 관리 (start → pending 추가, end → completed로 상태 전환)
- `handleSubagentStart/Complete`: `subagentHistory[]` 배열로 누적
- `handleTaskStart/Complete`: `taskHistory[]` 배열로 누적
- `handleThinkingContent`: `thinkingContent` 문자열에 누적 (Phase 3에서 추가)

**on_tool_end emit 복원** (`DeepAgentInferencer.ts`):
스테판 코드에서 주석 처리되어 있던 `on_tool_end`의 개별 도구 emit을 복원:
```typescript
// 변경 전: 주석 처리
// this.event.emit('onToolCall', { toolName, toolOutput, status: 'end' })

// 변경 후: ToolMessage에서 .content 추출하여 emit
let toolOutput: string | undefined
if (rawOutput != null) {
  if (typeof rawOutput === 'string') toolOutput = rawOutput
  else if (typeof rawOutput.content === 'string') toolOutput = rawOutput.content
  else if (typeof rawOutput === 'object') toolOutput = JSON.stringify(rawOutput)
  else toolOutput = String(rawOutput)
}
this.event.emit('onToolCall', { toolName, toolOutput, status: 'end' })
```
**왜 주석이었나**: `on_tool_end`의 `event.data.output`이 `ToolMessage` 객체여서 `.content`를 추출하지 않으면 `[object ToolMessage]`가 표시됨. 스테판이 이 문제를 인지하고 주석 처리한 것으로 추정. 우리가 `.content` 추출 로직을 추가하여 해결.

---

#### Phase 1: ToolCallCard 컴포넌트 (AC #1)

**파일**: `libs/remix-ui/remix-ai-assistant/src/components/ToolCallCard.tsx`

**기능:**
- 도구 호출을 카드 형태로 표시
- **pending 상태**: 스피너 + 도구명 + 인수 미리보기 + pulse 애니메이션
- **completed 상태**: 체크 아이콘 + 결과 접기/펼치기 + 소요시간 표시
- **error 상태**: 에러 메시지 표시
- 도구 종류별 아이콘 (`write_file` → 📝, `read_file` → 📖, `compile` → ⚙️ 등)
- 5초 후 자동 접기 (auto-collapse)
- 한글 친화적 도구 실행 메시지 (`toolDescriptions.ts`의 `getToolExecutionMessage()`)

**ToolCallList**: 여러 도구가 동시 실행될 때 배열 렌더링하는 래퍼 컴포넌트

**chat.tsx 통합**: 기존 `tool-execution-indicator` (spinner + text) → ToolCallCard로 조건부 교체. `toolCalls[]`가 없으면 레거시 indicator로 fallback.

---

#### Phase 2: AgentStatusBar 컴포넌트 (AC #3)

**파일**: `libs/remix-ui/remix-ai-assistant/src/components/AgentStatusBar.tsx`

**상태 머신:**
```
idle → thinking → using_tools → waiting_approval → thinking → spawning_subagent → ...
                                                                                  → complete
```

**데이터 소스:**
- `isStreaming` + 도구 미실행 → `thinking`
- `msg.isExecutingTools` → `using_tools` (도구명 표시)
- `pendingApprovals.length > 0` → `waiting_approval`
- `msg.activeSubagent` → `spawning_subagent`
- streaming 완료 직후 → `complete` (2초 후 숨김)
- 아무것도 아닐 때 → `idle` (숨김)

**배치**: 채팅 히스토리 스크롤 영역 하단에 위치 (maximized/non-maximized 모두). 투명 배경으로 레이아웃 jitter 없음.

---

#### Phase 3: ThinkingBubble 컴포넌트 (AC #2)

**파일**: `libs/remix-ui/remix-ai-assistant/src/components/ThinkingBubble.tsx`

**백엔드 변경** (`DeepAgentInferencer.ts`):
Claude의 `on_chat_model_stream` 이벤트에서 `chunk.content`가 배열인 경우, 각 블록의 `type`을 검사:
- `type: 'thinking'` → `onThinkingContent` 이벤트 emit (신규)
- `type: 'text'` → 기존 `onStreamResult` emit (변경 없음)

```typescript
// 배열 형태 content 처리 (Claude extended thinking)
if (Array.isArray(chunk.content)) {
  for (const block of chunk.content) {
    if (block.type === 'thinking' && block.thinking) {
      thinkingDelta = block.thinking  // 별도 채널로 전달
    } else if (block.type === 'text' && block.text) {
      delta = block.text  // 기존 스트림으로 전달
    }
  }
}
```

**이벤트 흐름**: 
```
DeepAgentInferencer → emit('onThinkingContent') → remixAIPlugin 릴레이 → UI handleThinkingContent → msg.thinkingContent += data.content → ThinkingBubble 렌더링
```

**UI 상태:**
- 스트리밍 중 + thinking 있음: 🧠 "Thinking..." (beat-fade 애니메이션) + 클릭으로 펼치기
- 스트리밍 완료 + thinking 있음: 🧠 "View reasoning (N blocks)" + 접힘 + 미리보기
- thinking 없음: 완전히 숨김 (렌더링 자체 안 함)

**제약**: Claude extended thinking이 API 레벨에서 활성화되어야 실제 데이터가 옴. 미활성화 시 ThinkingBubble은 렌더링 안 됨 (사이드이펙트 0).

---

#### Phase 4: SubagentPanel 컴포넌트 (AC #4)

**파일**: `libs/remix-ui/remix-ai-assistant/src/components/SubagentPanel.tsx`

**핵심 발견 및 수정 — 서브에이전트 감지 오류:**

초기 구현에서 서브에이전트를 `on_chain_start` 이벤트로 감지하려 했으나, 실제로 동작하지 않았음:

```typescript
// 초기 구현 (작동 안 함)
if (eventType === 'on_chain_start') {
  if (runName.includes('subagent') || tags.includes('subagent')) {
    // deepagents 라이브러리는 'task'라는 이름을 사용, 'subagent'가 아님
  }
}
```

**원인**: `deepagents` npm 패키지에서 서브에이전트는 `task`라는 도구로 구현됨. `on_chain_start`의 `name`에 "subagent"가 포함되지 않음.

**수정**: `on_tool_start`에서 `toolName === 'task'`를 감지하여 서브에이전트 이벤트 emit:

```typescript
if (eventType === 'on_tool_start') {
  // 기존 도구 이벤트 emit...
  
  // 서브에이전트 감지: task 도구의 input에서 subagent_type과 description 추출
  if (toolName === 'task') {
    const subagentName = parsedInput.subagent_type || 'Subagent'
    const subagentTask = parsedInput.description || 'Processing...'
    activeSubagents.set(event.run_id, { name: subagentName, startTime: Date.now() })
    this.event.emit('onSubagentStart', { id, name, task, status: 'running' })
  }
}
```

`on_tool_end`에서도 동일하게 `toolName === 'task'`일 때 `onSubagentComplete` emit.

**검증 결과** (2026-04-23 16:28 KST):
```
[DeepAgentInferencer] Subagent spawned via task tool: Security Auditor (run_id: 019db93c-...)
[DeepAgentInferencer] Subagent spawned via task tool: Code Reviewer (run_id: 019db93c-...)
[RemixAI Assistant] Subagent started: {id: '...', name: 'Security Auditor', ...}
[RemixAI Assistant] Subagent started: {id: '...', name: 'Code Reviewer', ...}
```
→ 백엔드 감지 + UI 핸들러 도달 확인 완료.

**UI:**
- 각 서브에이전트를 상태별 카드로 표시 (running: 스피너+info 색상, completed: 체크+success, failed: 경고+danger)
- 클릭하여 태스크 설명 펼치기/접기
- 소요 시간 표시
- `subagentHistory[]`가 없으면 레거시 인라인 indicator로 fallback

---

### 20-3. CSS 디자인 원칙

**파일**: `libs/remix-ui/remix-ai-assistant/src/css/deepagent-ui.css`

모든 컴포넌트가 공유하는 원칙:
1. **하드코딩 색상 금지** — Bootstrap CSS 변수 사용 (`--bs-body-color`, `--bs-border-color`, `--bs-info`, `--bs-success` 등)
2. **테마 적응** — `color-mix(in srgb, var(--bs-body-color) X%, transparent)`로 은은한 배경
3. **상태별 좌측 보더** — pending: info, completed: success, error: danger
4. **미세 애니메이션** — `tool-card-pulse` (border-color oscillation), `fa-beat-fade`, `fa-spin`
5. **투명 배경** — 레이아웃 jitter 및 배경 중첩 방지

---

### 20-4. 파일 변경 요약

#### 신규 파일 (수영 영역)

| 파일 | 역할 | Phase |
|------|------|-------|
| `ToolCallCard.tsx` | 도구 호출 카드 (pending/completed/error) | 1 |
| `AgentStatusBar.tsx` | 에이전트 상태 표시줄 (thinking/tools/approval/subagent) | 2 |
| `ThinkingBubble.tsx` | Claude reasoning 접기/펼치기 pill | 3 |
| `SubagentPanel.tsx` | 서브에이전트 실행 리스트 | 4 |
| `deepagent-ui.css` | 전용 CSS (Bootstrap 변수 기반) | 전체 |
| `toolDescriptions.ts` (기존) | 도구별 아이콘/메시지 매핑 | 1 |

#### 수정 파일

| 파일 | 변경 | Phase |
|------|------|-------|
| `interfaces.ts` | `ChatMessage` 확장 (toolCalls, subagentHistory, taskHistory, thinkingContent) | 0, 3 |
| `DeepAgentInferencer.ts` | `on_tool_end` emit 복원, thinking block 감지, task 도구 → 서브에이전트 emit | 0, 3, 4 |
| `remixAIPlugin.tsx` | `onThinkingContent` 이벤트 릴레이 추가 | 3 |
| `remix-ui-remix-ai-assistant.tsx` | 이벤트 핸들러 리팩토링 (히스토리 배열 관리), AgentStatusBar 통합, handleThinkingContent | 0, 2, 3 |
| `chat.tsx` | ToolCallCard, ThinkingBubble, SubagentPanel 통합 (레거시 fallback 유지) | 1, 3, 4 |

---

### 20-5. 아키텍처 결정 로그

#### 결정 16: on_tool_end emit 복원 — ToolMessage .content 추출 (2026-04-23)

**배경**: 스테판이 `on_tool_end`에서 `onToolCall` emit을 주석 처리. ToolCallCard에서 개별 도구 완료를 추적하려면 이 emit이 필요.

**문제**: `event.data.output`이 LangChain의 `ToolMessage` 객체여서 그대로 emit하면 `[object ToolMessage]` 표시.

**해결**: `.content` 속성을 추출하는 로직 추가. string → 그대로, ToolMessage → `.content`, object → `JSON.stringify`.

**스테판 코드 영향**: 기존 `runAgent()` finally 블록의 빈 `status: 'end'` emit도 그대로 유지. UI에서 방어 코드(`!data.toolName`일 때 모든 pending → completed)로 양립.

#### 결정 17: 서브에이전트 감지를 on_tool_start로 이동 (2026-04-23)

**배경**: 초기 `on_chain_start` 기반 감지가 실제 deepagents 라이브러리와 매칭되지 않음.

**발견**: deepagents 라이브러리에서 서브에이전트는 `task`라는 LangChain 도구로 구현됨. 도구의 input에 `{ description, subagent_type }` 포함. `on_chain_start`의 `name`이나 `tags`에는 "subagent"가 없음.

**해결**: `on_tool_start`에서 `toolName === 'task'`를 감지하여 `onSubagentStart` emit. `on_tool_end`에서 동일하게 `onSubagentComplete` emit. `activeSubagents` Map으로 `run_id` 기반 매칭.

**기존 on_chain_start 감지는 유지**: fallback용. 향후 deepagents 라이브러리가 subgraph 이름에 "subagent"를 포함하게 되면 양쪽 모두에서 감지 가능. 중복 감지 방지는 `activeSubagents.has(event.run_id)`로 처리 가능.

#### 결정 18: CSS에서 하드코딩 색상 제거 (2026-04-23)

**문제**: 초기 구현에서 모든 색상을 hex 값으로 하드코딩 → 다크/라이트 테마 전환 시 텍스트 불가독.

**해결**: Bootstrap CSS 변수(`--bs-body-color`, `--bs-border-color` 등)와 `color-mix(in srgb, ...)` 함수로 전면 교체. 프로젝트의 기존 CSS 파일(`color.css`, `remix-ai-assistant.css`)에서 사용하는 패턴을 따름.

#### 결정 19: AgentStatusBar 위치를 채팅 스크롤 영역 내부로 이동 (2026-04-23)

**문제**: 입력 영역 바로 위에 배치했더니 배경 중첩 + 채팅 높이 깜빡임(jitter) 발생.

**해결**: 채팅 히스토리 스크롤 영역(`chatHistory` div) 하단으로 이동. 투명 배경 적용. 부모 컨테이너의 배경색과 자연스럽게 동화.

---

### 20-6. 서브에이전트 테스트 프롬프트

서브에이전트는 Claude가 `task` 도구를 **스스로 호출**해야 트리거됨. 단순 프롬프트에서는 호출하지 않음.

**서브에이전트 트리거 가능성이 높은 프롬프트:**
```
Read all .sol files in the contracts directory. For each contract:
1. Do a security audit checking for reentrancy, overflow, and access control issues
2. Review the code quality and suggest improvements
Please analyze each contract independently.
```

**콘솔 필터**: `Subagent spawned` — 서브에이전트 감지 확인

**현재 설정된 서브에이전트** (enableSubagents=true일 때):
1. **Security Auditor** — 보안 감사
2. **Code Reviewer** — 코드 리뷰
3. **Frontend Specialist** — 프론트엔드 작업

---

### 20-7. 남은 작업

#### Phase 5: TaskVisualizerPanel (AC #5, 미구현)

**목적**: 태스크 분해 결과를 리니어 타임라인으로 시각화

**현재 상태**: 
- `onTaskStart`/`onTaskComplete` 이벤트 이미 존재
- `taskHistory[]` 배열 이미 누적됨
- UI 컴포넌트만 작성 필요

**단계적 접근:**
1. Phase 5-1: 리니어 타임라인 (태스크 카드 목록 — pending/running/completed)
2. Phase 5-2: 의존성 그래프 (백엔드에서 `onPlanCreated` 이벤트 필요 — 미제공)

**제약**: 스테판의 태스크 분해 기능(PR #7092)이 의존성 그래프 데이터를 이벤트로 emit하지 않음. 현재는 `onTaskStart`/`onTaskComplete`만 있음 → 리니어 타임라인만 가능.

#### Phase 6: 채팅 컴포넌트 리뉴얼

- `isIntermediateContent` 메시지 스타일링 (희미한 배경 + 접기)
- 도구 카드와 텍스트 콘텐츠의 인터리빙 레이아웃
- 서브에이전트/태스크 전환 시 시각적 구분선

#### 기타

- [ ] ThinkingBubble 실제 테스트 (Claude extended thinking 활성화 필요)
- [ ] SubagentPanel 완료 이벤트 UI 반영 E2E 확인
- [ ] 전체 CSS 반응형 폴리싱 (좁은 패널에서 카드 레이아웃)
- [ ] Phase 0~4 커밋 정리 및 PR 준비

---

### 20-8. `deepagents` npm 패키지 내부 구조 (참고)

`deepagents` v1.8.8 — Anthropic의 LangGraph 기반 에이전트 프레임워크.

**핵심 구조:**
- `createDeepAgent(config)` → LangGraph `CompiledStateGraph` 반환
- **내장 도구** (`write_file`, `read_file`, `edit_file`, `ls` 등): `BackendProtocol` 인터페이스를 통해 `RemixFilesystemBackend` 호출
- **`task` 도구**: 서브에이전트를 LangGraph subgraph로 생성. `subagent_type` 파라미터로 어떤 서브에이전트를 사용할지 선택
- **subgraph 상태 관리**: `ReducedValue`로 병렬 서브에이전트의 파일 변경을 안전하게 병합
- **스킬 시스템**: `skills/` 폴더에서 에이전트 스킬 로드 (Yann PR #7080)

**이벤트 스트림** (`streamEvents` v2):
- `on_chat_model_stream`: LLM 텍스트 스트리밍 + thinking blocks
- `on_tool_start` / `on_tool_end`: 도구 실행 시작/종료
- `on_chain_start` / `on_chain_end`: 체인/subgraph 시작/종료

---

## 21. 2026-04-27 작업 내역 — 스테판 피드백 대응 + 멀티턴 복구

### 21-1. 스테판 PR 피드백 5건 대응

스테판이 PR 리뷰에서 `requested changes` 상태로 5건의 피드백을 남김. 전부 대응 완료.

#### 피드백 1: 타임아웃 처리 방식 변경 ✅

**스테판 원문:**
> Update the 1 minute timer approval to be handled properly by the LLM. As of now after timeout, it is handled as user rejection. It should be no input, then rejection.

**문제**: 60초 타이머 만료 시 `onReject()`를 호출하여 에이전트에게 `"REJECTED: The user explicitly rejected..."` 메시지 전달. 에이전트는 "사용자가 명시적으로 거절"한 것으로 인식하여 재시도를 포기.

**수정 내용**:
1. `ToolApprovalModal.tsx`에 `onTimeout` 콜백 prop 추가 (기존 `onReject`와 분리)
2. 타이머 만료 시 `onReject()` 대신 `onTimeout()` 호출
3. `ToolApprovalResponse` 인터페이스에 `timedOut?: boolean` 필드 추가 (`humanInTheLoop.ts`)
4. `remix-ui-remix-ai-assistant.tsx`에 `handleTimeoutToolAction` 핸들러 추가 — `timedOut: true` 전달
5. `RemixFilesystemBackend.ts`에서 `timedOut` 체크:
   - `timedOut: true` → `"TIMEOUT: No user input within 60 seconds... You may decide what to do next — retry, try a different approach, or skip."`
   - `timedOut: false` → `"REJECTED: The user explicitly rejected... Do NOT retry."`
6. React 렌더링 충돌 방지: `onTimeout` 콜백을 `setTimeout(0)`으로 다음 틱 지연

**설계 원칙**: 타임아웃의 의미 해석을 **UI가 아닌 LLM에게 위임**. 에이전트가 "무응답"과 "명시적 거절"을 구분하여 스스로 판단.

**변경 파일**:
- `ToolApprovalModal.tsx` — `onTimeout` prop, 타이머 로직
- `remix-ui-remix-ai-assistant.tsx` — `handleTimeoutToolAction`
- `RemixFilesystemBackend.ts` — `write_file()`, `edit_file()` 에러 메시지 분기
- `humanInTheLoop.ts` — `ToolApprovalResponse.timedOut` 필드

#### 피드백 2: `high risk` 태그 제거 ✅

**스테판 원문:**
> remove the `high risk` tag on the approval viewer

**수정**: `ToolApprovalModal.tsx`에서 `RISK_LABELS`, `RISK_COLORS` 상수 및 뱃지 렌더링 JSX 전부 삭제. risk 기반 border 색상도 고정색으로 변경.

**스테판 의도**: 위험도 분류는 내부 로직용(어떤 도구에 모달을 띄울지 결정)이지, 사용자에게 보여줄 정보가 아님.

#### 피드백 3: 아이콘 전부 제거 ✅

**스테판 원문:**
> remove all Icons

**수정**: `CATEGORY_ICONS` 상수, `icon` 변수, 아이콘 `<span>` 렌더링 전부 삭제. Review Changes 버튼의 `🔍` 이모지도 제거.

#### 피드백 4: lsInfo 경로 중복 버그 수정 ✅

**스테판 원문:**
> @hsy822 this is causing `contracts/contracts/#.sol` issues

**원인**: `RemixFilesystemBackend.lsInfo()`에서 `path: \`${targetPath}/${name}\`` 로 경로를 조합했으나, Remix의 `readdir`는 이미 full path를 key로 반환. → `contracts/contracts/1_Storage.sol` 중복.

**수정**: 스테판 원본 코드로 원복 — `path: \`${name}\``. 또한 `FileManagementHandler.ts`의 `DirectoryListHandler.execute()`에서도 동일한 중복 버그를 발견하여 수정.

> **이전 결정 14 수정**: 섹션 18-7에서 "인프라 코드는 수정하지 않음"으로 결정했었으나, 스테판이 직접 이 버그를 지적했으므로 수정. **우리가 추가한 `targetPath/` 접두어가 원인**이었음.

#### 피드백 5: chatHistory 제거에 대한 멀티턴 관리 질문 → GitHub 답변

**스테판 원문:**
> @hsy822 previous context is not inside the llm. How is that managed internally by lang chain graph?

**답변 (GitHub에 게시):**
> `MemorySaver` handles it — we now reuse a session-level `thread_id` so context persists across turns. `buildChatPrompt()` was removed because it omitted `tool_use` blocks, causing hallucination. Ref: https://docs.langchain.com/oss/python/langgraph/add-memory

### 21-2. 멀티턴 세션 복구 — sessionThreadId 도입

#### 배경 (결정 6에서 발전)

결정 6 (섹션 13)에서 chatHistory를 제거하고 **각 요청을 독립 세션(매번 새 thread_id)**으로 처리했었음. 이는 hallucination 방지에는 효과적이었으나, **에이전트가 이전 대화를 기억하지 못하는 문제**가 있었음.

예시:
```
사용자: "SimpleStorage 컨트랙트를 만들어줘" → AI가 파일 생성 ✅
사용자: "방금 만든 컨트랙트에 getValue 추가해줘" → AI가 "어떤 컨트랙트인가요?" ❌
```

#### 해결: 세션 레벨 thread_id

LangGraph 공식 문서(https://docs.langchain.com/oss/python/langgraph/add-memory)의 패턴을 따름:
같은 `thread_id`를 재사용하면 `MemorySaver` checkpointer가 이전 대화 상태(도구 호출 + 결과 포함)를 자동으로 로드.

```typescript
// 변경 전: 매 요청마다 새 thread_id (대화 단절)
configurable: {
  thread_id: `remix-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

// 변경 후: 세션 레벨 thread_id (대화 연속)
configurable: {
  thread_id: this.sessionThreadId  // 인스턴스 생성 시 1회 생성, 재사용
}
```

**왜 chatHistory(buildChatPrompt)를 복구하지 않는가:**
- `buildChatPrompt()`는 `{ role: 'assistant', content: '텍스트' }` 형태로만 이전 대화를 반환
- `tool_use` 블록이 누락되어 LLM이 "도구 없이 텍스트만 생성"하는 hallucination 발생
- `MemorySaver`는 **도구 호출 + 결과를 포함한 완전한 상태**를 저장하므로 hallucination 없이 멀티턴 가능

#### 구현 상세

**`DeepAgentInferencer.ts` 변경:**

```typescript
class DeepAgentInferencer {
  // 세션 레벨 thread_id — 인스턴스 생성 시 1회 생성
  private sessionThreadId: string = DeepAgentInferencer.generateThreadId()

  private static generateThreadId(): string {
    return `remix-session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  // 에러 시 세션 리셋
  private resetSessionThread(): void {
    this.sessionThreadId = DeepAgentInferencer.generateThreadId()
  }
}
```

**새 thread_id 생성 시점**: 페이지 새로고침 (DeepAgentInferencer 인스턴스 재생성)

#### 알려진 이슈: 간헐적 ToolInputParsingException

멀티턴으로 대화가 쌓이면 **가끔** LLM이 도구 호출 시 `path` 파라미터를 누락하는 현상 발생:

```
ToolInputParsingException: Received tool input did not match expected schema
✖ Invalid input: expected string, received undefined → at path
```

**원인**: LLM의 비결정성. 이전 턴의 도구 호출 히스토리가 길어지면 LLM이 파라미터를 누락할 확률이 올라감. LangGraph/MemorySaver 자체의 버그가 아닌 **LLM 레벨의 간헐적 실수**.

**대응 — 자동 복구 로직**:
```typescript
catch (error) {
  if (error.message.includes('did not match expected schema')) {
    // 1. 세션 리셋 (새 thread_id 생성)
    this.resetSessionThread()
    // 2. 새 thread_id로 1회 재시도 (이전 맥락 없이 깨끗한 상태)
    const retryStream = this.agent.streamEvents(
      { messages: langchainMessages },
      { configurable: { thread_id: this.sessionThreadId } }
    )
    // 3. 재시도 스트림 처리...
  }
}
```

**사용자 경험**: 에러가 발생해도 자동으로 복구되어 사용자는 에러를 모름. 단, 재시도 시 이전 대화 맥락은 유실됨 (새 세션이므로).

**추후 개선 가능**: LangGraph 문서의 `trim_messages` — 대화가 길어지면 오래된 메시지를 잘라내어 LLM 실수 확률 감소. 현재는 안정성 우선.

### 21-3. 커밋 히스토리

```
bb67a82f43  fix: simplify approval modal, add timeout delegation, enable multi-turn via session thread_id, fix path duplication
```

**Push**: `git push origin feature/deepagent-human-in-the-loop`

### 21-4. 아키텍처 결정 로그 (2026-04-27 추가분)

#### 결정 20: 타임아웃 의미 해석을 LLM에 위임 (2026-04-27)

**배경**: 타임아웃 시 `onReject()`를 호출하면 에이전트에게 "사용자가 명시적으로 거절"한 것으로 전달됨.

**변경**: `onTimeout()` 분리 → 에이전트에게 "사용자가 응답하지 않음(TIMEOUT)" 메시지 전달 → 에이전트가 재시도/대안/포기를 스스로 판단.

**이유**: "무응답"은 "거절"과 다른 의미. 사용자가 자리를 비운 것일 수도 있고, 보고 있지만 결정을 보류한 것일 수도 있음. LLM이 맥락에 따라 적절한 다음 행동을 결정하는 것이 더 유연함.

#### 결정 21: 멀티턴을 MemorySaver + sessionThreadId로 복구 (2026-04-27)

**배경**: 결정 6에서 hallucination 방지를 위해 각 요청을 독립 세션으로 처리. 이는 멀티턴 대화를 불가능하게 만들었음.

**변경**: `sessionThreadId`를 클래스 필드로 도입, 모든 요청이 같은 thread_id를 재사용.

**3가지 옵션 중 선택:**
1. ~~chatHistory(buildChatPrompt) 복구~~ — tool_use 블록 누락으로 hallucination 유발. 불가.
2. ✅ **MemorySaver + 고정 thread_id** — 도구 호출 포함 완전한 상태 저장. hallucination 없음.
3. ~~커스텀 히스토리 관리~~ — 수동으로 tool_use 블록을 구성해야 함. 복잡하고 라이브러리와의 호환성 보장 어려움.

**LangGraph 공식 문서 근거:**
```python
# 같은 thread_id로 invoke하면 이전 대화 기억
graph.invoke({"messages": [{"role": "user", "content": "hi! i am Bob"}]}, {"configurable": {"thread_id": "1"}})
graph.invoke({"messages": [{"role": "user", "content": "what's my name?"}]}, {"configurable": {"thread_id": "1"}})
# → "Your name is Bob."
```
Ref: https://docs.langchain.com/oss/python/langgraph/add-memory

#### 결정 22: ToolInputParsingException 자동 복구 (2026-04-27)

**배경**: 멀티턴에서 간헐적으로 LLM이 도구 파라미터를 누락하는 에러 발생.

**결정**: catch 블록에서 에러 감지 → 세션 리셋 → 새 thread_id로 1회 재시도.

**트레이드오프**:
- 장점: 사용자 경험 보호 (에러가 보이지 않음)
- 단점: 재시도 시 이전 대화 맥락 유실
- 리스크: 재시도도 실패하면 에러가 사용자에게 노출됨 (2회 연속 실패 확률은 매우 낮음)

### 21-5. GitHub PR 피드백 답변 (게시 예정)

| # | 피드백 | 답변 요약 | Resolve |
|---|--------|----------|---------|
| 1 | 타임아웃 → LLM 위임 | `onTimeout()` callback, distinct `TIMEOUT` message to LLM | ✅ |
| 2 | high risk 태그 제거 | Removed all risk badges | ✅ |
| 3 | 아이콘 전부 제거 | Removed all icons from ToolApprovalModal | ✅ |
| 4 | lsInfo 경로 중복 | Reverted to `name`-only path, also fixed DirectoryListHandler | ✅ |
| 5 | chatHistory / 멀티턴 | MemorySaver + session thread_id, ref: LangGraph docs | ✅ |

### 21-6. 테스트 결과

| # | 시나리오 | 결과 |
|---|---------|------|
| 1 | 타임아웃 60초 → AI 재시도 | ✅ 모달 사라지고 AI가 TIMEOUT 인식 |
| 2 | 멀티턴: 파일 생성 → "방금 만든 파일 수정" | ✅ 같은 thread_id, AI가 파일을 기억하고 file_read → file_replace |
| 3 | 멀티턴 간헐적 에러 → 자동 복구 | ✅ 세션 리셋 후 새 thread로 재시도 성공 |
| 4 | 기존 HITL 동작 (approve/reject) | ✅ 사이드이펙트 없음 |


---

## Phase 22: Session Thread Synchronization (2026-04-27)

### 22-1. 배경 및 문제

스테판의 피드백: "New Chat을 클릭하면 이전 대화 맥락이 초기화되어야 하고, 이전 채팅으로 돌아오면 해당 대화의 메시지가 다시 로드되어야 한다."

**기존 문제점**:
1. `DeepAgentInferencer`가 인스턴스당 단일 `sessionThreadId`를 사용
2. 모든 채팅이 같은 thread_id를 공유하여 맥락이 격리되지 않음 (false positive)
3. 새로고침 시 `MemorySaver`가 JavaScript 힙에만 존재하여 대화 상태 소실
4. `setDeepAgentThread()`가 DeepAgent 초기화 전에 호출되어 무시되는 race condition

### 22-2. 아키텍처 설계

#### 결정 23: conversationId 기반 결정적 thread_id (2026-04-27)

**결정**: thread_id를 `remix-conv-{conversationId}` 형태로 생성하여, 동일 대화에 항상 같은 thread_id가 매핑되도록 함.

```
채팅 A (id: 8aa7d873) → thread_id: remix-conv-8aa7d873-...
채팅 B (id: 29435af9) → thread_id: remix-conv-29435af9-...

채팅 A로 복귀 → thread_id: remix-conv-8aa7d873-... (동일!)
```

**트레이드오프**:
- 장점: 대화별 격리 + 복귀 시 자동 복원
- 장점: 인퍼런서 재생성 없이 thread_id만 교체하는 경량 전환
- 단점: conversationId가 thread_id에 노출됨 (보안 무관)

#### 결정 24: IndexedDB Checkpointer (2026-04-27)

**배경**: `MemorySaver`는 JavaScript 힙 전용이라 새로고침 시 데이터 소실.

**결정**: `BaseCheckpointSaver`를 구현한 `IndexedDBCheckpointSaver` 생성. `MemorySaver` 대신 drop-in 교체.

```
MemorySaver (메모리) → IndexedDBCheckpointSaver (IndexedDB)
- DB: RemixDeepAgentCheckpoints
- Stores: checkpoints (byThread index), writes (byOuterKey, byThread index)
- 직렬화: LangGraph 내장 serde 사용 (Uint8Array)
```

**트레이드오프**:
- 장점: 새로고침/강력 새로고침 후에도 대화 맥락 유지
- 단점: 스토리지 무한 누적 가능 → 향후 cleanup 로직 필요
- 단점: 비동기 I/O (ms 단위) — LLM API 대비 무시할 수준

#### 결정 25: Pending Thread Pattern (2026-04-27)

**배경**: `remix-ai-assistant`의 `initializeStorage()` → `loadConversation()` → `setDeepAgentThread()`가 `DeepAgentInferencer` 생성 전에 실행되어, thread_id 설정이 무시됨.

**결정**: `remixAIPlugin`에 `pendingDeepAgentThreadId` 필드 추가. DeepAgent 미초기화 시 저장하고, 초기화 완료 후 적용.

```
Timeline:
  1. loadConversation("abc") → setDeepAgentThread("abc")
     → inferencer null → pendingDeepAgentThreadId = "remix-conv-abc"
  2. DeepAgentInferencer.initialize() 완료
     → pendingDeepAgentThreadId 발견 → setSessionThreadId("remix-conv-abc")
  3. runAgent() → thread_id: "remix-conv-abc" ✅
```

### 22-3. 변경 파일

| # | 파일 | 변경 내용 |
|---|------|----------|
| 1 | `DeepAgentInferencer.ts` | `setSessionThreadId()` / `getSessionThreadId()` public 메서드 추가, `IndexedDBCheckpointSaver` 사용 |
| 2 | `IndexedDBCheckpointSaver.ts` (신규) | `BaseCheckpointSaver` 구현 — IndexedDB 영속 저장 |
| 3 | `remixAIPlugin.tsx` | `setDeepAgentThread()` 메서드 + `pendingDeepAgentThreadId` 패턴 + methods 배열 등록 |
| 4 | `remix-ai-assistant.tsx` | `newConversation()` / `loadConversation()`에서 `setDeepAgentThread(conversationId)` 호출 |
| 5 | `storage/index.ts` | `IndexedDBCheckpointSaver` export 추가 |

### 22-4. 동작 흐름

```
[New Chat 클릭]
  remix-ai-assistant: newConversation() → currentConversationId = "abc"
  remix-ai-assistant: call('remixAI', 'setDeepAgentThread', 'abc')
  remixAIPlugin: setDeepAgentThread('abc') → inferencer.setSessionThreadId('remix-conv-abc')

[이전 채팅 클릭]
  remix-ai-assistant: loadConversation('xyz')
  remix-ai-assistant: call('remixAI', 'setDeepAgentThread', 'xyz')
  remixAIPlugin: setDeepAgentThread('xyz') → inferencer.setSessionThreadId('remix-conv-xyz')
  
[메시지 전송]
  DeepAgentInferencer: runAgent() with thread_id: 'remix-conv-xyz'
  IndexedDBCheckpointSaver: getTuple() → 이전 checkpoints 복원
  LangGraph: 이전 대화 맥락 기반 응답

[새로고침]
  remix-ai-assistant: loadConversation('xyz') → setDeepAgentThread('xyz')
  → pendingDeepAgentThreadId = 'remix-conv-xyz' (inferencer 아직 없음)
  DeepAgentInferencer: initialize() → pendingDeepAgentThreadId 적용
  IndexedDBCheckpointSaver: getTuple() → IndexedDB에서 복원 ✅
```

### 22-5. 테스트 결과

| # | 시나리오 | 결과 |
|---|---------|------|
| 1 | New Chat → 이전 대화 맥락 격리 | ✅ |
| 2 | 이전 채팅 복귀 → 맥락 복원 | ✅ |
| 3 | 교차 오염 방지 (Alice vs Bob) | ✅ |
| 4 | 브라우저 새로고침 후 맥락 영속 | ✅ |
| 5 | 강력 새로고침 (Cmd+Shift+R) | ✅ |
| 6 | 빠른 채팅 전환 안정성 | ✅ |

### 22-6. 알려진 한계 및 향후 과제

1. **IndexedDB 스토리지 누적**: 매 턴마다 ~7개 checkpoint 생성. 장기 사용 시 cleanup 로직 필요 (오래된 checkpoint 자동 삭제 또는 대화당 최신 N개만 유지)
2. **Private/Incognito 모드**: IndexedDB가 세션 종료 시 삭제됨 — 현재 범위 밖
3. **모델 전환 시**: DeepAgent 전체 재생성으로 새 `IndexedDBCheckpointSaver` 인스턴스 생성. 같은 DB를 사용하므로 데이터는 유지되나, `pendingDeepAgentThreadId`로 thread 재적용 필요
4. **브라우저 "사이트 데이터 삭제"**: IndexedDB 포함 모든 데이터 삭제됨 — 불가피

### 22-7. 스테판 피드백 및 대응

#### 피드백 1: "loading back / continuing an archived conversation doesn't recall history"

**원인 분석**: archived 대화가 **IndexedDB checkpointer 도입 이전**에 생성된 경우, IndexedDB에 checkpoint가 존재하지 않아 AI가 맥락을 복원할 수 없음. 이는 기대 동작 — 새 시스템 도입 이후 생성된 대화에서만 영속성이 보장됨.

**대응**: 도입 이후 생성된 대화에서는 정상 동작 확인 → 해결 완료.

### 22-8. PR #7077 머지 (lanchain_deepagent ← feature/deepagent-human-in-the-loop)

#### 머지 컨플릭트 해결 (5건)

`DeepAgentInferencer.ts`와 `RemixFilesystemBackend.ts`에서 컨플릭트 발생:

| # | 위치 | 해결 방법 |
|---|------|----------|
| 1 | Import: `ToolApprovalGate` vs `ToolSelector` | **양쪽 모두** 유지 — HITL에 ToolApprovalGate, 도구 선택에 ToolSelector 필요 |
| 2 | 인스턴스 변수: `approvalGate` vs `toolSelector` | **양쪽 모두** 유지 |
| 3 | `initialize()`: 인라인 agent 생성 vs `toolSelector.getEssentialTools()` | **lanchain_deepagent 쪽** 유지 — agent 생성은 `createAgentWithTools()`로 이미 이동됨 |
| 4 | `runAgent()`: `langchainMessages` 위치 (try 바깥 vs 안) | **feature 쪽** 유지 — try 밖에서 생성, 바로 아래 try 블록 진입 |
| 5 | `read_file()` 에러 로그 | **feature 쪽** 유지 — 디버깅용 로그 보존 |

#### 추가 수정: `createAgentWithTools()` 내 checkpointer

`lanchain_deepagent` 브랜치의 `createAgentWithTools()` 메서드에서 `new MemorySaver()`를 `new IndexedDBCheckpointSaver()`로 교체. 이는 컨플릭트가 아닌 수동 수정.

#### ToolSelector 통합

`lanchain_deepagent` 브랜치에서 도입된 `ToolSelector` 아키텍처:
- `initialize()`: `toolSelector.getEssentialTools()` → 메타 도구(`get_tool_schema`, `call_tool`) 추출 → `createAgentWithTools(metaTools)` 호출
- `createAgentWithTools()`: 6개 subagent 각각에 specialist 도구 할당 (Etherscan, TheGraph, Alchemy 등)
- 도구 발견은 에이전트가 런타임에 `get_tool_schema` / `call_tool`로 수행 (lazy loading)

#### 머지 전략

**Squash and merge** 사용:
- 이유: 18개 커밋 중 디버깅 로그 추가/삭제 등 중간 과정 커밋이 많아 개별 보존 가치 낮음
- GitHub의 "Rebase and merge"는 커밋을 하나씩 replay하므로 이미 해결된 컨플릭트가 재발
- force push 없이 안전하게 머지 완료

**PR #7077 상태**: ✅ Squash merged into `lanchain_deepagent` (2026-04-28)

### 22-9. 현재 아키텍처 전체 요약 (Phase 22 완료 후)

```
[사용자 입력]
  ↓
[remix-ai-assistant.tsx]
  newConversation() / loadConversation(id)
  → call('remixAI', 'setDeepAgentThread', conversationId)
  ↓
[remixAIPlugin.tsx]
  setDeepAgentThread(id)
  → pendingDeepAgentThreadId (if not initialized)
  → OR inferencer.setSessionThreadId('remix-conv-{id}')
  ↓
[DeepAgentInferencer.ts]
  runAgent() → thread_id: 'remix-conv-{id}'
  ↓
[IndexedDBCheckpointSaver.ts]
  getTuple() → IndexedDB: RemixDeepAgentCheckpoints
  put() → checkpoint 저장
  ↓
[LangGraph deepagents]
  createDeepAgent({ checkpointer, tools: metaTools, subagents: [...] })
  → ToolSelector로 도구 lazy discovery
  → ToolApprovalGate로 HITL 승인
```

*마지막 업데이트: 2026-04-28 07:57 KST*

