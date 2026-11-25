import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon as Icon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faArrowUp, faBolt, faCalendarDays, faChartSimple, faCheck, faChevronRight, faCircleExclamation, faHeartPulse, faLeaf, faLock, faPlus, faShieldHeart, faTrashCan, faUser, faUsers, faUtensils, faXmark } from '@fortawesome/free-solid-svg-icons'
import { faGoogle } from '@fortawesome/free-brands-svg-icons'
import { api, apiBase } from './api'
import './style.css'

const defaultTargets = { calories: 2000, protein: 55, carbs: 275, fat: 70 }
const nutrients = [
  { key: 'calories', label: '열량', unit: 'kcal', color: 'orange' },
  { key: 'protein', label: '단백질', unit: 'g', color: 'green' },
  { key: 'carbs', label: '탄수화물', unit: 'g', color: 'blue' },
  { key: 'fat', label: '지방', unit: 'g', color: 'yellow' },
]
const navItems = [
  { to: '/dashboard', label: '대시보드', icon: faChartSimple },
  { to: '/journal', label: '식단 기록', icon: faUtensils },
  { to: '/insights', label: '영양 리포트', icon: faHeartPulse },
]
const today = () => new Date().toLocaleDateString('sv-SE')
const formatNumber = (number) => Number(number || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })

