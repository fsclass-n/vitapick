"""Generate HTML bodies for the 5 산출물 HWPX documents (inserted into the original blank files by Hangul)."""
H = '#213e33'


import json, re as _re
M = '\u241e'


def _mk(kind, val):
    return M + json.dumps([kind, val], ensure_ascii=False) + M


def _clean(t):
    return _re.sub(r'<[^>]+>', '', t).replace('&amp;', '&').replace('&nbsp;', ' ').strip()


def table(rows, widths=None, head=True):
    return _mk('table', {'rows': [[_clean(c) for c in r] for r in rows], 'widths': widths, 'header': head})


def ul(items):
    return _mk('bullets', [_clean(i) for i in items])


def doc(stage, title, sections):
    blocks = [('sub', '[K-Digital] 심화_생성형 AI와 AWS 클라우드를 활용한 풀스택 & 자동화 실무 개발 Semi-Project'),
              ('title', f'{stage}단계 {title} 산출물'),
              ('table', {'rows': [['항목', '내용'], ['프로젝트', 'vitapick — 공공데이터 기반 헬스케어 & 맞춤형 영양 관리 플랫폼'],
                                  ['수행', '박미금 · 김모란 · 이오리(조장) · 홍기흥 (4인 팀 프로젝트)'], ['저장소', 'github.com/fsclass-n/vitapick'],
                                  ['서비스', 'vitapick.onrender.com · vitapick.netlify.app · vitapick-api.onrender.com/docs']], 'widths': [18, 82]})]
    for i, (h, content) in enumerate(sections, 1):
        blocks.append(('h1', f'{i}. {h}'))
        for part in content.split(M):
            if not part.strip():
                continue
            if part.startswith('['):
                k, v = json.loads(part); blocks.append((k, v))
            elif '<br>' in part:
                blocks.append(('code', [_clean(x) for x in part.split('<br>')]))
            else:
                blocks.append(('p', _clean(part)))
    return blocks


DOCS = {}

