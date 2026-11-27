"""Generate docs/video/영상_대본_및_연출가이드.md from timing.json (actual narration timing).

usage: python gen_guide.py WORK_DIR
"""
import json
import sys
from pathlib import Path

import video_scenes as v

WORK = Path(sys.argv[1])
scenes = json.loads((WORK / 'timing.json').read_text(encoding='utf-8'))
DOC = Path(__file__).resolve().parents[1] / '영상_대본_및_연출가이드.md'

SCREEN = {
    'site': 'healthpick.onrender.com', 'docs': 'healthpick-api.onrender.com/docs', 'actions': 'GitHub Actions',
}
ACTION = {
    'd01': '홈 히어로 제목 → 배지·대시보드 카드 강조 → 서비스 소개로 스크롤',
    'd02': '헤더 `로그인` → 브랜드 패널 → 소셜 버튼 → 테스트 계정 박스 강조',
    'd03': '`회원가입` 탭 → 이름·이메일·약한 비밀번호(healthpick1) 입력 → `계정 만들기` → 정책 오류 강조 (서버로 전송되지 않음)',
    'd04': '`로그인` 탭 → `일반 사용자` 버튼 강조 → 클릭',
    'd05': '영양 진행률 카드 4개 → 상단 메뉴 3개 강조',
    'd06': '`식단 기록` → 음식 이름 `현미` 입력 → 공공데이터 검색 결과 → 첫 결과 선택 → 자동 입력된 영양값 강조',
    'd07': '식사 구분 `점심` → `기록 추가하기` → 새 기록 행 강조',
    'd08': '`영양 리포트` → 오늘의 영양 균형 → 최근 7일 차트의 오늘 막대 강조',
    'd09': '프로필 입력 영역 → `나의 목표 계산하기` → 저장 완료 문구',
    'd10': '모바일(390px) 대시보드 → 메뉴 버튼 → 드로어 메뉴 3개 강조 → 배경 눌러 닫기',
    'd11': '주소 표시줄 연출 `/admin` 입력 → 앱 내부 이동 → "관리자 전용 화면입니다" 강조',
    'a01': '`로그아웃` → `로그인` → 테스트 계정 박스 → `관리자` 클릭',
    'a02': '상단 메뉴 4개 → `회원 관리` 강조',
    'a03': '`회원 관리` → 체험 모드 안내 → 마스킹된 실제 회원 2명 강조',
    'a04': '`테스트 사용자` 권한 → 관리자 → 다시 일반 사용자 → 본인(나) 행 강조',
    'a05': '실제 회원 권한을 일반 사용자로 변경 시도 → 서버 거부 메시지 강조',
    'a06': '모바일 관리자 드로어 → `회원 관리` 강조',
    'a07': '역할 비교 카드: 표 → 일반 사용자 → 테스트 관리자 → 실제 회원 권한 행',
    'a08': 'Swagger 제목 → 스크롤 → 인증 API → 관리자 API 강조',
    'a09': '`Sync public food data` 실행 행(성공) 강조',
}


def mmss(t):
    return f'{int(t) // 60:02d}:{t % 60:04.1f}'


def screen(sc):
    if 'slide' in sc:
        return f"PPT {sc['slide']}장"
    if sc.get('compare'):
        return '역할 비교 카드'
    if sc.get('mobile'):
        return f"모바일 · {'일반 사용자' if sc['mobile'] == 'user' else '테스트 관리자'}"
    return SCREEN[sc['web']]


rows, parts = [], {}
for sc in scenes:
    parts.setdefault(sc['part'], [sc['start'], 0])[1] = sc['start'] + sc['dur']
    tags = ' · '.join(t for _, t in sc.get('tags', []))
    act = ACTION.get(sc['id'], '슬라이드 강조 테두리' if 'slide' in sc else '')
    script = ' '.join(l['cap'] for l in sc['lines']).replace('|', '｜')
    rows.append(f"| {mmss(sc['start'])} | {sc['id']} | {screen(sc)} | {act} | {script} | {tags} |")