function Logo() {
  return <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="18" className="logo-bg" />
    <g fill="none" strokeWidth="6" strokeLinecap="round" transform="rotate(-90 32 32)">
      <circle cx="32" cy="32" r="19" stroke="#f2b45c" strokeDasharray="56 120" />
      <circle cx="32" cy="32" r="19" stroke="#ef7d63" strokeDasharray="20 120" strokeDashoffset="-62" />
      <circle cx="32" cy="32" r="19" stroke="#7cc8a8" strokeDasharray="31 120" strokeDashoffset="-88" />
    </g>
    <path d="M24.5 33.5l5.2 5.2c5.8-9.6 10.3-12.6 13.8-13.8-6.6 1.2-10.6 4.7-13.8 8.4l-5.2-5z" fill="#fff" />
  </svg>
}
function Brand({ light = false }) {
  return <Link to="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="케어픽 홈">
    <Logo /><span className="brand-word">care<b>pick</b></span>
  </Link>
}
function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('carepick_token'))
  const [user, setUser] = useState(null)
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const logout = useCallback(() => {
    sessionStorage.removeItem('carepick_token')
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
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])
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
    sessionStorage.setItem('carepick_token', result.access_token)
    setToken(result.access_token)
    setUser(result.user)
    navigate('/dashboard', { replace: true })
  }, [navigate])

  const links = user ? [...navItems, ...(user.role === 'admin' ? [{ to: '/admin', label: '회원 관리', icon: faUsers }] : [])] : []
  return <>
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="주 메뉴">
          {user ? links.map(({ to, label }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>) : <>
            <a href="/#features">서비스 소개</a><a href="/#how">이용 방법</a>
          </>}
        </nav>
        <div className="header-actions">
          {user ? <><span className="user-greeting">{user.name}님, 안녕하세요</span><button className="text-button desktop-only" onClick={logout}>로그아웃</button></> : <>
            <Link className="text-button desktop-only" to="/login">로그인</Link><Link className="button button-dark desktop-only" to="/login?mode=register">시작하기 <Icon icon={faArrowRight} /></Link>
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
      <p className="eyebrow">YOUR WELLNESS, YOUR WAY</p>
      <nav aria-label="모바일 메뉴">
        {user ? links.map(({ to, label, icon }) => <NavLink key={to} to={to}><Icon icon={icon} /> {label} <Icon className="nav-chevron" icon={faChevronRight} /></NavLink>) :
          <><Link to="/">홈 <Icon className="nav-chevron" icon={faChevronRight} /></Link><a href="/#features" onClick={() => setDrawer(false)}>서비스 소개 <Icon className="nav-chevron" icon={faChevronRight} /></a><a href="/#how" onClick={() => setDrawer(false)}>이용 방법 <Icon className="nav-chevron" icon={faChevronRight} /></a></>}
      </nav>
      <div className="drawer-bottom">{user ? <button className="button button-outline" onClick={logout}>로그아웃</button> : <Link className="button button-dark" to="/login">로그인 / 시작하기 <Icon icon={faArrowRight} /></Link>}</div>
    </aside>
    <main>
      <Routes>
        <Route path="/" element={user ? <Dashboard token={token} user={user} /> : <Home />} />
        <Route path="/login" element={user ? <Dashboard token={token} user={user} /> : <Login onLogin={signedIn} />} />
        <Route path="/dashboard" element={user ? <Dashboard token={token} user={user} /> : <Login onLogin={signedIn} />} />
        <Route path="/journal" element={user ? <Journal token={token} /> : <Login onLogin={signedIn} />} />
        <Route path="/insights" element={user ? <Insights token={token} /> : <Login onLogin={signedIn} />} />
        <Route path="/admin" element={user?.role === 'admin' ? <Admin token={token} user={user} /> : user ? <AdminOnly /> : <Login onLogin={signedIn} />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </main>
    <footer className="site-footer">
      <div className="footer-inner">
        <div><Brand light /><p>오늘의 작은 선택이<br />내일의 건강을 만듭니다.</p></div>
        <div className="footer-right"><span>공공데이터를 바탕으로, 나를 위한 건강한 기록</span><button className="top-button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="맨 위로 이동"><Icon icon={faArrowUp} /></button></div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} carepick · 본 서비스는 의료 진단을 대신하지 않습니다.</span><span className="credits">Photos: {PHOTOS.map(([, n, id], i) => <a key={id} href={`https://unsplash.com/photos/${id}`} target="_blank" rel="noopener">{n}{i < PHOTOS.length - 1 ? ", " : ""}</a>)} on Unsplash</span></div>
    </footer>
  </>
}

const PHOTOS = [
  ['hero-bowl.jpg', 'Anna Pelzer', 'IGfIGP5ONV0'], ['colorful-bowl.jpg', 'Metin Ozer', 'Dmhjy9fDTKw'],
  ['avocado-bowl.jpg', 'Hermes Rivera', 'OzBLe_Eg1mg'], ['green-salad.jpg', 'sina piryae', 'bBzjWthTqb8'], ['salad-table.jpg', 'Roland Suciu', 'LlvSGfe0oSQ'],
]
function Home() {
  return <>
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="hero-badge"><i /> 공공데이터 1,095개 식품 · 개인 맞춤 영양 목표</span>
          <h1>오늘의 접시를<br /><em>나에게 맞게</em> 고르다.</h1>
          <p>먹은 음식을 검색해 기록하면, 나이·키·몸무게·활동량으로 계산한 나만의 목표와 비교해 탄수화물·단백질·지방의 균형을 한눈에 보여 드립니다.</p>
          <div className="hero-actions"><Link className="button button-dark button-large" to="/login?mode=register">나의 접시 시작하기 <Icon icon={faArrowRight} /></Link><a className="hero-link" href="#how">어떻게 계산하나요? <Icon icon={faChevronRight} /></a></div>
          <ul className="hero-legend"><li><i className="dot carbs" />탄수화물 50%</li><li><i className="dot protein" />단백질 20%</li><li><i className="dot fat" />지방 30%</li></ul>
        </div>
        <div className="hero-plate" aria-label="영양 균형 접시 예시">
          <div className="plate-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><g fill="none" strokeWidth="9" strokeLinecap="round" transform="rotate(-90 100 100)">
            <circle cx="100" cy="100" r="94" stroke="#f2b45c" strokeDasharray="286 591" />
            <circle cx="100" cy="100" r="94" stroke="#ef7d63" strokeDasharray="108 591" strokeDashoffset="-298" />
            <circle cx="100" cy="100" r="94" stroke="#7cc8a8" strokeDasharray="166 591" strokeDashoffset="-418" /></g></svg></div>
          <img src="/images/hero-bowl.jpg" alt="채소와 곡물이 담긴 샐러드 볼" className="plate-photo" />
          <div className="plate-chip chip-kcal"><strong>1,820</strong><span>kcal · 하루 목표</span></div>
          <div className="plate-chip chip-macro"><span><i className="dot carbs" />탄 228g</span><span><i className="dot protein" />단 91g</span><span><i className="dot fat" />지 61g</span></div>
          <div className="plate-chip chip-note"><Icon icon={faCheck} /> 30세 · 165cm · 60kg · 가벼운 활동 예시</div>
        </div>
      </div>
    </section>
    <section className="strip" aria-hidden="true"><div className="strip-track">{[...PHOTOS, ...PHOTOS].map(([f], i) => <img key={i} src={`/images/${f}`} alt="" loading="lazy" />)}</div></section>
    <section className="features section-pad" id="features">
      <div className="container">
        <div className="section-heading"><span className="eyebrow">WHY CAREPICK</span><h2>기록은 가볍게, 목표는 <em>나에게 맞게.</em></h2></div>
        <div className="feature-grid">
          <article className="feature-card fc-carbs"><img src="/images/colorful-bowl.jpg" alt="" loading="lazy" /><div><span className="feature-num">01 · RECORD</span><h3>검색하면 채워지는 영양값</h3><p>음식 이름 두 글자면 공공데이터에서 찾아 100g 기준 영양값을 자동으로 채웁니다.</p></div></article>
          <article className="feature-card fc-protein"><img src="/images/avocado-bowl.jpg" alt="" loading="lazy" /><div><span className="feature-num">02 · TARGET</span><h3>나만의 하루 목표</h3><p>Mifflin-St Jeor 공식과 활동량으로 하루 열량과 3대 영양소 목표를 계산합니다.</p></div></article>
          <article className="feature-card fc-fat"><img src="/images/green-salad.jpg" alt="" loading="lazy" /><div><span className="feature-num">03 · BALANCE</span><h3>한눈에 보는 균형</h3><p>목표 대비 오늘의 진행률과 최근 7일 열량 흐름을 리포트로 보여 줍니다.</p></div></article>
        </div>
      </div>
    </section>
    <section className="how-section section-pad" id="how"><div className="container how-grid">
      <div className="how-photo"><img src="/images/salad-table.jpg" alt="식탁 위 샐러드" loading="lazy" /></div>
      <div><span className="eyebrow">HOW IT WORKS</span><h2>세 단계면 <em>나의 접시</em>가 완성됩니다.</h2>
        <ol className="how-steps"><li><b>1</b><div><strong>프로필 입력</strong><span>나이 · 키 · 몸무게 · 활동량</span></div></li><li><b>2</b><div><strong>식단 기록</strong><span>공공데이터 검색으로 영양값 자동 입력</span></div></li><li><b>3</b><div><strong>균형 확인</strong><span>목표 대비 진행률 · 최근 7일 리포트</span></div></li></ol>
        <Link className="button button-dark" to="/login">지금 시작하기 <Icon icon={faArrowRight} /></Link></div>
    </div></section>
  </>
}
function Login({ onLogin }) {
  const location = useLocation()
  const [mode, setMode] = useState(new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [providers, setProviders] = useState({})
  const [demoEnabled, setDemoEnabled] = useState(false)
  useEffect(() => { setMode(new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login') }, [location.search])
  useEffect(() => { api('/auth/oauth/providers').then(setProviders).catch(() => {}) }, [])
  useEffect(() => { api('/auth/demo-status').then((d) => setDemoEnabled(d.enabled)).catch(() => {}) }, [])
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('code')
    const oauthError = new URLSearchParams(location.search).get('error')
    if (oauthError) setError('소셜 로그인에 실패했습니다. 계정 설정을 확인해 주세요.')
    if (!code) return
    setBusy(true)
    api('/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ code }) }).then(onLogin).catch((e) => setError(e.message)).finally(() => setBusy(false))
  }, [location.search, onLogin])

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (mode === 'register' && !/^(?=.{8,128}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/.test(form.password)) {
      setError('영문 대·소문자, 숫자, 특수문자를 포함한 8자 이상의 비밀번호를 입력해 주세요.')
      return
    }
    setBusy(true)
    try {
      const result = await api(mode === 'register' ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(form) })
      onLogin(result)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function demo(role) {
    setError('')
    setBusy(true)
    try { onLogin(await api('/auth/demo-login', { method: 'POST', body: JSON.stringify({ role }) })) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="auth-layout">
    <div className="auth-brand-panel">
      <div className="auth-panel-inner"><span className="eyebrow">A BETTER YOU STARTS HERE</span><h1>나를 돌보는<br />가장 좋은 방법,<br /><em>오늘부터.</em></h1><p>하루의 식탁에서 시작하는 건강한 변화.<br />당신의 모든 선택을 케어픽이 응원합니다.</p></div>
      <div className="auth-panel-art"><img src="/images/colorful-bowl.jpg" alt="" /><span className="auth-art-label"><i className="dot carbs" /><i className="dot protein" /><i className="dot fat" /> 나에게 맞는 접시</span></div>
      <div className="auth-panel-footer"><Icon icon={faLeaf} /> SMALL STEPS. BETTER DAYS.</div>
    </div>
    <div className="auth-form-panel"><div className="auth-form-wrap">
      <div className="auth-heading"><span className="eyebrow">WELCOME TO CAREPICK</span><h2>{mode === 'login' ? '다시 만나서 반가워요.' : '건강한 변화를 시작해요.'}</h2><p>{mode === 'login' ? '오늘도 나를 위한 건강한 선택을 이어가 볼까요?' : '간단한 정보만 입력하면 바로 시작할 수 있어요.'}</p></div>
      <div className="auth-tabs"><button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError('') }}>로그인</button><button type="button" className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError('') }}>회원가입</button></div>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <label>이름<input required value={form.name} maxLength={80} autoComplete="name" placeholder="이름을 입력해 주세요" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>}
        <label>이메일 주소<input required type="email" value={form.email} autoComplete="email" placeholder="name@example.com" onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>비밀번호<input required type="password" value={form.password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="비밀번호를 입력해 주세요" minLength={mode === 'register' ? 8 : undefined} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {mode === 'register' && <p className="password-hint"><Icon icon={faLock} /> 영문 대·소문자, 숫자, 특수문자 포함 8자 이상</p>}
        {error && <div className="form-error" role="alert"><Icon icon={faCircleExclamation} /> {error}</div>}
        <button className="button button-dark auth-submit" disabled={busy} type="submit">{busy ? '처리 중...' : mode === 'login' ? '로그인하기' : '계정 만들기'} <Icon icon={faArrowRight} /></button>
      </form>
      <div className="divider"><span>또는 간편하게 시작하기</span></div>
      <div className="social-row">
        <button type="button" disabled={!providers.google} title={providers.google ? 'Google로 로그인' : 'Google 로그인 설정 대기 중'} aria-label="Google로 로그인" className="social-button google" onClick={() => window.location.assign(`${apiBase}/api/auth/oauth/google/start`)}><Icon icon={faGoogle} /></button>
        <button type="button" disabled={!providers.naver} title={providers.naver ? '네이버로 로그인' : '네이버 로그인 설정 대기 중'} aria-label="네이버로 로그인" className="social-button naver" onClick={() => window.location.assign(`${apiBase}/api/auth/oauth/naver/start`)}>N</button>
        <button type="button" disabled={!providers.kakao} title={providers.kakao ? '카카오로 로그인' : '카카오 로그인 설정 대기 중'} aria-label="카카오로 로그인" className="social-button kakao" onClick={() => window.location.assign(`${apiBase}/api/auth/oauth/kakao/start`)}>K</button>
      </div>
      {demoEnabled && <><div className="demo-box"><div><strong>먼저 둘러보고 싶으신가요?</strong><p>테스트 계정으로 바로 체험해 보세요.</p></div><div className="demo-actions"><button disabled={busy} onClick={() => demo('user')}><Icon icon={faUser} /> 일반 사용자</button><button disabled={busy} onClick={() => demo('admin')}><Icon icon={faShieldHeart} /> 관리자</button></div></div>
      <p className="auth-terms">테스트 계정은 여러 사람이 함께 쓰는 공용 계정입니다. 실제 개인 정보는 입력하지 마세요.</p></>}
    </div></div>
  </div>
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
function PageHeading({ tag, title, description, icon }) {
  return <div className="page-heading"><div><span className="eyebrow">{tag}</span><h1>{title}</h1><p>{description}</p></div><span className="page-heading-icon"><Icon icon={icon} /></span></div>
}
function Progress({ value, target, color }) {
  return <div className={`progress-track ${color}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={target} aria-valuemin={0}><span style={{ width: `${Math.min(value / target * 100, 100)}%` }} /></div>
}
function Dashboard({ token, user }) {
  const { meals, error, loading } = useMeals(token)
  const { data: recommendation } = useTargets(token)
  const targets = recommendation.targets
  const current = meals.filter((m) => m.eaten_at === today())
  const totals = totalsFor(current)
  const hour = new Date().getHours()
  const greeting = hour < 11 ? '좋은 아침이에요' : hour < 17 ? '좋은 오후예요' : '수고한 하루였어요'
  return <div className="app-page"><div className="container">
    <PageHeading tag="YOUR DAILY WELLNESS" title={`${user.name}님, ${greeting}.`} description="오늘의 작은 기록이 건강한 내일을 만들어요." icon={faLeaf} />
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="dashboard-intro"><div><span className="eyebrow">TODAY AT A GLANCE</span><h2>오늘의 나를<br /><em>한눈에 살펴보세요.</em></h2><p>{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p></div><div className="intro-stat"><span>오늘 기록한 식사</span><strong>{current.length}<small>회</small></strong><Icon icon={faUtensils} /></div></div>
    <div className="stat-grid">{nutrients.map(({ key, label, unit, color }) => <article className="stat-card" key={key}><div className="stat-top"><span className={`stat-symbol ${color}`}><Icon icon={key === 'calories' ? faBolt : key === 'protein' ? faHeartPulse : key === 'carbs' ? faLeaf : faChartSimple} /></span><span>{label}</span></div><div className="stat-value">{formatNumber(totals[key])}<small> / {formatNumber(targets[key])} {unit}</small></div><Progress value={totals[key]} target={targets[key]} color={color} /></article>)}</div>
    <div className="content-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">MEAL JOURNAL</span><h3>오늘의 식단</h3></div><Link to="/journal" className="inline-link">전체 보기 <Icon icon={faArrowRight} /></Link></div>{loading ? <p className="muted">불러오는 중...</p> : current.length ? <div className="meal-list">{current.slice(0, 4).map((m) => <div className="meal-row" key={m.id}><span className="meal-icon"><Icon icon={faUtensils} /></span><div><strong>{m.food_name}</strong><small>{m.meal_type} · {m.serving_g}g</small></div><b>{formatNumber(m.calories)} <small>kcal</small></b></div>)}</div> : <EmptyState text="아직 기록된 식사가 없어요." />}<Link to="/journal" className="button button-soft"><Icon icon={faPlus} /> 식단 기록하기</Link></section>
    <section className="panel tip-panel"><div className="panel-heading"><div><span className="eyebrow">A LITTLE REMINDER</span><h3>오늘의 케어 노트</h3></div><span className="tip-leaf"><Icon icon={faLeaf} /></span></div><div className="tip-illustration"><Icon icon={faHeartPulse} /></div><h4>{current.length ? '오늘도 잘 기록하셨어요!' : '첫 기록을 남겨볼까요?'}</h4><p>{current.length ? '내 식습관을 알아가는 것이 건강한 변화의 시작이에요. 영양 리포트에서 균형을 확인해 보세요.' : '무엇을 먹었는지 적어보세요. 작은 기록이 나만의 건강 패턴을 발견하는 첫걸음입니다.'}</p><Link to="/insights" className="inline-link">나의 리포트 확인하기 <Icon icon={faArrowRight} /></Link></section></div>
    <p className="medical-note"><Icon icon={faCircleExclamation} /> {recommendation.personalized ? '목표치는 입력한 신체 정보와 활동량으로 추정한 참고값입니다.' : '표시된 목표치는 일반 성인 예시입니다.'} 의료·영양 상담을 대신하지 않습니다.</p>
  </div></div>
}
function AdminOnly() {
  return <div className="app-page"><div className="container"><div className="panel admin-only" role="alert">
    <span className="admin-only-icon"><Icon icon={faLock} /></span>
    <span className="eyebrow">ADMIN ONLY</span>
    <h1>관리자 전용 화면입니다.</h1>
    <p>회원 관리는 관리자 권한이 있는 계정만 이용할 수 있습니다. 서버도 모든 관리자 요청의 권한을 다시 확인합니다.</p>
    <Link to="/dashboard" className="button button-dark">대시보드로 돌아가기 <Icon icon={faArrowRight} /></Link>
  </div></div></div>
}
function EmptyState({ text }) { return <div className="empty-state"><Icon icon={faCalendarDays} /><p>{text}</p></div> }
function Journal({ token }) {
  const { meals, error, setError, loading, refresh } = useMeals(token)
  const [form, setForm] = useState({ food_name: '', meal_type: '아침', eaten_at: today(), serving_g: 100, calories: '', protein: '', carbs: '', fat: '' })
  const [saving, setSaving] = useState(false)
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
      setForm({ ...form, food_name: '', calories: '', protein: '', carbs: '', fat: '' })
      setQuery(''); setFoods([]); refresh()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  async function remove(id) {
    try { await api(`/meals/${id}`, { token, method: 'DELETE' }); refresh() }
    catch (err) { setError(err.message) }
  }
  return <div className="app-page"><div className="container"><PageHeading tag="YOUR FOOD JOURNAL" title="식단 기록" description="오늘의 식탁을 기록하고, 나만의 건강 패턴을 발견해 보세요." icon={faUtensils} />
    <div className="journal-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">ADD A MEAL</span><h3>새 식사 기록</h3></div><span className="round-plus"><Icon icon={faPlus} /></span></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form onSubmit={save} className="meal-form"><label>음식 이름<input required maxLength={120} placeholder="예: 현미밥" value={form.food_name} onChange={(e) => { setForm({ ...form, food_name: e.target.value }); setQuery(e.target.value) }} /></label>
      {foods.length > 0 && <div className="food-suggestions" aria-label="공공데이터 음식 검색 결과">{foods.map((food) => <button type="button" key={food.id} onClick={() => { setForm({ ...form, food_name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, serving_g: 100 }); setFoods([]); setQuery('') }}>{food.name} <small>100g · {food.calories} kcal</small></button>)}</div>}
      <div className="form-two"><label>식사 구분<select value={form.meal_type} onChange={(e) => setForm({ ...form, meal_type: e.target.value })}><option>아침</option><option>점심</option><option>저녁</option><option>간식</option></select></label><label>날짜<input required type="date" value={form.eaten_at} onChange={(e) => setForm({ ...form, eaten_at: e.target.value })} /></label></div>
      <div className="form-two"><label>섭취량 (g)<input required type="number" min="1" max="10000" value={form.serving_g} onChange={(e) => setForm({ ...form, serving_g: e.target.value })} /></label><label>열량 (kcal)<input required type="number" min="0" max="20000" step="any" placeholder="0" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} /></label></div>
      <div className="form-three">{['protein', 'carbs', 'fat'].map((key) => <label key={key}>{nutrients.find((n) => n.key === key).label} (g)<input required type="number" min="0" max="10000" step="any" placeholder="0" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}</div>
      <p className="form-hint">검색 결과의 영양값은 100g 기준입니다. 섭취량이 다르면 영양값을 직접 조정해 주세요.</p><button disabled={saving} className="button button-dark form-submit" type="submit"><Icon icon={faPlus} /> {saving ? '저장 중...' : '기록 추가하기'}</button></form></section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">YOUR HISTORY</span><h3>기록한 식사 <span className="count-pill">{meals.length}</span></h3></div></div>{loading ? <p className="muted">불러오는 중...</p> : meals.length ? <div className="meal-list journal-list">{meals.map((m) => <div className="meal-row" key={m.id}><span className="meal-icon"><Icon icon={faUtensils} /></span><div><strong>{m.food_name}</strong><small>{m.eaten_at} · {m.meal_type} · {m.serving_g}g</small><small>단백질 {formatNumber(m.protein)}g · 탄수화물 {formatNumber(m.carbs)}g · 지방 {formatNumber(m.fat)}g</small></div><b>{formatNumber(m.calories)}<small> kcal</small></b><button className="delete-button" aria-label={`${m.food_name} 기록 삭제`} onClick={() => remove(m.id)}><Icon icon={faTrashCan} /></button></div>)}</div> : <EmptyState text="아직 기록이 없어요. 첫 식사를 추가해 보세요." />}</section></div>
    <p className="medical-note"><Icon icon={faCircleExclamation} /> 공공데이터 수치는 100g 기준이며 제조사·조리법에 따라 달라질 수 있습니다.</p>
  </div></div>
}
function Insights({ token }) {
  const { meals, error, loading } = useMeals(token)
  const { data: recommendation, setData: setRecommendation, error: targetError } = useTargets(token)
  const targets = recommendation.targets
  const daily = meals.filter((m) => m.eaten_at === today())
  const totals = totalsFor(daily)
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toLocaleDateString('sv-SE') })
  const energy = days.map((day) => totalsFor(meals.filter((m) => m.eaten_at === day)).calories)
  const max = Math.max(2000, ...energy)
  return <div className="app-page"><div className="container"><PageHeading tag="NUTRITION INSIGHTS" title="나의 영양 리포트" description="숫자 너머의 내 식습관을 살펴보세요." icon={faChartSimple} />
    {(error || targetError) && <div className="form-error" role="alert">{error || targetError}</div>}
    <div className="report-banner"><div><span className="eyebrow">TODAY'S REPORT</span><h2>나를 이해하는<br /><em>건강한 한 걸음.</em></h2><p>오늘 {daily.length}개의 식사를 기록했어요. 꾸준히 기록할수록 나의 패턴이 보입니다.</p></div><div className="report-icon"><Icon icon={faHeartPulse} /></div></div>
    <div className="content-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">DAILY BALANCE</span><h3>오늘의 영양 균형</h3></div></div>{nutrients.map(({ key, label, unit, color }) => <div className="report-nutrient" key={key}><div><strong>{label}</strong><span>{formatNumber(totals[key])} / {formatNumber(targets[key])} {unit}</span></div><Progress value={totals[key]} target={targets[key]} color={color} /></div>)}</section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">LAST 7 DAYS</span><h3>최근 7일 열량 기록</h3></div></div>{loading ? <p className="muted">불러오는 중...</p> : <div className="weekly-chart" role="img" aria-label={`최근 7일 열량: ${energy.map((n) => `${Math.round(n)}킬로칼로리`).join(', ')}`}>{days.map((day, i) => <div className="chart-column" key={day}><span className="chart-value">{energy[i] ? Math.round(energy[i]) : ''}</span><div className="chart-track"><div style={{ height: `${Math.max(energy[i] / max * 100, energy[i] ? 4 : 0)}%` }} /></div><small>{new Date(`${day}T12:00:00`).toLocaleDateString('ko-KR', { weekday: 'short' })}</small></div>)}</div>}</section></div>
    <ProfileEditor token={token} recommendation={recommendation} onSave={setRecommendation} />
    <div className="insight-callout"><span><Icon icon={faLeaf} /></span><p>{daily.length ? totals.protein < targets.protein ? '오늘은 단백질이 예시 목표보다 적게 기록되었어요. 균형 잡힌 식단을 위해 다양한 식품을 살펴보세요.' : '오늘의 단백질 섭취가 예시 목표에 도달했어요. 다른 영양소도 함께 확인해 보세요.' : '아직 오늘의 식단 기록이 없어요. 첫 식사를 남겨 리포트를 완성해 보세요.'}</p><Link to="/journal">식단 기록하기 <Icon icon={faArrowRight} /></Link></div>
    <p className="medical-note"><Icon icon={faCircleExclamation} /> {recommendation.personalized ? '목표치는 Mifflin-St Jeor 공식과 활동량, 일반적인 영양소 비율로 추정한 값입니다.' : '목표치는 일반 성인용 예시입니다.'} 질환·임신 등 개인 상황을 반영한 의료적 조언이 아닙니다.</p>
  </div></div>
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
  return <section className="panel profile-panel"><div className="panel-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h3>나에게 맞는 목표 설정</h3></div><span className="tip-leaf"><Icon icon={faHeartPulse} /></span></div>
    <p>나이, 신체 정보와 활동량을 입력하면 일일 에너지 소모량을 추정해 영양 목표에 반영합니다.</p>
    <form className="meal-form" onSubmit={save}><div className="profile-fields">
      <label>나이 (만)<input type="number" min="18" max="100" required value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></label>
      <label>생물학적 성별<select value={form.biological_sex} onChange={(e) => setForm({ ...form, biological_sex: e.target.value })}><option value="female">여성</option><option value="male">남성</option></select></label>
      <label>키 (cm)<input type="number" min="100" max="230" step="0.1" required value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} /></label>
      <label>몸무게 (kg)<input type="number" min="30" max="300" step="0.1" required value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} /></label>
      <label>활동량<select value={form.activity_level} onChange={(e) => setForm({ ...form, activity_level: e.target.value })}><option value="sedentary">거의 운동하지 않음</option><option value="light">가벼운 활동 (주 1~3회)</option><option value="moderate">보통 활동 (주 3~5회)</option><option value="active">많은 활동 (주 6~7회)</option></select></label>
    </div>{error && <div className="form-error" role="alert">{error}</div>}{saved && <p className="save-success" role="status"><Icon icon={faCheck} /> 목표가 업데이트되었습니다.</p>}
    <button type="submit" disabled={busy} className="button button-dark">{busy ? '저장 중...' : '나의 목표 계산하기'} <Icon icon={faArrowRight} /></button></form>
  </section>
}
function Admin({ token, user }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  useEffect(() => { api('/admin/users', { token }).then(setUsers).catch((e) => setError(e.message)) }, [token])
  async function changeRole(id, role) {
    setBusyId(id); setError('')
    try {
      const updated = await api(`/admin/users/${id}/role`, { token, method: 'PATCH', body: JSON.stringify({ role }) })
      setUsers(users.map((u) => u.id === id ? updated : u))
    } catch (e) { setError(e.message) } finally { setBusyId(null) }
  }
  return <div className="app-page"><div className="container"><PageHeading tag="ADMIN CONSOLE" title="회원 관리" description="회원 목록을 확인하고 서비스 권한을 안전하게 관리하세요." icon={faUsers} />
    <div className="admin-summary"><Icon icon={faShieldHeart} /><div><strong>{user.is_demo ? '테스트 관리자 체험 모드' : '관리자 전용 공간'}</strong><p>{user.is_demo ? '실제 회원 정보는 가려서 표시되며, 권한은 테스트 계정끼리만 변경할 수 있습니다.' : '회원 권한 변경은 즉시 적용됩니다. 본인 권한은 변경할 수 없습니다.'}</p></div><span>전체 회원 {users.length}명</span></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="panel admin-panel"><div className="panel-heading"><div><span className="eyebrow">MEMBERS</span><h3>회원 목록</h3></div></div><div className="table-scroll"><table><thead><tr><th>회원</th><th>이메일</th><th>가입 방식</th><th>권한</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><div className="table-person"><span><Icon icon={faUser} /></span><strong>{item.name}{item.id === user.id ? ' (나)' : ''}</strong></div></td><td>{item.email}</td><td>{item.provider || '이메일'}</td><td><select aria-label={`${item.name} 권한`} disabled={item.id === user.id || busyId === item.id} value={item.role} onChange={(e) => changeRole(item.id, e.target.value)}><option value="user">일반 사용자</option><option value="admin">관리자</option></select></td></tr>)}</tbody></table></div>{!users.length && <EmptyState text="표시할 회원이 없습니다." />}</div>
  </div></div>
}

createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>)