DOCS['01_기획분석_산출물'] = doc(1, '기획·분석', [
    ('프로젝트 개요', '<p align="left">공공데이터 포털의 식품영양 정보를 자동으로 동기화하고, 사용자의 식단 기록과 신체 정보를 바탕으로 개인별 권장 영양소를 계산·분석하여 직관적인 리포트로 제공하는 헬스케어 웹 서비스입니다. 의료 진단이 아닌 참고용 추정치를 제공합니다.</p>'),
    ('배경 및 문제 정의', table([
        ['구분', '현상', '원인', '해결 방향'],
        ['입력 피로', '식단 앱 사용 중 기록을 중단', '음식마다 영양값을 직접 찾아 입력', '공공데이터 검색 → 영양값 자동 입력'],
        ['데이터 파편화', '공공 식품영양 데이터 약 34만 건', '출처마다 형식·인증·단위가 다름', '수집·정제를 자동화해 100g 기준으로 통일'],
        ['획일적 목표', '누구에게나 "하루 2,000kcal"', '나이·체격·활동량 미반영', 'Mifflin-St Jeor 공식 기반 개인 목표'],
    ], [16, 26, 28, 30])),
    ('목표 및 핵심 기능', ul(['AI 문장 식단 기록: 한 문장 → Gemini(실패 시 규칙 분석기)가 항목 분리, 영양값은 공공데이터가 계산',
                           '공공데이터 자동 동기화: 식품의약품안전처 식품영양성분DB를 주기적으로 수집·정제·적재',
                           '개인 맞춤 영양 목표: 나이·성별·키·몸무게·활동량 → 하루 열량과 탄수화물·단백질·지방 목표',
                           '직관적 리포트: 목표 대비 오늘의 진행률, 최근 7일 열량 추이, 상황별 안내 문구'])),
    ('대상 사용자', table([['사용자', '목적', '주요 화면'], ['일반 사용자', '식단 기록과 영양 균형 확인', '대시보드 · 식단 기록 · 영양 리포트'],
                        ['관리자', '회원 조회·권한 변경·회원 삭제', '회원 관리'], ['평가자(면접관)', '가입 없이 기능 체험', '테스트 계정 원클릭 로그인']], [20, 40, 40])),
    ('기능 요구사항', table([
        ['ID', '요구사항', '세부 내용', '우선순위'],
        ['F-01', '로그인 화면', '헬스 체크인 디자인(ECG 그리드 · 바이탈 모니터 · 슬라이드 탭)', '필수'],
        ['F-02', '테스트 계정', '일반 사용자 · 관리자 버튼 클릭 시 자동 로그인', '필수'],
        ['F-03', '소셜 로그인', 'Google · Naver · Kakao OAuth', '필수'],
        ['F-04', '비밀번호 정책', '영문 대·소문자, 숫자, 특수문자 조합 8자 이상', '필수'],
        ['F-05', '모바일 GNB', '햄버거 ↔ X 애니메이션, 우측 → 좌측 드로어', '필수'],
        ['F-06', '디자인', '헬스케어 톤, 제목/본문 서체 이원화, FontAwesome, Top 버튼', '필수'],
        ['F-07', '식단 기록', 'AI 문장 기록 + 공공데이터 음식 검색, 영양값 자동 입력, 기록 조회·삭제', '필수'],
        ['F-08', '영양 목표·리포트', '개인 목표 계산, 목표 대비 진행률, 7일 추이', '필수'],
        ['F-09', '관리자', '회원 목록 조회, 권한 변경, 회원 삭제(3단계 권한)', '필수'],
        ['F-10', '데이터 동기화', '공공데이터 자동 수집·정제·적재', '필수'],
        ['F-11', '회원 탈퇴·삭제', '비밀번호 재확인 후 탈퇴, 관리자 회원 삭제, 보호 규칙', '필수'],
    ], [9, 20, 56, 15])),
    ('비기능 요구사항', table([
        ['구분', '요구사항'], ['보안', '비밀번호 해시 저장, 권한은 서버에서 검사, 비밀키는 저장소에 커밋하지 않음'],
        ['환경', '.env 하나로 로컬·서버 관리, .env.example에 플랫폼별 등록 변수 구분, requirements.txt 단일 관리'],
        ['배포', 'Netlify · Render는 각 영역 파일이 바뀔 때만 자동 배포'], ['DB', '로컬과 운영 모두 TiDB 클러스터 직접 연동'],
        ['접근성', '키보드 조작, 화면 낭독기 속성, 움직임 줄이기 설정 존중'], ['고지', '모든 분석 화면에 "의료 진단이 아닌 추정치" 표시']], [16, 84])),
    ('범위', table([['포함', '제외 (후속 과제)'],
                  ['식단 기록(AI 문장) · 영양 목표 · 리포트 · 회원 관리 · 탈퇴·삭제 · OAuth · 공공데이터 동기화 · 3곳 분리 배포',
                   '질환·임신 등 임상적 개인화, 로그인 시도 제한, 계정 복구, 전체 34만 건 동기화, pandas 통계 분석']], [50, 50])),
    ('기술 스택 선정', table([
        ['영역', '선택', '선정 이유'], ['Frontend', 'React 19 · Vite · Tailwind CSS v4', 'SSR 불필요, 정적 호스팅만으로 배포'],
        ['Backend', 'Python 3.11 · FastAPI · SQLAlchemy 2.0', '타입 기반 요청 검증, 자동 API 문서, 바인딩 파라미터로 SQL 인젝션 차단'],
        ['DB', 'TiDB Cloud (MySQL 호환)', '개발·운영 같은 엔진으로 환경 차이 제거, 서버리스 무료 티어'],
        ['데이터 수집', 'requests + 공식 API', '공식 API가 있으면 화면 크롤링 대신 API 사용(안정성·약관)'],
        ['Infra', 'Docker · Render · Netlify · GitHub Actions', '서비스와 배치 분리, 경로 기반 조건부 배포']], [16, 34, 50])),
    ('데이터 출처 분석', ul(['출처: 식품의약품안전처 식품영양성분DB (식품안전나라 I2790 → 공공데이터포털 이관)',
                          '주요 필드: 식품코드, 식품명, 영양성분 함량 기준량(SERVING_SIZE), 에너지·단백질·지방·탄수화물',
                          '특이사항: 1회 제공량 기준 값이며 g/mL 단위가 섞여 있고, 일부 행은 영양값이 비어 있음 → 정제 규칙 필요'])),
    ('단계별 일정', table([['단계', '기간', '주요 산출물'], ['1 기획·분석', '11/05(목) ~ 11/06(금)', '요구사항 · 기술 스택'],
                       ['2 설계', '11/09(월) ~ 11/10(화)', '서비스 설계서 · DB · API'], ['3 구현', '11/11(수) ~ 11/18(수)', '프런트 · 백엔드 · 수집기 · 테스트'],
                       ['4 배포', '11/19(목) ~ 11/23(월)', '운영 배포 · 운영 검증'], ['5 피드백', '진행일지 기준', '발표 자료 · 영상 · 포트폴리오 · 회고']], [20, 35, 45])),
    ('위험 요소와 대응', table([['위험', '영향', '대응'],
                           ['무료 서버에서 대량 수집', '사용자 요청 지연·재시작', '수집을 GitHub Actions 배치로 분리'],
                           ['공공데이터 단위 불일치', '잘못된 영양 비교', '100g 환산, g 단위만 채택, 빈값 제외'],
                           ['공용 관리자 계정', '실제 회원 정보 노출·변경', '테스트 관리자 읽기 전용(viewer)·마스킹(서버 검사)'],
                           ['의료 오해', '사용자 혼동', '추정치 고지, 18세 이상만 공식 적용']], [26, 28, 46])),
])