speech = sum(sum(l['d'] for l in s['lines']) for s in scenes)
doc = f"""# healthpick 10분 발표·시연 영상 — 대본 및 연출 가이드

이 문서는 `docs/video/tools/gen_guide.py`가 실제 음성 길이(timing.json)로 생성합니다. 대본을 고칠 때는
`docs/video/tools/video_scenes.py`만 수정하고 도구를 다시 실행합니다.

## 개요

| 항목 | 내용 |
| --- | --- |
| 파일 | `docs/video/healthpick_final.mp4` (10:00, 1920×1080, 30fps, H.264 + AAC 스테레오) |
| 발표자 | 이오리 (팀 조장) — 합성 음성 `{v.VOICE}`, 속도 {v.RATE}, 문장 사이 {v.GAP}초 쉼 |
| 시연 | 운영 사이트 `healthpick.onrender.com`의 **공용 테스트 계정 2개(일반 사용자 / 관리자)** 비교 |
| 장면 | {len(scenes)}개 · 실제 말하는 시간 {speech:.0f}초 / {v.TOTAL}초 |
| 자막 | 화면 하단 자막 + `docs/video/healthpick_final.srt` |

> 내레이션은 합성 음성입니다. 영상을 공개할 때 설명란에 "AI 합성 음성 사용"을 표기하세요.

## 구간

| 구간 | 시간 | 화면 |
| --- | --- | --- |
""" + '\n'.join(f'| {k} | {mmss(a)} – {mmss(b)} | ' + {
    v.PPT: '`프로젝트_발표자료.pptx` 1~14장', v.USER: '일반 사용자 테스트 계정 시연 (로그인 → 식단 기록 → 리포트 → 모바일 → `/admin` 차단)',
    v.ADMIN: '관리자 테스트 계정 시연 (회원 관리 → 권한 변경 → 서버 거부 → 역할 비교 → API 문서 → GitHub Actions)',
    v.CLOSE: 'PPT 15장 회고 → 16장 마무리'}[k] + ' |' for k, (a, b) in parts.items()) + """

## 장면별 타임라인

| 시작 | ID | 화면 | 클릭·연출 | 대본(자막) | 안내 태그 |
| --- | --- | --- | --- | --- | --- |
""" + '\n'.join(rows) + """

## 연출 원칙

| 항목 | 기준 |
| --- | --- |
| 커서 | 노란 원(지름 34px) + 클릭 링, 0.7초 이징 이동 후 0.4초 멈춘 뒤 클릭 |
| 강조 | 시안색 테두리만 0.3초 페이드 인·아웃 (화면 전체 어둡게·번쩍임 없음) |
| 이동 | 사이트 안에서는 링크 클릭 또는 앱 내부 이동만 사용 (전체 새로고침 흰 화면 없음) |
| 라벨 | 구간 라벨: 슬라이드 오른쪽 위 / 시연 왼쪽 아래 · 노란 안내 태그: 시연 오른쪽 위 |
| 자막 | 한 줄 27자 이내, 문장 길이에 비례해 나눠 표시 |
| 데이터 | 공용 테스트 계정만 사용. 식단 1건 추가·권한 변경은 시연 중 되돌리거나 다음 녹화 때 정리 |

## 다시 만들기

```bash
# 작업 폴더(저장소 밖)와 도구 설치 — requirements-video.txt 참고
python tts.py WORK                    # 문장별 음성 + timing.json
powershell -File export_slides.ps1 -Work WORK
node record_demo.js WORK              # 운영 사이트 시연 녹화 (NODE_PATH에 puppeteer-core)
python compose.py WORK OUT            # 합성 → healthpick_final.mp4 / .srt / highlight / thumbnail
python check_final.py WORK OUT        # 길이·형식·용량·음량·깜박임 검사
python gen_guide.py WORK              # 이 문서 갱신
```

실제 목소리로 바꾸려면 장면별 대본을 녹음해 `WORK/tts/<장면ID>_<문장번호>.wav`(48kHz 스테레오)로 덮어쓰고
`timing.json`의 `d` 값을 녹음 길이로 맞춘 뒤 `compose.py`만 다시 실행합니다.
"""
DOC.write_text(doc, encoding='utf-8')
print('wrote', DOC)
