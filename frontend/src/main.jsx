import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon as Icon } from '@fortawesome/react-fontawesome'
import {
  faAppleWhole, faArrowRight, faBolt, faCircleInfo, faRightToBracket, faArrowUp, faArrowUpRightFromSquare, faBookMedical, faBowlRice, faCalculator, faCalendarDays, faChartPie,
  faChartSimple, faCheck, faChevronRight, faCircleCheck, faCircleExclamation, faDatabase, faDroplet, faDrumstickBite, faEnvelope, faEye, faEyeSlash,
  faFileShield, faFire, faHandHoldingMedical, faHeartPulse, faLock, faNotesMedical, faPenToSquare, faPlus, faServer, faShieldHeart,
  faSpinner, faStethoscope, faTrashCan, faTriangleExclamation, faUser, faUserShield, faUsers, faUserXmark, faUtensils, faWandMagicSparkles, faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { faGithub, faGoogle } from '@fortawesome/free-brands-svg-icons'
import { api, apiBase } from './api'
import './style.css'

const defaultTargets = { calories: 2000, protein: 55, carbs: 275, fat: 70 }
const nutrients = [
  { key: 'calories', label: '열량', unit: 'kcal', color: 'energy', icon: faFire },
  { key: 'protein', label: '단백질', unit: 'g', color: 'protein', icon: faDrumstickBite },
  { key: 'carbs', label: '탄수화물', unit: 'g', color: 'carbs', icon: faBowlRice },
  { key: 'fat', label: '지방', unit: 'g', color: 'fat', icon: faDroplet },
]
const navItems = [
  { to: '/dashboard', label: '건강 대시보드', icon: faHeartPulse },
  { to: '/journal', label: '식단 기록', icon: faUtensils },
  { to: '/insights', label: '영양 리포트', icon: faChartSimple },
]
const roleLabels = { user: '일반 사용자', admin: '관리자', viewer: '테스트 관리자' }
const MEAL_TYPES = ['아침', '점심', '저녁', '간식']
const REPO = 'https://github.com/fsclass-n/vitapick'
const PHOTOS = [
  ['hero-bowl.jpg', 'Anna Pelzer', 'IGfIGP5ONV0'], ['colorful-bowl.jpg', 'Metin Ozer', 'Dmhjy9fDTKw'],
  ['avocado-bowl.jpg', 'Hermes Rivera', 'OzBLe_Eg1mg'], ['green-salad.jpg', 'sina piryae', 'bBzjWthTqb8'], ['salad-table.jpg', 'Roland Suciu', 'LlvSGfe0oSQ'],
]
const today = () => new Date().toLocaleDateString('sv-SE')
const formatNumber = (number) => Number(number || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const scaled = (food, grams) => Object.fromEntries(['calories', 'protein', 'carbs', 'fat'].map((k) => [k, Math.round(food[k] * Number(grams || 0) / 10) / 10]))

// Share of energy from carbs/protein/fat compared with the 50:20:30 target split (reference indicator, not a diagnosis).
function balanceScore(totals) {
  const energy = { carbs: totals.carbs * 4, protein: totals.protein * 4, fat: totals.fat * 9 }
  const sum = energy.carbs + energy.protein + energy.fat
  if (!sum) return null
  const share = Object.fromEntries(Object.entries(energy).map(([k, v]) => [k, v / sum * 100]))
  const gap = Math.abs(share.carbs - 50) + Math.abs(share.protein - 20) + Math.abs(share.fat - 30)
  return { score: Math.max(0, Math.round(100 - gap)), share }
}

function Logo() {
  return <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="cpg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#14a08f" /><stop offset="1" stopColor="#0b5c57" /></linearGradient></defs>
    <rect width="64" height="64" rx="18" fill="url(#cpg)" />
    <path d="M32 50C15.5 39.5 10.5 30.5 13.6 22.6 16.8 14.6 27 13.6 32 21.2 37 13.6 47.2 14.6 50.4 22.6 53.5 30.5 48.5 39.5 32 50Z" fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
    <path d="M14 32.5h9l3.4-6.5 5 13 4.4-17 3.6 10.5H50" fill="none" stroke="#a8f0dc" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M45 15.5c.3-5.6 4.4-8.6 10-8.5-.1 5.6-3.9 8.8-10 8.5Z" fill="#a8f0dc" />
  </svg>
}
function Brand({ light = false }) {
  return <Link to="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="비타픽 홈">
    <Logo /><span className="brand-text"><span className="brand-word">vita<b>pick</b></span><small>HEALTH · NUTRITION</small></span>
  </Link>
}
function Pulse({ className = '' }) {
  return <svg className={`pulse-line ${className}`} viewBox="0 0 600 80" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 40h150l14-22 18 46 20-62 18 52 12-14h120l12-18 16 38 16-48 14 32h170" />
  </svg>
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('vitapick_token'))
  const [user, setUser] = useState(null)
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const logout = useCallback(() => {
    sessionStorage.removeItem('vitapick_token')
    setToken(null)
    setUser(null)
    navigate('/')
  }, [navigate])

  useEffect(() => {
    if (!token) return
    api('/auth/me', { token }).then(setUser).catch(logout)
  }, [token, logout])
  useEffect(() => {
    setDrawer(false)
    if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, location.hash])
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawer])
  useEffect(() => {
    if (!drawer) return
    const closeOnEscape = (event) => { if (event.key === 'Escape') setDrawer(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [drawer])

  const signedIn = useCallback((result) => {
    sessionStorage.setItem('vitapick_token', result.access_token)
    setToken(result.access_token)
    setUser(result.user)
    navigate('/dashboard', { replace: true })
  }, [navigate])

  const staff = user?.role === 'admin' || user?.role === 'viewer'
  const links = user ? [...navItems, ...(staff ? [{ to: '/admin', label: '회원 관리', icon: faUsers }] : [])] : []
  const gate = (element) => user ? element : <Login onLogin={signedIn} />
  return <>
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="주 메뉴">
          {user ? links.map(({ to, label, icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon icon={icon} /> {label}</NavLink>) : <>
            <a href="/#care">케어 방식</a><a href="/#features">주요 기능</a><a href="/#trust">신뢰와 보안</a>
          </>}
        </nav>
        <div className="header-actions">
          {user ? <><span className="user-chip desktop-only"><span className="user-avatar"><Icon icon={faUser} /></span>{user.name}<em className={`role-badge role-${user.role}`}>{roleLabels[user.role]}</em></span><button className="text-button desktop-only" onClick={logout}>로그아웃</button></> : <>
            <Link className="text-button desktop-only" to="/login">로그인</Link><Link className="button button-primary desktop-only" to="/login?mode=register">무료로 시작하기 <Icon icon={faArrowRight} /></Link>
          </>}
          <button className={`menu-toggle ${drawer ? 'open' : ''}`} aria-label={drawer ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
    <div className={`drawer-overlay ${drawer ? 'visible' : ''}`} onClick={() => setDrawer(false)} />
    <aside className={`mobile-drawer ${drawer ? 'open' : ''}`} aria-hidden={!drawer} inert={!drawer}>
      <div className="drawer-head"><Brand /><button className="icon-button" aria-label="메뉴 닫기" onClick={() => setDrawer(false)}><Icon icon={faXmark} /></button></div>
      {user && <div className="drawer-user"><span className="user-avatar"><Icon icon={faUser} /></span><div><strong>{user.name}</strong><em className={`role-badge role-${user.role}`}>{roleLabels[user.role]}</em></div></div>}
      <nav aria-label="모바일 메뉴">
        {user ? links.map(({ to, label, icon }) => <NavLink key={to} to={to}><Icon icon={icon} /> {label} <Icon className="nav-chevron" icon={faChevronRight} /></NavLink>) :
          <><Link to="/"><Icon icon={faHeartPulse} /> 홈 <Icon className="nav-chevron" icon={faChevronRight} /></Link><a href="/#care" onClick={() => setDrawer(false)}><Icon icon={faStethoscope} /> 케어 방식 <Icon className="nav-chevron" icon={faChevronRight} /></a><a href="/#features" onClick={() => setDrawer(false)}><Icon icon={faWandMagicSparkles} /> 주요 기능 <Icon className="nav-chevron" icon={faChevronRight} /></a><a href="/#trust" onClick={() => setDrawer(false)}><Icon icon={faShieldHeart} /> 신뢰와 보안 <Icon className="nav-chevron" icon={faChevronRight} /></a></>}
      </nav>
      <div className="drawer-bottom">{user ? <button className="button button-outline" onClick={logout}>로그아웃</button> : <Link className="button button-primary" to="/login">로그인 / 시작하기 <Icon icon={faArrowRight} /></Link>}</div>
    </aside>
    <main>
      <Routes>
        <Route path="/" element={user ? <Dashboard token={token} user={user} /> : <Home />} />
        <Route path="/login" element={gate(<Dashboard token={token} user={user} />)} />
        <Route path="/dashboard" element={gate(<Dashboard token={token} user={user} />)} />
        <Route path="/journal" element={gate(<Journal token={token} />)} />
        <Route path="/insights" element={gate(<Insights token={token} user={user} onWithdraw={logout} />)} />
        <Route path="/admin" element={staff ? <Admin token={token} user={user} /> : user ? <AdminOnly /> : <Login onLogin={signedIn} />} />
        <Route path="/policy" element={<Policy />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </main>
    <Footer signedIn={Boolean(user)} />
  </>
}

function Footer({ signedIn }) {
  const docs = `${apiBase}/docs`
  return <footer className="site-footer">
    {signedIn ? <div className="footer-cta"><div><span className="eyebrow">KEEP YOUR CARE</span><h2>방금 먹은 식사, 한 문장으로 기록해 두세요.</h2></div><Link className="button button-light" to="/journal"><Icon icon={faWandMagicSparkles} /> AI 식단 기록하기</Link></div>
      : <div className="footer-cta"><div><span className="eyebrow">START YOUR CARE</span><h2>오늘 먹은 한 끼부터, 나의 건강 기록을 시작하세요.</h2></div><Link className="button button-light" to="/login?mode=register">무료로 시작하기 <Icon icon={faArrowRight} /></Link></div>}
    <div className="footer-grid">
      <div className="footer-brand"><Brand light /><p>공공데이터 식품영양성분 DB와 개인 신체 정보를 바탕으로 하루 영양 목표를 계산하고, 식단 기록을 건강 리포트로 바꿔 주는 헬스케어 플랫폼입니다.</p>
        <div className="footer-social"><a href={REPO} target="_blank" rel="noopener" aria-label="GitHub 저장소"><Icon icon={faGithub} /></a><a href="https://fsclass-n.github.io/vitapick/" target="_blank" rel="noopener" aria-label="포트폴리오"><Icon icon={faBookMedical} /></a><a href={`${REPO}/issues`} target="_blank" rel="noopener" aria-label="문의하기"><Icon icon={faEnvelope} /></a></div></div>
      <div><h4>서비스</h4><Link to="/dashboard">건강 대시보드</Link><Link to="/journal">AI 식단 기록</Link><Link to="/insights">영양 리포트</Link><Link to="/insights#goal">맞춤 목표 설정</Link></div>
      <div><h4>데이터 · 기술</h4><a href="https://www.data.go.kr/data/15127578/openapi.do" target="_blank" rel="noopener">식품영양성분 DB 출처 <Icon icon={faArrowUpRightFromSquare} /></a><a href={docs} target="_blank" rel="noopener">API 문서 <Icon icon={faArrowUpRightFromSquare} /></a><a href={`${apiBase}/api/health`} target="_blank" rel="noopener">서비스 상태 <Icon icon={faArrowUpRightFromSquare} /></a></div>
      <div><h4>고객 지원</h4><Link to="/policy#privacy">개인정보 처리 안내</Link><Link to="/policy#terms">서비스 이용 안내</Link><Link to="/policy#ai">AI 기능 안내</Link><a href={`${REPO}/issues`} target="_blank" rel="noopener">문의 · 오류 신고 <Icon icon={faArrowUpRightFromSquare} /></a></div>
    </div>
    <div className="footer-notice"><Icon icon={faStethoscope} /><p><strong>의료 안내</strong> vitapick의 목표치와 분석 결과는 일반적인 공식과 공공데이터로 계산한 참고 정보이며, 의사·영양사의 진단이나 처방을 대신하지 않습니다. 질환, 임신, 식이 제한이 있다면 전문가와 상담하세요.</p></div>
    <div className="footer-bottom">
      <span>© {new Date().getFullYear()} vitapick · 개발 박미금 · 김모란 · 이오리(조장) · 홍기흥 · 4인 팀 프로젝트</span>
      <span className="credits">Photos by {PHOTOS.map(([, n, id], i) => <a key={id} href={`https://unsplash.com/photos/${id}`} target="_blank" rel="noopener">{n}{i < PHOTOS.length - 1 ? ', ' : ''}</a>)} on Unsplash</span>
      <button className="top-button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="맨 위로 이동"><Icon icon={faArrowUp} /></button>
    </div>
  </footer>
}

function Home() {
  return <>
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="hero-badge"><span className="live-dot" /> HEALTHCARE × PERSONAL NUTRITION</span>
          <h1>식단으로 돌보는<br /><em>나의 건강 지표.</em></h1>
          <p>“어제 점심에 비빔밥 한 그릇 먹었어.” 한 문장이면 AI가 음식·식사 구분·섭취량을 나누고, 공공데이터로 영양소를 계산해 나에게 맞는 목표와 비교합니다.</p>
          <div className="hero-actions"><Link className="button button-primary button-large" to="/login?mode=register">나의 건강 기록 시작하기 <Icon icon={faArrowRight} /></Link><Link className="button button-outline button-large" to="/login">테스트 계정으로 둘러보기</Link></div>
          <ul className="hero-trust"><li><Icon icon={faDatabase} /> 식약처 식품영양성분 DB</li><li><Icon icon={faCalculator} /> Mifflin-St Jeor 공식</li><li><Icon icon={faWandMagicSparkles} /> Gemini 문장 기록</li></ul>
        </div>
        <div className="hero-visual" aria-label="건강 대시보드 미리보기">
          <img src="/images/hero-bowl.jpg" alt="채소와 곡물이 담긴 샐러드 볼" className="hero-photo" />
          <div className="vital-card">
            <div className="vital-head"><span><Icon icon={faHeartPulse} /> 오늘의 영양 균형</span><em>LIVE</em></div>
            <div className="vital-score"><strong>86</strong><span>/ 100</span></div>
            <Pulse />
            <div className="vital-macros"><span className="m-carbs">탄 52%</span><span className="m-protein">단 19%</span><span className="m-fat">지 29%</span></div>
          </div>
          <div className="chat-card">
            <p className="chat-bubble">어제 점심에 현미밥 한 공기랑 닭가슴살 샐러드 먹었어</p>
            <div className="chat-result"><span><Icon icon={faWandMagicSparkles} /> 자동 분석</span><b>현미밥 · 점심 · 210g</b><b>샐러드_닭가슴살 · 점심</b></div>
          </div>
          <div className="target-card"><Icon icon={faCalculator} /><div><strong>1,820 kcal</strong><span>하루 권장 목표 예시</span></div></div>
        </div>
      </div>
    </section>
    <section className="care-section section-pad" id="care">
      <div className="container">
        <div className="section-heading center"><span className="eyebrow">CARE CYCLE</span><h2>기록에서 관리까지, <em>4단계 건강 케어.</em></h2><p>병원 차트처럼 체계적으로, 매일의 식단을 건강 데이터로 바꿉니다.</p></div>
        <ol className="care-steps">
          {[[faPenToSquare, '기록', '문장 한 줄이나 검색으로 식사를 남겨요.'], [faDatabase, '계산', '공공데이터 100g 기준값 × 섭취량으로 영양소를 자동 계산해요.'], [faChartPie, '분석', '목표 대비 진행률과 탄·단·지 비율을 리포트로 보여 줘요.'], [faHandHoldingMedical, '관리', '신체 정보와 활동량으로 나만의 목표를 다시 맞춰요.']].map(([icon, title, text], i) =>
            <li key={title}><span className="care-index">0{i + 1}</span><span className="care-icon"><Icon icon={icon} /></span><h3>{title}</h3><p>{text}</p></li>)}
        </ol>
      </div>
    </section>
    <section className="features section-pad" id="features">
      <div className="container">
        <div className="section-heading"><span className="eyebrow">FEATURES</span><h2>건강 관리에 필요한 기능만, <em>정확하게.</em></h2></div>
        <div className="bento">
          <article className="bento-card bento-ai"><div><span className="bento-tag"><Icon icon={faWandMagicSparkles} /> AI 문장 기록</span><h3>말하듯 적으면<br />항목이 자동으로 나뉩니다.</h3><p>음식명, 식사 구분, 날짜, 섭취량을 AI가 구분하고 열량·단백질·탄수화물·지방은 공공데이터로 계산합니다. AI는 영양값을 지어내지 않습니다.</p></div>
            <div className="ai-demo"><span className="ai-input">그제 저녁 김치찌개 300g이랑 두부부침</span><div className="ai-rows"><span><b>김치찌개</b> 저녁 · 300g</span><span><b>두부부침</b> 저녁 · 추정 200g</span></div></div></article>
          <article className="bento-card bento-photo" style={{ backgroundImage: 'url(/images/avocado-bowl.jpg)' }}><div><span className="bento-tag"><Icon icon={faCalculator} /> 맞춤 목표</span><h3>나이·키·몸무게·활동량으로 계산한 하루 목표</h3></div></article>
          <article className="bento-card"><span className="bento-tag"><Icon icon={faChartSimple} /> 영양 리포트</span><h3>오늘의 균형과 최근 7일 열량 흐름</h3><div className="mini-bars">{[46, 72, 58, 88, 64, 80, 52].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div></article>
          <article className="bento-card"><span className="bento-tag"><Icon icon={faUserShield} /> 3단계 권한</span><h3>일반 사용자 · 관리자 · 읽기 전용 테스트 관리자</h3><p>권한은 서버가 매 요청마다 다시 확인합니다.</p></article>
        </div>
      </div>
    </section>
    <section className="trust-section section-pad" id="trust"><div className="container trust-grid">
      <div className="trust-photo"><img src="/images/salad-table.jpg" alt="식탁 위 샐러드" loading="lazy" /><div className="trust-stat"><strong>1,095</strong><span>공공데이터 식품 영양 정보</span></div></div>
      <div><span className="eyebrow">TRUST & SAFETY</span><h2>건강 정보이기에, <em>근거와 보안을 먼저.</em></h2>
        <ul className="trust-list">
          <li><Icon icon={faDatabase} /><div><strong>공식 데이터</strong><span>식품의약품안전처 식품영양성분 DB를 공식 API로 동기화합니다.</span></div></li>
          <li><Icon icon={faCalculator} /><div><strong>검증된 공식</strong><span>기초대사량은 Mifflin-St Jeor 공식, 영양소 비율은 50:20:30을 사용합니다.</span></div></li>
          <li><Icon icon={faLock} /><div><strong>안전한 계정</strong><span>비밀번호는 Argon2로 해시하고, 식단·신체 정보는 본인만 조회합니다.</span></div></li>
        </ul>
        <Link className="button button-primary" to="/login">지금 시작하기 <Icon icon={faArrowRight} /></Link></div>
    </div></section>
  </>
}

function Login({ onLogin }) {
  const location = useLocation()
  const [mode, setMode] = useState(new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [providers, setProviders] = useState({})
  const [demoEnabled, setDemoEnabled] = useState(null)
  useEffect(() => { setMode(new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login') }, [location.search])
  useEffect(() => { api('/auth/oauth/providers').then(setProviders).catch(() => {}) }, [])
  useEffect(() => { api('/auth/demo-status').then((d) => setDemoEnabled(d.enabled)).catch(() => setDemoEnabled(false)) }, [])
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('code')
    const oauthError = new URLSearchParams(location.search).get('error')
    if (oauthError) setError('소셜 로그인에 실패했습니다. 계정 설정을 확인해 주세요.')
    if (!code) return
    setBusy('form')
    api('/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ code }) }).then(onLogin).catch((e) => setError(e.message)).finally(() => setBusy(''))
  }, [location.search, onLogin])

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (mode === 'register' && !/^(?=.{8,128}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/.test(form.password)) {
      setError('영문 대·소문자, 숫자, 특수문자를 포함한 8자 이상의 비밀번호를 입력해 주세요.')
      return
    }
    setBusy('form')
    try {
      onLogin(await api(mode === 'register' ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(form) }))
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  async function demo(role) {
    setError('')
    setBusy(role)
    try { onLogin(await api('/auth/demo-login', { method: 'POST', body: JSON.stringify({ role }) })) }
    catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const switchMode = (next) => { setMode(next); setError('') }
  const oauth = (name, label, content) => <button type="button" disabled={!providers[name]} title={providers[name] ? `${label}로 로그인` : `${label} 로그인 설정 대기 중`} aria-label={`${label}로 로그인`} className={`lg-social ${name}`} onClick={() => window.location.assign(`${apiBase}/api/auth/oauth/${name}/start`)}><span>{content}</span>{label}</button>
  const passes = [
    { role: 'user', icon: faUser, title: '일반 사용자', text: '식단 기록 · AI 문장 기록 · 영양 리포트', tag: 'USER' },
    { role: 'admin', icon: faUserShield, title: '관리자', text: '회원 관리 화면 체험 · 읽기 전용', tag: 'ADMIN' },
  ]
  return <div className="lg-shell"><div className="lg-page">
    <section className="lg-visual">
      <div className="lg-copy"><span className="eyebrow">DAILY HEALTH CHECK-IN</span><h1>오늘의 컨디션,<br /><em>한 끼</em>부터 체크인.</h1><p>식단을 기록하면 공공데이터로 열량과 탄·단·지를 계산해 나만의 건강 지표로 보여 드려요.</p></div>
      <div className="lg-monitor" aria-hidden="true">
        <div className="lg-monitor-top"><span><i className="live-dot" /> NUTRITION MONITOR</span><span className="lg-sample">예시 화면</span></div>
        <svg className="lg-ecg" viewBox="0 0 600 110" preserveAspectRatio="none"><path d="M0 60h110l12-18 14 36 16-66 18 82 14-48 10 14h120l10-14 14 30 14-46 12 30h106l10-10 12 22 12-36 10 24h60" /></svg>
        <div className="lg-readouts">
          <div><small>ENERGY</small><strong>1,820<em>kcal</em></strong></div>
          <div><small>BALANCE</small><strong>86<em>/100</em></strong></div>
          <div><small>MEALS</small><strong>3<em>회</em></strong></div>
        </div>
        <div className="lg-macros">{[['carbs', '탄수화물', '228g', 72], ['protein', '단백질', '91g', 64], ['fat', '지방', '61g', 48]].map(([key, label, value, pct]) => <div key={key} className={key}><span>{label}<b>{value}</b></span><i><s style={{ width: `${pct}%` }} /></i></div>)}</div>
      </div>
      <ul className="lg-trust"><li><Icon icon={faDatabase} /> 공공데이터 식품 1,095종</li><li><Icon icon={faWandMagicSparkles} /> 문장 한 줄 AI 기록</li><li><Icon icon={faShieldHeart} /> Argon2 비밀번호 보호</li></ul>
    </section>

    <section className="lg-panel"><div className="lg-card">
      <div className="lg-head"><span className="lg-badge"><Icon icon={faHeartPulse} /> CHECK-IN</span><h2>{mode === 'login' ? '다시 오신 것을 환영해요' : '건강 기록을 시작해요'}</h2><p>{mode === 'login' ? '계정으로 로그인하거나, 테스트 계정으로 바로 둘러보세요.' : '이메일과 비밀번호만 있으면 바로 시작할 수 있어요.'}</p></div>

      <div className="lg-quick">
        <div className="lg-quick-title"><Icon icon={faBolt} /> 클릭 한 번으로 체험하기</div>
        <div className="lg-passes">{passes.map((p) => <button key={p.role} type="button" className={`lg-pass ${p.role}`} disabled={!demoEnabled || !!busy} onClick={() => demo(p.role)}>
          <span className="lg-pass-icon"><Icon icon={busy === p.role ? faSpinner : p.icon} spin={busy === p.role} /></span>
          <span className="lg-pass-body"><em>{p.tag}</em><strong>{p.title}</strong><small>{p.text}</small></span>
          <Icon className="lg-pass-arrow" icon={faArrowRight} />
        </button>)}</div>
        <p className="lg-quick-note"><Icon icon={faCircleInfo} /> {demoEnabled === false ? '현재 서버에서 테스트 계정이 비활성화되어 있어요.' : '여러 사람이 함께 쓰는 공용 계정입니다. 관리자 체험은 읽기 전용이에요.'}</p>
      </div>

      <div className="lg-divider"><span>또는 내 계정으로</span></div>
      <div className="lg-tabs" role="tablist"><button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>로그인</button><button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => switchMode('register')}>회원가입</button><i className={mode} /></div>
      <form onSubmit={submit} className="lg-form">
        {mode === 'register' && <label className="lg-field"><span>이름</span><div><Icon icon={faUser} /><input required value={form.name} maxLength={80} autoComplete="name" placeholder="이름을 입력해 주세요" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div></label>}
        <label className="lg-field"><span>이메일 주소</span><div><Icon icon={faEnvelope} /><input required type="email" value={form.email} autoComplete="email" placeholder="name@example.com" onChange={(e) => setForm({ ...form, email: e.target.value })} /></div></label>
        <label className="lg-field"><span>비밀번호</span><div><Icon icon={faLock} /><input required type={showPassword ? 'text' : 'password'} value={form.password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="비밀번호를 입력해 주세요" minLength={mode === 'register' ? 8 : undefined} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" className="lg-eye" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowPassword(!showPassword)}><Icon icon={showPassword ? faEyeSlash : faEye} /></button></div></label>
        {mode === 'register' && <p className="lg-hint"><Icon icon={faLock} /> 영문 대·소문자, 숫자, 특수문자 포함 8자 이상</p>}
        {error && <div className="form-error" role="alert"><Icon icon={faCircleExclamation} /> {error}</div>}
        <button className="button button-primary lg-submit" disabled={!!busy} type="submit">{busy === 'form' ? '처리 중...' : mode === 'login' ? '로그인' : '계정 만들기'} <Icon icon={faRightToBracket} /></button>
      </form>
      <div className="lg-socials">{oauth('google', 'Google', <Icon icon={faGoogle} />)}{oauth('naver', '네이버', 'N')}{oauth('kakao', '카카오', 'K')}</div>
      <p className="lg-foot"><Icon icon={faShieldHeart} /> 로그인 시 <Link to="/policy">개인정보 · 서비스 이용 안내</Link>에 동의한 것으로 봅니다.</p>
    </div></section>
  </div></div>
}

function useMeals(token) {
  const [meals, setMeals] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(() => {
    setLoading(true)
    api('/meals', { token }).then(setMeals).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [token])
  useEffect(refresh, [refresh])
  return { meals, error, setError, loading, refresh }
}
function useTargets(token) {
  const [data, setData] = useState({ targets: defaultTargets, personalized: false, profile: {} })
  const [error, setError] = useState('')
  useEffect(() => { api('/nutrition/targets', { token }).then(setData).catch((e) => setError(e.message)) }, [token])
  return { data, setData, error }
}
function totalsFor(meals) {
  return nutrients.reduce((all, { key }) => ({ ...all, [key]: meals.reduce((sum, meal) => sum + Number(meal[key] || 0), 0) }), {})
}
function PageHeading({ tag, title, description, icon, pulse = false }) {
  return <div className="page-heading"><div><span className="eyebrow">{tag}</span><h1>{title}</h1><p>{description}</p></div><span className={`page-heading-icon ${pulse ? 'is-pulse' : ''}`}><Icon icon={icon} /></span></div>
}
function Progress({ value, target, color }) {
  return <div className={`progress-track ${color}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={target} aria-valuemin={0}><span style={{ width: `${Math.min(value / target * 100, 100)}%` }} /></div>
}
function ScoreRing({ balance, size = 'large' }) {
  const value = balance?.score ?? 0
  return <div className={`score-ring ${size}`} style={{ '--value': value }} role="img" aria-label={balance ? `영양 균형 지수 ${value}점` : '영양 균형 지수 기록 없음'}>
    <div><strong>{balance ? value : '—'}</strong><span>{balance ? '/ 100' : '기록 전'}</span></div>
  </div>
}
function MealRow({ meal, onDelete }) {
  return <div className="meal-row"><span className={`meal-icon meal-${MEAL_TYPES.indexOf(meal.meal_type)}`}><Icon icon={meal.meal_type === '간식' ? faAppleWhole : faUtensils} /></span><div><strong>{meal.food_name}</strong><small>{meal.eaten_at} · {meal.meal_type} · {formatNumber(meal.serving_g)}g</small><small>단백질 {formatNumber(meal.protein)}g · 탄수화물 {formatNumber(meal.carbs)}g · 지방 {formatNumber(meal.fat)}g</small></div><b>{formatNumber(meal.calories)}<small> kcal</small></b>{onDelete && <button className="delete-button" aria-label={`${meal.food_name} 기록 삭제`} onClick={() => onDelete(meal.id)}><Icon icon={faTrashCan} /></button>}</div>
}

function Dashboard({ token, user }) {
  const navigate = useNavigate()
  const { meals, error, loading } = useMeals(token)
  const { data: recommendation } = useTargets(token)
  const [quick, setQuick] = useState('')
  const targets = recommendation.targets
  const current = meals.filter((m) => m.eaten_at === today())
  const totals = totalsFor(current)
  const balance = balanceScore(totals)
  const hour = new Date().getHours()
  const greeting = hour < 11 ? '좋은 아침이에요' : hour < 17 ? '좋은 오후예요' : '오늘도 수고 많으셨어요'
  const status = !balance ? ['기록 대기', '첫 식사를 기록하면 균형 지수를 계산해 드려요.'] : balance.score >= 80 ? ['균형 양호', '탄수화물·단백질·지방 비율이 목표에 가까워요.'] : balance.score >= 60 ? ['조금 아쉬워요', '다음 식사에서 부족한 영양소를 채워 보세요.'] : ['균형 점검 필요', '한쪽 영양소에 치우쳐 있어요. 리포트를 확인해 보세요.']
  return <div className="app-page"><div className="container">
    <PageHeading tag="HEALTH DASHBOARD" title={`${user.name}님, ${greeting}.`} description="오늘의 식단으로 확인하는 나의 건강 지표입니다." icon={faHeartPulse} pulse />
    {error && <div className="form-error" role="alert">{error}</div>}
    <section className="health-summary">
      <div className="summary-main"><ScoreRing balance={balance} /><div><span className="eyebrow">NUTRITION BALANCE INDEX</span><h2>영양 균형 지수 <em className={`status-chip ${balance ? balance.score >= 80 ? 'good' : balance.score >= 60 ? 'warn' : 'alert' : ''}`}>{status[0]}</em></h2><p>{status[1]}</p><small>{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} · 목표 비율 50:20:30 기준 참고 지표</small></div></div>
      <div className="summary-side"><div><span>오늘 기록한 식사</span><strong>{current.length}<small>회</small></strong></div><div><span>섭취 열량</span><strong>{formatNumber(totals.calories)}<small>/ {formatNumber(targets.calories)} kcal</small></strong></div><Pulse /></div>
    </section>
    <div className="stat-grid">{nutrients.map(({ key, label, unit, color, icon }) => <article className={`stat-card ${color}`} key={key}><div className="stat-top"><span className="stat-symbol"><Icon icon={icon} /></span><span>{label}</span><em>{targets[key] ? Math.round(totals[key] / targets[key] * 100) : 0}%</em></div><div className="stat-value">{formatNumber(totals[key])}<small> / {formatNumber(targets[key])} {unit}</small></div><Progress value={totals[key]} target={targets[key]} color={color} /></article>)}</div>
    <form className="quick-ai" onSubmit={(e) => { e.preventDefault(); if (quick.trim().length >= 2) navigate('/journal', { state: { text: quick.trim() } }) }}>
      <span className="quick-icon"><Icon icon={faWandMagicSparkles} /></span><input value={quick} maxLength={300} onChange={(e) => setQuick(e.target.value)} placeholder="무엇을 드셨나요? 예: 점심에 비빔밥 한 그릇이랑 된장찌개 먹었어" aria-label="문장으로 식사 기록" /><button className="button button-primary" type="submit">AI로 기록 <Icon icon={faArrowRight} /></button>
    </form>
    <div className="content-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">TODAY'S MEALS</span><h3>오늘의 식단</h3></div><Link to="/journal" className="inline-link">전체 보기 <Icon icon={faArrowRight} /></Link></div>{loading ? <p className="muted">불러오는 중...</p> : current.length ? <div className="meal-list">{current.slice(0, 4).map((m) => <MealRow key={m.id} meal={m} />)}</div> : <EmptyState text="아직 기록된 식사가 없어요." />}<Link to="/journal" className="button button-soft"><Icon icon={faPlus} /> 식단 기록하기</Link></section>
    <section className="panel care-note"><div className="panel-heading"><div><span className="eyebrow">CARE NOTE</span><h3>오늘의 케어 노트</h3></div><span className="care-note-icon"><Icon icon={faNotesMedical} /></span></div>
      {balance ? <div className="macro-split">{[['carbs', '탄수화물', 50], ['protein', '단백질', 20], ['fat', '지방', 30]].map(([k, l, t]) => <div key={k} className={`split-row ${k}`}><span>{l}</span><div><i style={{ width: `${balance.share[k]}%` }} /><b style={{ left: `${t}%` }} /></div><em>{Math.round(balance.share[k])}% <small>목표 {t}%</small></em></div>)}</div> : <div className="care-empty"><Icon icon={faStethoscope} /><p>식사를 기록하면 열량 구성 비율을 목표와 비교해 드려요.</p></div>}
      <p className="care-tip">{!current.length ? '작은 기록이 나만의 건강 패턴을 발견하는 첫걸음입니다.' : totals.protein < targets.protein * 0.5 ? '단백질이 목표의 절반에 못 미쳐요. 달걀, 두부, 생선 같은 식품을 더해 보세요.' : '좋아요! 영양 리포트에서 최근 7일 흐름도 확인해 보세요.'}</p>
      <Link to="/insights" className="inline-link">영양 리포트 확인하기 <Icon icon={faArrowRight} /></Link></section></div>
    <p className="medical-note"><Icon icon={faCircleExclamation} /> {recommendation.personalized ? '목표치는 입력한 신체 정보와 활동량으로 추정한 참고값입니다.' : '표시된 목표치는 일반 성인 예시입니다. 영양 리포트에서 나의 목표를 설정해 보세요.'} 의료·영양 상담을 대신하지 않습니다.</p>
  </div></div>
}
function AdminOnly() {
  return <div className="app-page"><div className="container"><div className="panel admin-only" role="alert">
    <span className="admin-only-icon"><Icon icon={faLock} /></span>
    <span className="eyebrow">STAFF ONLY</span>
    <h1>관리자 전용 화면입니다.</h1>
    <p>회원 관리는 관리자 또는 테스트 관리자 권한이 있는 계정만 이용할 수 있습니다. 서버도 모든 관리자 요청의 권한을 다시 확인합니다.</p>
    <Link to="/dashboard" className="button button-primary">건강 대시보드로 돌아가기 <Icon icon={faArrowRight} /></Link>
  </div></div></div>
}
function EmptyState({ text }) { return <div className="empty-state"><Icon icon={faCalendarDays} /><p>{text}</p></div> }

const EXAMPLES = ['어제 점심에 현미밥 한 공기랑 된장찌개 먹었어', '아침에 달걀 2개, 저녁엔 비빔밥 1인분', '오늘 간식으로 고구마 하나']
function DraftCard({ draft, onChange, onRemove }) {
  const set = (patch) => {
    const next = { ...draft, ...patch }
    onChange(next.food ? { ...next, ...scaled(next.food, next.serving_g) } : next)
  }
  return <article className={`draft-card ${draft.food ? '' : 'unmatched'}`}>
    <div className="draft-head"><span className="draft-query">“{draft.query}”</span>{draft.match === 'exact' ? <em className="match-chip ok"><Icon icon={faCircleCheck} /> DB 일치</em> : draft.food ? <em className="match-chip near"><Icon icon={faCircleCheck} /> 유사 항목</em> : <em className="match-chip miss"><Icon icon={faTriangleExclamation} /> 직접 확인</em>}<button type="button" className="delete-button" aria-label="이 항목 빼기" onClick={onRemove}><Icon icon={faXmark} /></button></div>
    <div className="draft-fields">
      <label className="wide">음식 (공공데이터)<select value={draft.food?.id ?? ''} onChange={(e) => { const food = draft.candidates.find((c) => String(c.id) === e.target.value) || null; set({ food, food_name: food ? food.name : draft.query, match: food ? 'similar' : 'none' }) }}>
        <option value="">직접 입력: {draft.query}</option>{draft.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} · 100g {formatNumber(c.calories)}kcal</option>)}</select></label>
      <label>식사 구분<select value={draft.meal_type} onChange={(e) => set({ meal_type: e.target.value })}>{MEAL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label>날짜<input type="date" value={draft.eaten_at} onChange={(e) => set({ eaten_at: e.target.value })} /></label>
      <label>섭취량 (g){draft.serving_estimated && <span className="est">추정</span>}<input type="number" min="1" max="10000" step="any" value={draft.serving_g} onChange={(e) => set({ serving_g: e.target.value, serving_estimated: false })} /></label>
    </div>
    <div className="draft-nutrients">{nutrients.map(({ key, label, unit, color }) => <label key={key} className={color}>{label}{draft.food ? <strong>{formatNumber(draft[key])}<small>{unit}</small></strong> : <input type="number" min="0" step="any" placeholder="0" value={draft[key] ?? ''} onChange={(e) => onChange({ ...draft, [key]: e.target.value })} />}</label>)}</div>
    {!draft.food && <p className="draft-help">공공데이터에서 같은 음식을 찾지 못했어요. 비슷한 음식을 고르거나 영양값을 직접 입력해 주세요.</p>}
  </article>
}
function AiComposer({ token, onSaved, initialText }) {
  const [text, setText] = useState(initialText || '')
  const [engine, setEngine] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  useEffect(() => { api('/meals/parse/status').then(setEngine).catch(() => {}) }, [])
  const analyze = useCallback(async (value) => {
    setBusy(true); setError(''); setDone('')
    try {
      const result = await api('/meals/parse', { token, method: 'POST', body: JSON.stringify({ text: value, today: today(), hour: new Date().getHours() }) })
      setEngine((e) => ({ ...e, used: result.engine }))
      setDrafts(result.items.map((item, i) => ({ ...item, key: `${Date.now()}-${i}`, ...(item.nutrients || {}) })))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [token])
  useEffect(() => { if (initialText) analyze(initialText) }, [initialText, analyze])
  async function saveAll() {
    setSaving(true); setError('')
    try {
      for (const d of drafts) {
        await api('/meals', { token, method: 'POST', body: JSON.stringify({ food_name: d.food_name, meal_type: d.meal_type, eaten_at: d.eaten_at, serving_g: Number(d.serving_g), calories: Number(d.calories || 0), protein: Number(d.protein || 0), carbs: Number(d.carbs || 0), fat: Number(d.fat || 0) }) })
      }
      setDone(`${drafts.length}개의 식사를 기록했어요.`); setDrafts([]); setText(''); onSaved()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const total = totalsFor(drafts)
  return <div className="ai-composer">
    <form onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 2) analyze(text.trim()) }}>
      <label className="sr-only" htmlFor="meal-text">먹은 음식을 문장으로 입력</label>
      <textarea id="meal-text" rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="무엇을, 언제, 얼마나 드셨나요?&#10;예: 어제 점심에 현미밥 한 공기랑 닭가슴살 샐러드 먹었어" />
      <div className="composer-bar"><span className={`engine-chip ${engine?.ai ? 'ai' : ''}`}><Icon icon={engine?.ai ? faWandMagicSparkles : faCalculator} /> {engine?.ai ? 'Gemini AI 분석' : '규칙 기반 분석'}{engine?.used && engine.used !== engine.engine ? ' (대체 분석 사용)' : ''}</span><span className="char-count">{text.length}/300</span><button className="button button-primary" type="submit" disabled={busy || text.trim().length < 2}>{busy ? <><Icon icon={faSpinner} spin /> 분석 중</> : <><Icon icon={faWandMagicSparkles} /> 항목 나누기</>}</button></div>
    </form>
    <div className="example-chips">{EXAMPLES.map((example) => <button type="button" key={example} onClick={() => { setText(example); analyze(example) }}>{example}</button>)}</div>
    {error && <div className="form-error" role="alert"><Icon icon={faCircleExclamation} /> {error}</div>}
    {done && <p className="save-success" role="status"><Icon icon={faCheck} /> {done}</p>}
    {drafts.length > 0 && <>
      <div className="draft-list">{drafts.map((d) => <DraftCard key={d.key} draft={d} onChange={(next) => setDrafts(drafts.map((x) => x.key === d.key ? next : x))} onRemove={() => setDrafts(drafts.filter((x) => x.key !== d.key))} />)}</div>
      <div className="draft-total"><span>합계</span>{nutrients.map(({ key, label, unit }) => <b key={key}>{label} {formatNumber(total[key])}{unit}</b>)}<button className="button button-primary" disabled={saving} onClick={saveAll}><Icon icon={faCheck} /> {saving ? '저장 중...' : `${drafts.length}개 모두 기록`}</button></div>
    </>}
    <p className="form-hint"><Icon icon={faShieldHeart} /> AI는 음식·식사 구분·날짜·섭취량만 나눕니다. 영양값은 공공데이터 100g 기준값 × 섭취량으로 계산합니다.</p>
  </div>
}
function ManualForm({ token, onSaved }) {
  const [form, setForm] = useState({ food_name: '', meal_type: '아침', eaten_at: today(), serving_g: 100, calories: '', protein: '', carbs: '', fat: '' })
  const [base, setBase] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [foods, setFoods] = useState([])
  useEffect(() => {
    if (query.trim().length < 2) { setFoods([]); return }
    const timer = setTimeout(() => api(`/foods?q=${encodeURIComponent(query)}`).then(setFoods).catch(() => setFoods([])), 300)
    return () => clearTimeout(timer)
  }, [query])
  async function save(e) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api('/meals', { token, method: 'POST', body: JSON.stringify({ ...form, calories: Number(form.calories), protein: Number(form.protein), carbs: Number(form.carbs), fat: Number(form.fat), serving_g: Number(form.serving_g) }) })
      setForm({ ...form, food_name: '', calories: '', protein: '', carbs: '', fat: '' }); setBase(null)
      setQuery(''); setFoods([]); onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  return <form onSubmit={save} className="meal-form">
    {error && <div className="form-error" role="alert">{error}</div>}
    <label>음식 이름<input required maxLength={120} placeholder="두 글자 이상 입력하면 공공데이터에서 찾아요" value={form.food_name} onChange={(e) => { setForm({ ...form, food_name: e.target.value }); setBase(null); setQuery(e.target.value) }} /></label>
    {foods.length > 0 && <div className="food-suggestions" aria-label="공공데이터 음식 검색 결과">{foods.map((food) => <button type="button" key={food.id} onClick={() => { setBase(food); setForm({ ...form, food_name: food.name, ...scaled(food, form.serving_g) }); setFoods([]); setQuery('') }}>{food.name} <small>100g · {food.calories} kcal</small></button>)}</div>}
    <div className="form-two"><label>식사 구분<select value={form.meal_type} onChange={(e) => setForm({ ...form, meal_type: e.target.value })}>{MEAL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><label>날짜<input required type="date" value={form.eaten_at} onChange={(e) => setForm({ ...form, eaten_at: e.target.value })} /></label></div>
    <div className="form-two"><label>섭취량 (g)<input required type="number" min="1" max="10000" step="any" value={form.serving_g} onChange={(e) => setForm({ ...form, serving_g: e.target.value, ...(base ? scaled(base, e.target.value) : {}) })} /></label><label>열량 (kcal)<input required type="number" min="0" max="20000" step="any" placeholder="0" value={form.calories} onChange={(e) => { setBase(null); setForm({ ...form, calories: e.target.value }) }} /></label></div>
    <div className="form-three">{['protein', 'carbs', 'fat'].map((key) => <label key={key}>{nutrients.find((n) => n.key === key).label} (g)<input required type="number" min="0" max="10000" step="any" placeholder="0" value={form[key]} onChange={(e) => { setBase(null); setForm({ ...form, [key]: e.target.value }) }} /></label>)}</div>
    <p className="form-hint">{base ? <><Icon icon={faCircleCheck} /> {base.name}의 100g 기준값으로 섭취량에 맞춰 자동 계산 중입니다.</> : '검색 결과를 고르면 섭취량에 맞춰 영양값이 자동 계산됩니다.'}</p>
    <button disabled={saving} className="button button-primary form-submit" type="submit"><Icon icon={faPlus} /> {saving ? '저장 중...' : '기록 추가하기'}</button>
  </form>
}
function Journal({ token }) {
  const location = useLocation()
  const { meals, error, setError, loading, refresh } = useMeals(token)
  const [tab, setTab] = useState('ai')
  const initialText = location.state?.text
  async function remove(id) {
    try { await api(`/meals/${id}`, { token, method: 'DELETE' }); refresh() }
    catch (err) { setError(err.message) }
  }
  return <div className="app-page"><div className="container"><PageHeading tag="FOOD JOURNAL" title="식단 기록" description="말하듯 적으면 AI가 항목을 나누고, 영양소는 공공데이터로 계산합니다." icon={faUtensils} />
    <div className="journal-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">ADD A MEAL</span><h3>새 식사 기록</h3></div></div>
      <div className="segmented" role="tablist"><button role="tab" aria-selected={tab === 'ai'} className={tab === 'ai' ? 'selected' : ''} onClick={() => setTab('ai')}><Icon icon={faWandMagicSparkles} /> 문장으로 기록</button><button role="tab" aria-selected={tab === 'manual'} className={tab === 'manual' ? 'selected' : ''} onClick={() => setTab('manual')}><Icon icon={faPenToSquare} /> 직접 입력</button></div>
      {tab === 'ai' ? <AiComposer token={token} onSaved={refresh} initialText={initialText} /> : <ManualForm token={token} onSaved={refresh} />}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORY</span><h3>기록한 식사 <span className="count-pill">{meals.length}</span></h3></div></div>{error && <div className="form-error" role="alert">{error}</div>}{loading ? <p className="muted">불러오는 중...</p> : meals.length ? <div className="meal-list journal-list">{meals.map((m) => <MealRow key={m.id} meal={m} onDelete={remove} />)}</div> : <EmptyState text="아직 기록이 없어요. 첫 식사를 추가해 보세요." />}</section></div>
    <p className="medical-note"><Icon icon={faCircleExclamation} /> 공공데이터 수치는 100g 기준이며 제조사·조리법에 따라 달라질 수 있습니다.</p>
  </div></div>
}
function Insights({ token, user, onWithdraw }) {
  const location = useLocation()
  const { meals, error, loading } = useMeals(token)
  const { data: recommendation, setData: setRecommendation, error: targetError } = useTargets(token)
  const targets = recommendation.targets
  const daily = meals.filter((m) => m.eaten_at === today())
  const totals = totalsFor(daily)
  const balance = balanceScore(totals)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toLocaleDateString('sv-SE') }), [])
  const energy = days.map((day) => totalsFor(meals.filter((m) => m.eaten_at === day)).calories)
  const max = Math.max(targets.calories, ...energy)
  useEffect(() => { if (location.hash === '#goal') setTimeout(() => document.getElementById('goal')?.scrollIntoView({ behavior: 'smooth' }), 200) }, [location.hash])
  return <div className="app-page"><div className="container"><PageHeading tag="NUTRITION REPORT" title="나의 영양 리포트" description="목표 대비 섭취량과 열량 구성, 최근 7일 흐름을 확인하세요." icon={faChartSimple} />
    {(error || targetError) && <div className="form-error" role="alert">{error || targetError}</div>}
    <div className="report-banner"><ScoreRing balance={balance} size="small" /><div><span className="eyebrow">TODAY'S REPORT</span><h2>오늘 {daily.length}개의 식사, <em>{formatNumber(totals.calories)} kcal</em></h2><p>{recommendation.personalized ? `나의 하루 목표 ${formatNumber(targets.calories)}kcal 대비 ${Math.round(totals.calories / targets.calories * 100)}%를 섭취했어요.` : '신체 정보를 입력하면 나에게 맞는 목표로 리포트가 바뀌어요.'}</p></div></div>
    <div className="report-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">DAILY BALANCE</span><h3>목표 대비 섭취량</h3></div></div>{nutrients.map(({ key, label, unit, color, icon }) => <div className="report-nutrient" key={key}><div><strong><Icon icon={icon} className={`ic-${color}`} /> {label}</strong><span>{formatNumber(totals[key])} / {formatNumber(targets[key])} {unit}</span></div><Progress value={totals[key]} target={targets[key]} color={color} /></div>)}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ENERGY SPLIT</span><h3>열량 구성 비율</h3></div></div>{balance ? <div className="donut-wrap"><div className="donut" style={{ '--c': balance.share.carbs, '--p': balance.share.protein }} role="img" aria-label={`탄수화물 ${Math.round(balance.share.carbs)}%, 단백질 ${Math.round(balance.share.protein)}%, 지방 ${Math.round(balance.share.fat)}%`}><span>{balance.score}<small>균형 지수</small></span></div><ul>{[['carbs', '탄수화물', 50], ['protein', '단백질', 20], ['fat', '지방', 30]].map(([k, l, t]) => <li key={k}><i className={`dot ${k}`} />{l}<b>{Math.round(balance.share[k])}%</b><small>목표 {t}%</small></li>)}</ul></div> : <EmptyState text="오늘 기록이 있으면 열량 구성을 보여 드려요." />}</section>
      <section className="panel wide"><div className="panel-heading"><div><span className="eyebrow">LAST 7 DAYS</span><h3>최근 7일 열량 기록</h3></div><span className="legend-line">목표 {formatNumber(targets.calories)} kcal</span></div>{loading ? <p className="muted">불러오는 중...</p> : <div className="weekly-chart" style={{ '--goal': `${targets.calories / max * 100}%` }} role="img" aria-label={`최근 7일 열량: ${energy.map((n) => `${Math.round(n)}킬로칼로리`).join(', ')}`}><span className="goal-line" />{days.map((day, i) => <div className="chart-column" key={day}><span className="chart-value">{energy[i] ? Math.round(energy[i]) : ''}</span><div className="chart-track"><div className={energy[i] > targets.calories ? 'over' : ''} style={{ height: `${Math.max(energy[i] / max * 100, energy[i] ? 4 : 0)}%` }} /></div><small>{new Date(`${day}T12:00:00`).toLocaleDateString('ko-KR', { weekday: 'short' })}</small></div>)}</div>}</section></div>
    <ProfileEditor token={token} recommendation={recommendation} onSave={setRecommendation} />
    <div className="insight-callout"><span><Icon icon={faStethoscope} /></span><p>{daily.length ? totals.protein < targets.protein ? '오늘은 단백질이 목표보다 적게 기록되었어요. 균형 잡힌 식단을 위해 다양한 식품을 살펴보세요.' : '오늘의 단백질 섭취가 목표에 도달했어요. 다른 영양소도 함께 확인해 보세요.' : '아직 오늘의 식단 기록이 없어요. 첫 식사를 남겨 리포트를 완성해 보세요.'}</p><Link to="/journal">식단 기록하기 <Icon icon={faArrowRight} /></Link></div>
    <p className="medical-note"><Icon icon={faCircleExclamation} /> {recommendation.personalized ? '목표치는 Mifflin-St Jeor 공식과 활동량, 일반적인 영양소 비율로 추정한 값입니다.' : '목표치는 일반 성인용 예시입니다.'} 질환·임신 등 개인 상황을 반영한 의료적 조언이 아닙니다.</p>
    <AccountSection token={token} user={user} onWithdraw={onWithdraw} />
  </div></div>
}
function AccountSection({ token, user, onWithdraw }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const needsPassword = !user.provider
  async function withdraw(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/auth/me', { token, method: 'DELETE', body: JSON.stringify({ password: needsPassword ? password : null }) })
      onWithdraw()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return <section className="panel account-panel"><div className="panel-heading"><div><span className="eyebrow">ACCOUNT</span><h3>계정 관리</h3></div><span className="account-icon"><Icon icon={faUserXmark} /></span></div>
    {user.is_demo ? <p className="muted"><Icon icon={faLock} /> 공용 테스트 계정은 탈퇴할 수 없습니다.</p>
      : !open ? <div className="account-row"><p className="muted">회원 탈퇴를 하면 식단 기록, 영양 목표, 계정 정보가 모두 삭제되며 되돌릴 수 없습니다.</p><button className="text-button danger-link" onClick={() => setOpen(true)}>회원 탈퇴</button></div>
      : <form className="withdraw-box" onSubmit={withdraw}>
        <strong><Icon icon={faCircleExclamation} /> 정말 탈퇴하시겠어요?</strong>
        <p>모든 식단 기록과 개인 설정이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
        {needsPassword && <label>비밀번호 확인<input required type="password" value={password} autoComplete="current-password" placeholder="계정 비밀번호" onChange={(e) => setPassword(e.target.value)} /></label>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="withdraw-actions"><button type="submit" className="button button-danger" disabled={busy}>{busy ? '처리 중...' : '영구 삭제'}</button><button type="button" className="text-button" onClick={() => { setOpen(false); setPassword(''); setError('') }}>취소</button></div>
      </form>}
  </section>
}
function ProfileEditor({ token, recommendation, onSave }) {
  const [form, setForm] = useState({ age: '', biological_sex: 'female', height_cm: '', weight_kg: '', activity_level: 'light' })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setForm((previous) => ({ ...previous, ...Object.fromEntries(Object.entries(recommendation.profile || {}).filter(([, value]) => value != null)) })) }, [recommendation.profile])
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setSaved(false)
    try {
      const result = await api('/nutrition/profile', { token, method: 'PATCH', body: JSON.stringify({
        ...form, age: Number(form.age), height_cm: Number(form.height_cm), weight_kg: Number(form.weight_kg),
      }) })
      onSave(result); setSaved(true)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const bmi = form.height_cm && form.weight_kg ? Number(form.weight_kg) / (Number(form.height_cm) / 100) ** 2 : null
  return <section className="panel profile-panel" id="goal"><div className="panel-heading"><div><span className="eyebrow">MY HEALTH PROFILE</span><h3>나에게 맞는 목표 설정</h3></div>{bmi && <span className="bmi-chip">BMI {bmi.toFixed(1)}</span>}</div>
    <p>나이, 신체 정보와 활동량을 입력하면 기초대사량과 하루 에너지 소모량을 추정해 영양 목표에 반영합니다.</p>
    <form className="meal-form" onSubmit={save}><div className="profile-fields">
      <label>나이 (만)<input type="number" min="18" max="100" required value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></label>
      <label>생물학적 성별<select value={form.biological_sex} onChange={(e) => setForm({ ...form, biological_sex: e.target.value })}><option value="female">여성</option><option value="male">남성</option></select></label>
      <label>키 (cm)<input type="number" min="100" max="230" step="0.1" required value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} /></label>
      <label>몸무게 (kg)<input type="number" min="30" max="300" step="0.1" required value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} /></label>
      <label>활동량<select value={form.activity_level} onChange={(e) => setForm({ ...form, activity_level: e.target.value })}><option value="sedentary">거의 운동하지 않음</option><option value="light">가벼운 활동 (주 1~3회)</option><option value="moderate">보통 활동 (주 3~5회)</option><option value="active">많은 활동 (주 6~7회)</option></select></label>
    </div>{error && <div className="form-error" role="alert">{error}</div>}{saved && <p className="save-success" role="status"><Icon icon={faCheck} /> 목표가 업데이트되었습니다.</p>}
    <div className="profile-result">{nutrients.map(({ key, label, unit }) => <span key={key}>{label}<b>{formatNumber(recommendation.targets[key])}{unit}</b></span>)}<button type="submit" disabled={busy} className="button button-primary">{busy ? '저장 중...' : '나의 목표 계산하기'} <Icon icon={faArrowRight} /></button></div></form>
  </section>
}
function Admin({ token, user }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const readOnly = user.role !== 'admin'
  useEffect(() => { api('/admin/users', { token }).then(setUsers).catch((e) => setError(e.message)) }, [token])
  async function removeUser(id) {
    setBusyId(id)
    setError('')
    try {
      await api(`/admin/users/${id}`, { token, method: 'DELETE' })
      setUsers(users.filter((u) => u.id !== id))
      setConfirmId(null)
    } catch (e) { setError(e.message) } finally { setBusyId(null) }
  }
  async function changeRole(id, role) {
    setBusyId(id); setError('')
    try {
      const updated = await api(`/admin/users/${id}/role`, { token, method: 'PATCH', body: JSON.stringify({ role }) })
      setUsers(users.map((u) => u.id === id ? updated : u))
    } catch (e) { setError(e.message) } finally { setBusyId(null) }
  }
  const count = (role) => users.filter((u) => u.role === role).length
  return <div className="app-page"><div className="container"><PageHeading tag="ADMIN CONSOLE" title="회원 관리" description="회원 목록과 권한을 관리합니다. 모든 권한 변경은 서버가 다시 확인합니다." icon={faUserShield} />
    {readOnly ? <div className="admin-summary readonly"><Icon icon={faEye} /><div><strong>테스트 관리자 · 읽기 전용 모드</strong><p>회원 목록만 볼 수 있으며 권한은 변경할 수 없습니다. 실제 회원의 이름과 이메일은 가려서 표시됩니다.</p></div><span className="role-badge role-viewer"><Icon icon={faLock} /> READ ONLY</span></div>
      : <div className="admin-summary"><Icon icon={faShieldHeart} /><div><strong>관리자 전용 공간</strong><p>권한 변경은 즉시 적용됩니다. 본인 권한과 마지막 관리자의 권한은 변경할 수 없습니다.</p></div></div>}
    <div className="role-stats">{[['전체 회원', users.length, faUsers, ''], ['관리자', count('admin'), faUserShield, 'admin'], ['테스트 관리자', count('viewer'), faEye, 'viewer'], ['일반 사용자', count('user'), faUser, 'user']].map(([label, n, icon, role]) => <div key={label} className={`role-stat ${role}`}><Icon icon={icon} /><span>{label}</span><strong>{n}</strong></div>)}</div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="panel admin-panel"><div className="panel-heading"><div><span className="eyebrow">MEMBERS</span><h3>회원 목록</h3></div><div className="role-legend"><span><em className="role-badge role-admin">관리자</em> 모든 권한</span><span><em className="role-badge role-viewer">테스트 관리자</em> 읽기 전용</span><span><em className="role-badge role-user">일반 사용자</em> 본인 기록</span></div></div>
      <div className="table-scroll"><table><thead><tr><th>회원</th><th>이메일</th><th>가입 방식</th><th>현재 권한</th><th>권한 변경</th><th>삭제</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><div className="table-person"><span><Icon icon={faUser} /></span><strong>{item.name}{item.id === user.id ? ' (나)' : ''}</strong></div></td><td>{item.email}</td><td>{item.provider || '이메일'}</td><td><em className={`role-badge role-${item.role}`}>{roleLabels[item.role] || item.role}</em></td><td>{readOnly ? <span className="locked"><Icon icon={faLock} /> 읽기 전용</span> : <select aria-label={`${item.name} 권한`} disabled={item.id === user.id || busyId === item.id} value={item.role} onChange={(e) => changeRole(item.id, e.target.value)}><option value="user">일반 사용자</option><option value="viewer">테스트 관리자 (읽기 전용)</option><option value="admin">관리자</option></select>}</td><td>{readOnly || item.id === user.id || item.is_demo ? <span className="locked">{readOnly ? <><Icon icon={faLock} /> 읽기 전용</> : '—'}</span> : confirmId === item.id ? <span className="confirm-inline"><button className="danger-link" disabled={busyId === item.id} onClick={() => removeUser(item.id)}>{busyId === item.id ? '삭제 중...' : '삭제 확정'}</button><button className="text-button" onClick={() => setConfirmId(null)}>취소</button></span> : <button className="icon-button danger" aria-label={`${item.name} 회원 삭제`} title="회원 삭제" onClick={() => setConfirmId(item.id)}><Icon icon={faTrashCan} /></button>}</td></tr>)}</tbody></table></div>{!users.length && <EmptyState text="표시할 회원이 없습니다." />}</div>
  </div></div>
}
function Policy() {
  const location = useLocation()
  useEffect(() => { if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' }), 100) }, [location.hash])
  return <div className="app-page"><div className="container policy">
    <PageHeading tag="POLICY" title="개인정보 · 서비스 이용 안내" description="vitapick이 어떤 정보를 어떻게 다루는지 실제 구현 그대로 안내합니다." icon={faFileShield} />
    <section className="panel" id="privacy"><h3><Icon icon={faLock} /> 개인정보 처리 안내</h3><ul>
      <li><b>수집 항목</b> 이메일, 이름, 비밀번호(Argon2 해시로만 저장), 소셜 로그인 식별자, 선택 입력한 나이·성별·키·몸무게·활동량, 식단 기록</li>
      <li><b>이용 목적</b> 로그인, 개인 영양 목표 계산, 식단 리포트 제공. 광고나 제3자 판매에 쓰지 않습니다.</li>
      <li><b>보관 위치</b> TiDB Cloud 데이터베이스(TLS 연결). 식단과 신체 정보는 본인 계정으로만 조회됩니다.</li>
      <li><b>관리자 열람</b> 관리자는 회원의 이름·이메일·가입 방식·권한만 봅니다. 테스트 관리자에게는 실제 회원 정보가 가려져 표시됩니다.</li>
      <li><b>회원 탈퇴</b> 영양 리포트 페이지 하단의 계정 관리에서 직접 탈퇴할 수 있습니다. 탈퇴 시 식단 기록·영양 목표·계정 정보가 즉시 삭제됩니다.</li>
      <li><b>삭제 요청</b> <a href={`${REPO}/issues`} target="_blank" rel="noopener">GitHub Issues</a>로 요청할 수 있습니다.</li></ul></section>
    <section className="panel" id="ai"><h3><Icon icon={faWandMagicSparkles} /> AI 기능 안내</h3><ul>
      <li>문장으로 기록할 때 입력한 문장은 Google Gemini API로 전송되어 음식명·식사 구분·날짜·섭취량으로 나뉩니다. API 키가 없거나 응답에 실패하면 서버 내 규칙 분석기가 처리합니다.</li>
      <li>열량·단백질·탄수화물·지방은 AI가 만들지 않고, 공공데이터 식품영양성분 DB의 100g 기준값에 섭취량을 곱해 계산합니다.</li>
      <li>문장에는 건강 상태 등 민감한 정보를 적지 마세요. 분석 결과는 저장 전에 직접 확인·수정할 수 있습니다.</li></ul></section>
    <section className="panel" id="terms"><h3><Icon icon={faStethoscope} /> 서비스 이용 안내</h3><ul>
      <li>목표치와 분석 결과는 Mifflin-St Jeor 공식과 일반적인 영양소 비율로 계산한 참고 정보이며, 의료 진단·처방을 대신하지 않습니다.</li>
      <li>공공데이터 수치는 제조사·조리법에 따라 실제와 다를 수 있습니다.</li>
      <li>테스트 계정은 여러 사람이 함께 쓰는 공용 계정이므로 실제 개인 정보를 입력하지 마세요.</li></ul></section>
  </div></div>
}

createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>)