DOCS['02_설계_산출물'] = doc(2, '설계', [
    ('시스템 아키텍처', '<p align="left">React SPA(Netlify · Render Static) → FastAPI(Render, Docker) → TiDB Cloud. 공공데이터 수집은 서비스 서버가 아닌 GitHub Actions가 매주 실행하여 같은 DB에 적재합니다.</p>' +
     table([['구성 요소', '역할', '배포'], ['React SPA', '화면, 라우팅, API 호출(VITE_API_URL)', 'Netlify · Render Static'],
            ['FastAPI', '인증 · RBAC · 식단 · AI 문장 분석 · 영양 목표 · 관리자 API', 'Render Web Service(Docker)'],
            ['TiDB Cloud', 'users · meals · foods · oauth_tickets', 'TLS 인증서 검증 연결'],
            ['수집 배치', 'Extract → Validate → Transform → Load', 'GitHub Actions(cron + 수동)']], [20, 50, 30])),
    ('화면 설계', table([['화면', '경로', '주요 구성', '권한'],
                     ['홈', '/', '서비스 소개, 오늘의 균형 카드, 이용 방법', '공개'],
                     ['로그인/회원가입', '/login', '헬스 체크인 UI, 탭, 비밀번호 정책, 소셜 3종, 테스트 계정', '공개'],
                     ['대시보드', '/dashboard', '영양 균형 지수, 4대 영양 진행률, 오늘의 식단, 케어 노트', '로그인'],
                     ['식단 기록', '/journal', 'AI 문장 기록(초안 확인), 음식 검색 자동완성, 기록 목록·삭제', '로그인'],
                     ['영양 리포트', '/insights', '오늘의 균형, 최근 7일 열량, 프로필 입력, 회원 탈퇴', '로그인'],
                     ['이용 안내', '/policy', '데이터·AI 처리 안내, 영양 정보 고지', '공개'],
                     ['회원 관리', '/admin', '회원 목록, 권한 변경, 회원 삭제, 비관리자는 "관리자 전용 화면" 안내', '관리자']], [16, 14, 52, 18])),
    ('DB 설계', table([['테이블', '주요 컬럼', '제약·인덱스'],
                     ['users', 'id, email, name, password_hash, role, provider, provider_id, age, biological_sex, height_cm, weight_kg, activity_level, created_at', 'email UNIQUE, (provider, provider_id) UNIQUE'],
                     ['meals', 'id, user_id, food_name, meal_type, eaten_at, serving_g, calories, protein, carbs, fat', 'user_id FK, (user_id, eaten_at) 인덱스'],
                     ['foods', 'id, source_id, name, calories, protein, carbs, fat (100g 기준), updated_at', 'source_id UNIQUE, name 인덱스'],
                     ['oauth_tickets', 'code_hash(SHA-256), user_id, expires_at(2분)', 'code_hash PK']], [16, 56, 28])),
    ('API 설계 (22개)', table([['그룹', '메서드 · 경로', '설명', '권한'],
                     ['Health', 'GET /api/health', '헬스체크', '공개'],
                     ['Auth', 'POST /api/auth/register · /login', '회원가입(정책 검사) · 로그인', '공개'],
                     ['Auth', 'GET · DELETE /api/auth/me, GET /demo-status, POST /demo-login', '내 정보 · 회원 탈퇴 · 테스트 계정 상태·로그인', '공개/로그인'],
                     ['OAuth', 'GET /oauth/providers · /{provider}/start · /{provider}/callback, POST /oauth/exchange', '제공자 상태 · 시작 · 콜백 · 일회용 코드 교환', '공개'],
                     ['Nutrition', 'GET /api/nutrition/targets, PATCH /api/nutrition/profile', '목표 조회 · 프로필 저장', '로그인'],
                     ['Meals', 'GET · POST /api/meals, DELETE /api/meals/{id}', '본인 식단 조회 · 추가 · 삭제', '로그인(본인)'],
                     ['AI 분석', 'POST /api/meals/parse, GET /api/meals/parse/status', '문장 → 식단 항목 분리(Gemini+규칙 대체) · 엔진 상태', '로그인/공개'],
                     ['Foods', 'GET /api/foods?q=', '식품 검색(2~80자, LIKE 이스케이프)', '공개'],
                     ['Admin', 'GET /api/admin/users, PATCH /{id}/role, DELETE /{id}', '회원 목록 · 권한 변경 · 회원 삭제', '조회: 관리자·뷰어 / 변경·삭제: 관리자']], [12, 40, 33, 15])),
    ('인증 · 권한 설계', ul(['비밀번호: Argon2 해시, 대·소문자·숫자·특수문자 8~128자(화면·서버 이중 검증)',
                          'JWT(HS256, 12시간), 프런트는 탭 단위 sessionStorage에 보관',
                          'OAuth: state 쿠키(HttpOnly·10분)로 CSRF 방지 → 콜백 → 2분 일회용 코드(해시만 저장) → 교환 시 JWT 발급, 검증된 이메일만 허용, 기존 계정 자동 연결 금지',
                          'RBAC: 모든 관리자 API가 역할 재검사, 본인 권한 변경·마지막 실제 관리자 강등 차단',
                          '테스트 관리자(viewer): 회원 목록만 열람(실제 회원 마스킹), 쓰기 API는 403, 매 로그인 viewer로 강제',
                          '회원 탈퇴·삭제: 이메일 계정은 비밀번호 재확인, 식단·OAuth 티켓 연쇄 삭제, 테스트 계정·본인·마지막 관리자 차단'])),
    ('영양 목표 알고리즘', table([['단계', '식', '비고'],
                     ['기초대사량', '10×체중(kg) + 6.25×키(cm) − 5×나이 + (남 +5 / 여 −161)', 'Mifflin-St Jeor'],
                     ['하루 열량', 'BMR × 활동계수(1.2 · 1.375 · 1.55 · 1.725)', '10kcal 단위 반올림'],
                     ['3대 영양소', '탄수화물 50%÷4 · 단백질 20%÷4 · 지방 30%÷9', 'kcal → g'],
                     ['입력 범위', '18~100세, 키 100~230cm, 몸무게 30~300kg', '미입력 시 일반 성인 예시 2,000kcal']], [18, 57, 25])),
    ('데이터 파이프라인 설계', table([['단계', '처리', '실패 처리'],
                     ['Extract', '공공데이터포털 API, serviceKey, 페이지당 최대 500건', 'HTTP 오류 시 중단'],
                     ['Validate', 'resultCode "00", header/body.items 구조 확인', '코드·구조 불일치 시 실패'],
                     ['Transform', '1회 제공량 → 100g 기준, g 단위만, 빈값·NaN·음수 제외', '적재 가능한 행 0건이면 실패'],
                     ['Load', 'source_id 기준 페이지 단위 일괄 upsert', '재실행해도 중복 없음(멱등)']], [16, 56, 28])),
    ('배포 · 환경 변수 설계', table([['대상', '변수', '비고'],
                     ['Render(API)', 'APP_ENV, DATABASE_URL, JWT_SECRET, FRONTEND_URL, BACKEND_URL, DEMO_ACCOUNTS_ENABLED, ADMIN_EMAIL/PASSWORD, GEMINI_API_KEY/MODEL, OAuth ID/Secret', '운영에서 필수값 누락 시 기동 거부'],
                     ['Netlify · Render Static', 'VITE_API_URL', '브라우저에 포함되는 공개 값'],
                     ['GitHub Actions', 'DATABASE_URL, MFDS_API_KEY (Secrets), SYNC_MAX_PAGES (Variable)', '주간 동기화'],
                     ['로컬', '.env 하나', '.gitignore로 커밋 제외']], [20, 55, 25])),
])

DOCS['03_구현_산출물'] = doc(3, '구현', [
    ('구현 범위 요약', table([['영역', '구현 내용', '주요 파일'],
                     ['Frontend', '화면 7종(정책 페이지 포함), 반응형 GNB·드로어, 디자인 시스템', 'frontend/src/main.jsx, style.css, api.js'],
                     ['Backend', 'API 22개, 인증·RBAC·OAuth·AI 문장 분석, 영양 목표 계산', 'backend/main.py, meal_parser.py, models.py, db.py'],
                     ['Data', '공공데이터 ETL, 페이지 단위 upsert', 'rpa/sync_foods.py'],
                     ['Test', '백엔드 자동 테스트 15개', 'tests/test_api.py'],
                     ['CI · 배포', '주간 동기화, Docker, 조건부 배포', '.github/workflows/sync-foods.yml, Dockerfile, render.yaml, netlify.toml']], [14, 46, 40])),
    ('디렉터리 구조', '<p align="left" style="font-family:Consolas;font-size:9pt">vitapick/<br>├── backend/ (main.py · meal_parser.py · models.py · db.py)<br>├── frontend/src/ (main.jsx · api.js · style.css)<br>├── rpa/sync_foods.py<br>├── tests/test_api.py<br>├── .github/workflows/sync-foods.yml<br>├── docs/ (설계서 · 진행일지 · 산출물 · 발표 자료 · 영상 · pdf)<br>├── index.html (GitHub Pages 포트폴리오)<br>└── Dockerfile · render.yaml · netlify.toml · requirements.txt</p>'),
    ('프런트엔드 구현', ul(['로그인: 헬스 체크인 디자인(ECG 그리드 배경 · 바이탈 모니터 카드 · 슬라이드 탭 · 비밀번호 표시 전환), 소셜·테스트 계정 버튼은 서버 설정을 조회해 활성화',
                          'GNB: 햄버거 3선이 X로 회전, 우측 드로어(배경·ESC 닫기, 열린 동안 스크롤 잠금, 닫힌 메뉴는 inert)',
                          '디자인: Gowun Batang(제목) · Noto Sans KR(본문) · Manrope(수치), FontAwesome, 푸터 Top 버튼, prefers-reduced-motion 대응',
                          '식단 기록: 문장 입력 → 서버 분석 → 항목 초안 확인·수정 후 일괄 저장, 엔진 상태 표시(Gemini/규칙), 수동 입력은 300ms 디바운스 검색·100g 기준 자동 계산',
                          '리포트: 목표 대비 진행률 막대(role="progressbar"), 최근 7일 열량 차트(aria-label), 프로필 저장 시 목표 재계산',
                          '계정 관리: 리포트 하단 회원 탈퇴 — 이메일 계정은 비밀번호 재확인, 소셜 계정은 확인만, 테스트 계정은 안내 표시',
                          '회원 관리: 권한 변경, 회원 삭제(인라인 2단계 확인), 체험 모드 안내, 비관리자의 /admin 접근 시 "관리자 전용 화면입니다" 안내'])),
    ('백엔드 구현', ul(['요청 검증: Pydantic Field 범위(열량 0~20,000, 섭취량 0~10,000g), NaN·Infinity 거부, 식사 구분 값 검사',
                       '데이터 격리: 식단 조회·삭제는 본인 기록만, 타인 기록 삭제 시 404(존재 여부 숨김)',
                       '식품 검색: LIKE 와일드카드(%·_) 이스케이프로 문자 그대로 검색',
                       'CORS 허용 목록: FRONTEND_URL, Netlify 주소, 로컬 개발 주소',
                       '초기 관리자: 비밀번호 정책 미충족 시 경고 후 생성만 건너뜀(서버는 정상 기동)',
                       'AI 문장 분석: Gemini 구조화 출력으로 음식·구분·섭취량 분리, 키 없음·실패 시 한국어 규칙 분석기로 대체, 사용자당 10분 20회 제한, 영양값은 식품 DB 100g 기준값으로만 계산',
                       '회원 탈퇴·삭제: 공통 삭제 루틴(OAuth 티켓 → 식단 → 회원), 이메일 계정은 비밀번호 검증, 테스트 계정·본인·마지막 실제 관리자 차단'])),
    ('데이터 수집기 구현', ul(['포털 응답 검사(resultCode, header/body 구조, totalCount), 짧은 페이지·빈 결과 감지',
                           '페이지 내부 source_id 중복 제거 후 IN 조회 1회로 기존 행 확인 → 갱신/추가(N+1 제거)',
                           '실패 시 API 키가 포함될 수 있는 예외 내용 대신 원인 안내만 출력',
                           '1차 적재: 원본 5,000행 → 1,095행(제외 대부분은 탄수화물·지방 빈칸)'])),
    ('테스트 결과 (pytest 15개 통과)', table([['No', '테스트', '검증 내용', '결과'],
                     ['1', 'test_auth_policy_and_private_meals', '약한 비밀번호 거부, 미인증 401, 타인 기록 삭제 404', '통과'],
                     ['2', 'test_netlify_origin_can_call_api', 'Netlify 출처 CORS 사전 요청 허용', '통과'],
                     ['3', 'test_admin_role_change_is_enforced_server_side', '일반 사용자 403, 본인 변경 차단, 권한 변경 반영', '통과'],
                     ['4', 'test_oauth_ticket_is_one_time_and_expires', '교환 코드 1회성·만료', '통과'],
                     ['5', 'test_personalized_targets_are_private_and_estimated', '1,820kcal 산출, 사용자별 분리, 12세 입력 거부', '통과'],
                     ['6', 'test_food_sync_normalizes_only_valid_gram_servings', '100g 환산, mL·NaN 제외', '통과'],
                     ['7', 'test_portal_api_page_uses_issued_key_and_checks_response', '키 이중 인코딩 방지, 오류 코드 처리', '통과'],
                     ['8', 'test_portal_sync_upserts_across_pages_without_duplicates', '여러 페이지 멱등 upsert', '통과'],
                     ['9', 'test_invalid_admin_password_skips_bootstrap_without_crashing', '정책 위반 시 기동 유지, 정상 시 관리자 생성', '통과'],
                     ['10', 'test_demo_accounts_work_in_production_and_demo_admin_is_read_only', '운영 테스트 계정, 마스킹, 테스트 관리자 읽기 전용', '통과'],
                     ['11', 'test_meal_sentence_is_split_and_nutrients_come_from_food_db', '문장 → 항목 분리, 영양은 식품 DB에서만 계산', '통과'],
                     ['12', 'test_gemini_structures_the_sentence_and_falls_back_to_rules', 'Gemini 구조화 출력 · 실패 시 규칙 분석기 대체', '통과'],
                     ['13', 'test_withdraw_requires_password_and_removes_user_data', '비밀번호 재확인, 탈퇴 시 식단·티켓·회원 삭제', '통과'],
                     ['14', 'test_withdraw_blocked_for_demo_and_last_admin', '테스트 계정·마지막 관리자 탈퇴 차단', '통과'],
                     ['15', 'test_admin_can_delete_member_but_not_self_or_demo', '관리자 회원 삭제, 본인·테스트 계정 차단', '통과']], [6, 40, 44, 10])),
    ('구현 중 이슈와 해결', table([['이슈', '원인', '해결'],
                     ['검색으로 고른 음식 저장 실패', '영양값이 소수점 둘째 자리인데 입력칸이 0.1 단위', '입력 단위를 임의 소수로 허용'],
                     ['닫힌 드로어 그림자가 데스크톱에 보임', '화면 밖 요소의 box-shadow가 번짐', '닫힘 상태에서 그림자 제거·visibility hidden'],
                     ['/admin 접근 시 대시보드로 조용히 이동', '비관리자 라우트 처리 미흡', '"관리자 전용 화면입니다" 안내 화면 추가']], [28, 36, 36])),
    ('요구사항 추적표', table([['ID', '요구사항', '구현 위치', '상태'],
                     ['F-01~04', '로그인·테스트 계정·소셜·비밀번호 정책', 'main.jsx Login, main.py auth/oauth', '완료'],
                     ['F-05~06', 'GNB·디자인', 'main.jsx App, style.css', '완료'],
                     ['F-07', '식단 기록', 'main.jsx Journal, /api/meals·meals/parse, meal_parser.py', '완료'],
                     ['F-08', '영양 목표·리포트', 'main.jsx Insights, nutrition_targets()', '완료'],
                     ['F-09', '관리자', 'main.jsx Admin, /api/admin/*', '완료'],
                     ['F-10', '데이터 동기화', 'rpa/sync_foods.py, sync-foods.yml', '완료(일부 범위)'],
                     ['F-11', '회원 탈퇴·삭제', 'DELETE /api/auth/me · /api/admin/users/{id}', '완료']], [12, 34, 42, 12])),
])

DOCS['04_배포_산출물'] = doc(4, '배포', [
    ('배포 구성', table([['구성', '주소', '방식', '자동 배포 조건'],
                     ['프런트엔드', 'vitapick.onrender.com', 'Render Static', 'main 브랜치 반영'],
                     ['프런트엔드', 'vitapick.netlify.app', 'Netlify(netlify.toml)', 'frontend/ · netlify.toml 변경 시'],
                     ['백엔드 API', 'vitapick-api.onrender.com', 'Render Web Service(Docker)', 'backend/ · rpa/ · requirements.txt · Dockerfile 변경 시'],
                     ['DB', 'TiDB Cloud vitapick 클러스터', 'TLS 연결', '—'],
                     ['수집 배치', 'GitHub Actions', 'Sync public food data', '매주 월 11:30 KST + 수동'],
                     ['포트폴리오', 'fsclass-n.github.io/vitapick', 'GitHub Pages(index.html)', 'main 반영']], [14, 28, 26, 32])),
    ('배포 절차', ul(['TiDB: vitapick 데이터베이스 생성 → 서버 기동 시 테이블 자동 생성(create_all)',
                     'Render: Docker Web Service 생성, 환경 변수 등록(DATABASE_URL · JWT_SECRET · FRONTEND_URL · BACKEND_URL · DEMO_ACCOUNTS_ENABLED 등), 헬스체크 /api/health',
                     'Netlify: 저장소 연결, netlify.toml이 빌드 명령·게시 폴더·VITE_API_URL 지정',
                     'GitHub Actions: Secrets(DATABASE_URL, MFDS_API_KEY) 등록 → 수동 실행으로 동기화 확인',
                     'OAuth: 제공자 콘솔에 https://vitapick-api.onrender.com/api/auth/oauth/{provider}/callback 등록'])),
    ('운영 검증 결과', table([['항목', '방법', '결과'],
                     ['API 헬스체크', 'GET /api/health', '200 OK'],
                     ['CORS', 'Render·Netlify 출처에서 OPTIONS 사전 요청', '200, 허용 출처 헤더 확인'],
                     ['DB 연결', '운영 API 식품 검색 결과와 운영 DB 직접 조회 비교', '결과 수 일치'],
                     ['데이터 적재', '로컬 실행 + GitHub Actions 수동 실행', '1,095행 적재, 워크플로 성공'],
                     ['테스트 계정', '운영에서 일반·관리자 로그인, 관리자 API 호출', '일반 403, 테스트 관리자 마스킹·읽기 전용(쓰기 403)'],
                     ['AI 문장 분석', 'GET /api/meals/parse/status', 'ai: true (Gemini 엔진)'],
                     ['프런트', 'Render·Netlify 홈·/login 접속', '모두 200']], [18, 50, 32])),
    ('배포 트러블슈팅', table([['증상', '원인', '조치', '재발 방지'],
                     ['Netlify 배포 전부 Canceled, 404', '빌드 캐시가 없으면 이전 커밋 = 현재 커밋으로 전달되어 "변경 없음" 판단', '두 값이 같으면 빌드하도록 조건 추가', '실제 커밋 3쌍으로 규칙 재현 검증'],
                     ['Netlify 출처 CORS 400', '허용 목록에 Netlify 주소 누락', '허용 목록 추가', 'CORS 회귀 테스트'],
                     ['운영 검색 0건', 'TiDB 연결 문자열이 다른 클러스터를 가리킴(같은 게이트웨이 호스트)', '로컬·Render·Actions 연결 정보 통일', '배포 후 API·DB 결과 대조'],
                     ['Render 기동 실패(status 3)', '초기 관리자 비밀번호 정책 위반 시 서버 종료', '경고 후 생성만 건너뜀', '회귀 테스트'],
                     ['공공데이터 수집 불가', 'API 이관(인증·응답 구조·페이지 한도 변경)', '포털 API로 수집기 재작성, 한도 500 실측', 'mock 응답 테스트'],
                     ['Render 서브도메인 회수 불가', '이름 변경으로 주소가 안 바뀌고 삭제된 이름은 유예 기간 동안 점유(재생성 시 자동 접미사)', 'vitapick 리브랜딩으로 새 계정에 이관, TiDB 스키마 복제 후 DATABASE_URL 교체', '서비스 주소는 render.yaml과 코드 설정에서 함께 관리']], [22, 34, 22, 22])),
    ('변경 사항', ul(['AWS S3 미사용 결정에 따라 관련 코드·의존성·변수 제거',
                     '운영에서도 테스트 계정 사용 가능하도록 DEMO_ACCOUNTS_ENABLED 기반으로 변경, 테스트 관리자 읽기 전용(viewer)',
                     'carepick → vitapick 리브랜딩: 저장소·Render 서비스·TiDB 스키마·Netlify·포트폴리오 일괄 이관(구 계정 → 신규 계정)',
                     '경로 기반 조건부 배포로 문서만 바뀐 커밋은 재배포 없음'])),
    ('운영 점검 체크리스트', ul(['배포 후 헬스체크와 두 프런트 출처의 CORS 사전 요청 확인',
                              '운영 API와 DB에 같은 질의를 보내 결과 수 비교',
                              '무료 플랜 첫 접속 지연(약 30초) 대비: 시연 전 헬스체크로 서버 깨우기',
                              '비밀키는 대시보드·Secrets에만 등록, 저장소·로그에 노출 금지'])),
])

DOCS['05_피드백_산출물'] = doc(5, '피드백', [
    ('최종 산출물 목록', table([['산출물', '위치', '설명'],
                     ['발표 자료', 'docs/프로젝트_발표자료.pptx · docs/pdf/프로젝트_발표자료.pdf', '16장, 운영 화면 캡처·다이어그램·발표자 노트'],
                     ['10분 발표·시연 영상', 'docs/video/carepick_final.mp4 · .srt', 'PPT → 일반 사용자 → 관리자 → 회고, 자막 152개'],
                     ['3분 하이라이트', 'docs/video/vitapick_highlight_3min.mp4', '계정 비교 장면 9개, 3:01'],
                     ['포트폴리오 사이트', 'fsclass-n.github.io/vitapick (index.html)', '영상 제자리 재생, 계산기, 권한 비교'],
                     ['README · About', '저장소 첫 화면', '배지, 아키텍처, 기술적 난관, API, 디렉터리'],
                     ['진행일지 · 산출물', 'docs/*.hwpx · docs/산출물 · docs/pdf', '단계별 진행 기록과 산출물']], [20, 42, 38])),
    ('영상 검증 결과', table([['항목', '기준', '결과'], ['길이', '10:00 ±0.1초', '600.02초'], ['형식', '1920×1080, 30fps, H.264 + AAC 스테레오', '통과'],
                           ['음성', '36개 장면 모두 내레이션 확인, −16 LUFS', '통과(−16.0 LUFS)'], ['깜박임', '한 프레임 번쩍임 0건', '통과'],
                           ['용량', '본편 95MB 이하, 하이라이트', '58.5MB / 12.9MB']], [18, 50, 32])),
    ('포트폴리오 점검 결과 (21개 항목 통과)', ul(['썸네일 자리에서 영상 재생(위치·크기 유지), 챕터 클릭 이동, 진행에 따라 켜지는 ECG 타임라인',
                                          '종료 후 다시 재생/썸네일로 복귀, 한 영상 재생 시 다른 영상 자동 정지',
                                          '영양 목표 계산기(기본 1,820kcal, 재계산 확인), 권한 비교 전환',
                                          '모바일 가로 넘침 없음, 햄버거 드로어 열기·닫기, 모바일 인라인 재생, 실패 요청·콘솔 오류 없음'])),
    ('회고 (KPT)', table([['구분', '내용'],
                       ['Keep', '보안을 화면이 아닌 서버에서 강제, 추측 대신 실측(페이지 한도·응답 구조), 배포 후 종단 간 검증 습관'],
                       ['Problem', '초기 배포 검증을 응답 코드에서 멈춰 데이터 불일치를 늦게 발견, 공공데이터 일부(원본 5,000행 범위)만 동기화'],
                       ['Try', '배포 체크리스트에 데이터 검증 포함, 증분 동기화로 전체 데이터 확보, 프런트엔드 자동 테스트 추가']], [14, 86])),
    ('피드백 반영 내역', table([['피드백', '반영'],
                       ['데이터 출처가 바뀜(I2790 → 포털)', '수집기 재작성, 문서·설계서 동기화'],
                       ['S3는 사용하지 않음', '관련 코드·변수 제거'],
                       ['운영에서도 테스트 계정 필요', '테스트 관리자 읽기 전용(viewer) 권한과 함께 활성화'],
                       ['식단 입력이 번거로움', 'AI 문장 기록 추가 — Gemini + 규칙 분석기, 영양값은 공공데이터가 계산'],
                       ['계정 관리 기능 부재', '회원 탈퇴(비밀번호 재확인)·관리자 회원 삭제(본인·테스트 계정·마지막 관리자 보호)'],
                       ['로그인 화면 개선', '헬스 체크인 콘셉트로 재디자인, 테스트 계정 원클릭 버튼 2종'],
                       ['carepick → vitapick', '저장소·서비스·DB·포트폴리오·문서 일괄 리브랜딩 및 계정 이관'],
                       ['다른 프로젝트와 레이아웃 차별화', '진단 리포트 콘셉트의 포트폴리오(세로 내비게이션·ECG·계산기)'],
                       ['영상 계정 비교 강조', '일반/관리자 비교 시연, "관리자 전용 화면"·서버 거부 메시지 화면 노출']], [40, 60])),
    ('향후 개선 과제', table([['구분', '과제'],
                       ['단기', 'UPDATE_DATE 기반 증분 동기화, Alembic 마이그레이션, 로그인 시도 제한'],
                       ['중기', 'pandas 기반 주간 영양 통계·이상치 탐지, 전문 검색 인덱스로 검색 정확도 개선, 프런트엔드 테스트'],
                       ['장기', 'LLM 자연어 식단 입력 → 공공데이터 영양값 자동 매핑, Docker 이미지 그대로 AWS 이관, 영상 파일 Git LFS/Release 이전']], [14, 86])),
    ('결론', '<p align="left">vitapick은 공공데이터를 자동으로 정제·적재하고, 서버가 지키는 권한 구조 위에서 개인 맞춤 영양 목표와 리포트를 제공합니다. 운영 배포 후 실제 응답을 대조하는 검증으로 배포 환경의 문제를 찾아 해결했으며, 발표 자료·영상·포트폴리오로 결과를 정리했습니다.</p>'),
])

