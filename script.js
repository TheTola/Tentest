
document.addEventListener('DOMContentLoaded', () => {
  const overlay   = document.getElementById('curtain-overlay');
  const cLeft     = document.getElementById('curtain-left');
  const cRight    = document.getElementById('curtain-right');
  const beginBtn  = document.getElementById('begin-button');

  const slides    = Array.from(document.querySelectorAll('.slide'));
  const prevBtn   = document.getElementById('prev');
  const nextBtn   = document.getElementById('next');
  const progress  = document.getElementById('progress');

  const turn       = document.getElementById('turn');
  const turnShadow = document.getElementById('turnShadow');
  const sheetFront = document.getElementById('sheetFront');
  const sheetBack  = document.getElementById('sheetBack');
  const imgFront   = document.getElementById('turnFrontImg');
  const imgBack    = document.getElementById('turnBackImg');

  const wall       = document.getElementById('textWall');
  const closeText  = document.getElementById('close-text');
  const openText   = document.getElementById('open-text');

  const slideshowEl = document.getElementById('slideshow');
  const volumeControl = document.getElementById('volume-control');
  const volIcon   = document.getElementById('volume-icon');
  const volIconImg = document.getElementById('volume-icon-img');
  const music     = document.getElementById('bg-music');
  const hasMessage = (typeof HAS_MESSAGE === 'boolean') ? HAS_MESSAGE : document.body.dataset.hasMessage === 'true';
  const hasMessageOverlay = hasMessage && !!wall && !!openText && !!closeText;
  const hasMusic = document.body.dataset.hasUserMusic === 'true' && !!(music && music.getAttribute('src'));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const curtainIntroRevealMs = prefersReducedMotion ? 80 : 520;
  const curtainFallbackOpenMs = prefersReducedMotion ? 140 : 2600;
  const curtainCleanupPadMs = prefersReducedMotion ? 20 : 0;
  const glissSafetyPadMs = prefersReducedMotion ? 120 : 450;
  const flipDurationMs = prefersReducedMotion ? 0 : 620;
  const musicFadeMs = prefersReducedMotion ? 120 : 900;
  const messageOverlayLockMs = hasMessageOverlay ? (prefersReducedMotion ? 80 : 1000) : 0;

  const TOTAL = slides.length;
  let started = false;
  let introControlsLocked = false;
  let idx = 0;
  let flipping = false;
  let wallClosedByUser = false;
  let messageOverlayLocked = false;
  let messageOverlayLockTimer = null;
  let slider = null;
  let stageReady = false;
  let introStarted = false;
  let deferredWarmStarted = false;

  const flipPool = Array.from({length: 10}, (_, i) => `gallery/sounds/flip${i+1}.mp3`);
  const glissSrc = 'gallery/sounds/glissando.mp3';
  const deferredAssets = [
    { as: 'image', href: 'gallery/pages/letter.png' },
    { as: 'image', href: 'gallery/pages/wall.png' },
    { as: 'image', href: 'gallery/pages/back.png' },
    { as: 'image', href: 'gallery/controls/ppage.png' },
    { as: 'image', href: 'gallery/controls/npage.png' },
    { as: 'image', href: 'gallery/controls/volon.png' },
    { as: 'image', href: 'gallery/controls/voloff.png' },
    ...(hasMessage ? [{ as: 'image', href: 'gallery/controls/showmessageicon.png' }] : []),
    ...(hasMusic ? [{ as: 'audio', href: 'gallery/sounds/music.mp3', type: 'audio/mpeg' }] : []),
    ...flipPool.map((href) => ({ as: 'audio', href, type: 'audio/mpeg' })),
  ];

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function setHiddenState(el, hidden){ if (el) el.setAttribute('aria-hidden', hidden ? 'true' : 'false'); }
  function setExpandedState(el, expanded){ if (el) el.setAttribute('aria-expanded', expanded ? 'true' : 'false'); }

  function bindPress(el, handler){
    if (!el) return;
    el.addEventListener('click', handler);
    if (el instanceof HTMLButtonElement) return;
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      handler(e);
    });
  }

  function installHypernotes(){
    const content = document.getElementById('textWallContent');
    if (!content) return;
    const links = Array.from(content.querySelectorAll('a[href^="hypernote:"]'));
    if (!links.length) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'hypernote-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);

    let activeLink = null;
    const prefix = 'hypernote:';

    function noteFor(link){
      const href = link.getAttribute('href') || '';
      const raw = href.startsWith(prefix) ? href.slice(prefix.length) : '';
      try { return decodeURIComponent(raw); }
      catch (_err) { return raw; }
    }

    function place(link){
      const gap = 10;
      const rect = link.getBoundingClientRect();
      const width = tooltip.offsetWidth;
      const height = tooltip.offsetHeight;
      const left = clamp(rect.left + (rect.width / 2) - (width / 2), 16, window.innerWidth - width - 16);
      let top = rect.bottom + gap;
      if (top + height > window.innerHeight - 16){
        top = Math.max(16, rect.top - height - gap);
      }
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    function show(link){
      const note = link.dataset.hypernote || noteFor(link);
      if (!note) return;
      activeLink = link;
      tooltip.textContent = note;
      tooltip.style.visibility = 'hidden';
      tooltip.classList.add('is-visible');
      place(link);
      tooltip.style.visibility = '';
    }

    function hide(link){
      if (link && activeLink !== link) return;
      activeLink = null;
      tooltip.classList.remove('is-visible');
    }

    links.forEach((link) => {
      const note = noteFor(link);
      link.dataset.hypernote = note;
      link.setAttribute('role', 'button');
      link.setAttribute('tabindex', '0');
      link.setAttribute('aria-describedby', 'hypernote-tooltip');
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeLink === link){ hide(link); return; }
        show(link);
      });
      link.addEventListener('mouseenter', () => show(link));
      link.addEventListener('mouseleave', () => hide(link));
      link.addEventListener('focus', () => show(link));
      link.addEventListener('blur', () => hide(link));
      link.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (activeLink === link){ hide(link); return; }
        show(link);
      });
    });

    tooltip.id = 'hypernote-tooltip';
    window.addEventListener('scroll', () => activeLink && place(activeLink), true);
    window.addEventListener('resize', () => activeLink && place(activeLink));
    document.addEventListener('pointerdown', (e) => {
      if (!activeLink) return;
      if (e.target === activeLink || activeLink.contains(e.target)) return;
      hide(activeLink);
    });
  }

  function warmDeferredAssets(){
    if (deferredWarmStarted) return;
    deferredWarmStarted = true;
    const warm = () => {
      deferredAssets.forEach((asset) => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = asset.as;
        link.href = asset.href;
        if (asset.type) link.type = asset.type;
        document.head.appendChild(link);
      });
    };
    if (typeof window.requestIdleCallback === 'function'){
      window.requestIdleCallback(warm, { timeout: prefersReducedMotion ? 120 : 900 });
      return;
    }
    setTimeout(warm, prefersReducedMotion ? 60 : 180);
  }

  function activeSlide(){ return slides[idx]; }
  function slideImageEl(slide){ return slide ? slide.querySelector('img') : null; }
  function slideImageSrc(slide){
    const img = slideImageEl(slide);
    return img ? img.getAttribute('src') : '';
  }
  function markSlideAssetFailed(slide, img){
    if (!slide || slide.classList.contains('asset-failed')) return;
    slide.classList.add('asset-failed');
    slide.dataset.fallbackLabel = img?.getAttribute('alt') || 'Page image unavailable';
  }

  function installImageFallbacks(){
    slides.forEach((slide) => {
      const img = slideImageEl(slide);
      if (!img) return;
      const handleError = () => markSlideAssetFailed(slide, img);
      img.addEventListener('error', handleError, { once: true });
      if (img.complete && img.naturalWidth === 0) handleError();
    });
    [cLeft, cRight].forEach((img) => {
      if (!img) return;
      const handleError = () => {
        img.style.display = 'none';
        overlay.classList.add('curtain-fallback');
      };
      img.addEventListener('error', handleError, { once: true });
      if (img.complete && img.naturalWidth === 0) handleError();
    });
  }

  function waitForImageReady(img){
    if (!img) return Promise.resolve(false);
    if (img.complete){
      if (img.naturalWidth === 0) return Promise.resolve(false);
      if (typeof img.decode === 'function') return img.decode().then(() => true).catch(() => true);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      img.addEventListener('load', () => resolve(true), { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
    });
  }

  function waitForCriticalAssets(){
    const criticalImages = [cLeft, cRight, slideImageEl(slides[0])].filter(Boolean);
    const assetWait = Promise.allSettled(criticalImages.map(waitForImageReady));
    const timeoutWait = new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 120 : 1600));
    return Promise.race([assetWait, timeoutWait]);
  }

  function revealStage(){
    if (stageReady) return;
    stageReady = true;
    setHiddenState(slideshowEl, false);
    setHiddenState(volumeControl, false);
    document.body.classList.add('stage-ready');
    setActiveIndex(0, { playSound: false });
    setTurnVisible(false);
  }

  function startCurtainIntro(){
    if (introStarted) return;
    introStarted = true;
    warmDeferredAssets();
    function onIntroEnd(e){
      if (e.animationName !== 'curtainIntroFadeIn') return;
      overlay.removeEventListener('animationend', onIntroEnd);
      revealStage();
    }
    overlay.addEventListener('animationend', onIntroEnd);
    setTimeout(revealStage, curtainIntroRevealMs);
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
  }

  function updateProgress(){ progress.textContent = `Page ${idx + 1} of ${TOTAL}`; }
  function isWallPage(){ return idx === 2; }
  function setDisabled(btn, disabled){
    btn.disabled = !!disabled;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }
  function syncButtons(){
    const locked = !started || introControlsLocked || flipping || messageOverlayLocked;
    setDisabled(prevBtn, locked || idx === 0);
    setDisabled(nextBtn, locked || idx === TOTAL - 1);
  }

  function clearMessageOverlayLock(){
    if (messageOverlayLockTimer !== null){
      clearTimeout(messageOverlayLockTimer);
      messageOverlayLockTimer = null;
    }
    messageOverlayLocked = false;
    syncButtons();
  }
  function setWallOpen(open){
    if (!hasMessageOverlay) return;
    wall.classList.toggle('is-open', open);
    setHiddenState(wall, !open);
    openText.classList.toggle('is-visible', !open);
    setHiddenState(openText, open);
    closeText.classList.toggle('is-visible', open);
    setHiddenState(closeText, !open);
    setExpandedState(openText, open);
  }
  function hideWallBeforeOverlayOpen(){
    if (!hasMessageOverlay) return;
    wall.classList.remove('is-open');
    openText.classList.remove('is-visible');
    closeText.classList.remove('is-visible');
    setHiddenState(wall, true);
    setHiddenState(openText, true);
    setHiddenState(closeText, true);
    setExpandedState(openText, false);
  }
  function beginMessageOverlayLock(){
    if (!hasMessageOverlay) return;
    if (messageOverlayLockTimer !== null) clearTimeout(messageOverlayLockTimer);
    messageOverlayLocked = true;
    syncButtons();
    hideWallBeforeOverlayOpen();
    messageOverlayLockTimer = setTimeout(() => {
      messageOverlayLockTimer = null;
      messageOverlayLocked = false;
      if (!isWallPage() || wallClosedByUser){ syncButtons(); return; }
      setWallOpen(true);
      syncButtons();
    }, messageOverlayLockMs);
  }
  function syncWallUI(){
    if (!hasMessageOverlay){
      clearMessageOverlayLock();
      if (wall) wall.classList.remove('is-open');
      if (openText) openText.classList.remove('is-visible');
      if (closeText) closeText.classList.remove('is-visible');
      setHiddenState(wall, true);
      setHiddenState(openText, true);
      setHiddenState(closeText, true);
      setExpandedState(openText, false);
      syncButtons();
      return;
    }

    if (!isWallPage()){
      clearMessageOverlayLock();
      wall.classList.remove('is-open');
      openText.classList.remove('is-visible');
      closeText.classList.remove('is-visible');
      setHiddenState(wall, true);
      setHiddenState(openText, true);
      setHiddenState(closeText, true);
      setExpandedState(openText, false);
      syncButtons();
      return;
    }
    if (wallClosedByUser){
      clearMessageOverlayLock();
      setWallOpen(false);
      syncButtons();
      return;
    }
    beginMessageOverlayLock();
  }

  function playOneShot(src, volume01){
    try{
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = clamp(volume01, 0, 1);
      a.play().catch(()=>{});
    }catch(_){ }
  }
  function playFlip(){
    const pick = flipPool[Math.floor(Math.random() * flipPool.length)];
    const vol = music ? clamp(music.volume, 0, 1) : 0.5;
    playOneShot(pick, vol);
  }

  function rectForActiveImage(){
    const img = slideImageEl(activeSlide());
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return null;
    return r;
  }
  function placeTurnToRect(r){
    turn.style.left = `${r.left}px`;
    turn.style.top = `${r.top}px`;
    turn.style.width = `${r.width}px`;
    turn.style.height = `${r.height}px`;
    turnShadow.style.left = `${r.left}px`;
    turnShadow.style.top = `${r.top}px`;
    turnShadow.style.width = `${r.width}px`;
    turnShadow.style.height = `${r.height}px`;
  }
  function easeInOutCubic(t){
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
  }
  function setTurnVisible(on){
    if (!turn || !turnShadow) return;
    turn.style.opacity = on ? '1' : '0';
    turnShadow.style.opacity = on ? '1' : '0';
  }
  function setTurnRotationDeg(deg){
    turn.style.transformOrigin = '0% 50%';
    turn.style.transform = `rotateY(${deg}deg)`;

    const a = Math.abs(deg);
    const t = clamp(a / 180, 0, 1);
    const edge = Math.pow(Math.sin(t * Math.PI), 1.2);
    const glint = Math.pow(Math.sin(t * Math.PI), 2.0);

    sheetFront.style.setProperty('--edgeA', String(0.28 * edge));
    sheetFront.style.setProperty('--glintA', String(0.22 * glint));

    const dir = (deg < 0) ? 1 : -1;
    turnShadow.style.setProperty('--sx', `${dir > 0 ? 26 : 16}%`);
    turnShadow.style.setProperty('--sd', `${0.14 + 0.22 * edge}`);
    turnShadow.style.setProperty('--sb', `${10 + 10 * edge}px`);
  }
  function cleanupTransient(curSlide, tgtSlide){
    if (curSlide) curSlide.classList.remove('ghost');
    if (tgtSlide) tgtSlide.classList.remove('peek');
  }
  function resetTurnLayer(){
    setTurnVisible(false);
    if (turn){
      turn.style.width = '0px';
      turn.style.height = '0px';
    }
    if (turnShadow){
      turnShadow.style.width = '0px';
      turnShadow.style.height = '0px';
    }
  }

  function setActiveIndex(newIdx, opts = {}){
    const target = clamp(newIdx, 0, TOTAL - 1);
    if (target === idx && opts.force !== true){
      updateProgress();
      syncButtons();
      syncWallUI();
      return;
    }
    clearMessageOverlayLock();
    idx = target;
    slides.forEach((s, i) => {
      s.classList.toggle('active', i === idx);
      s.classList.remove('peek');
      s.classList.remove('ghost');
    });
    if (idx === 2) wallClosedByUser = false;
    if (opts.playSound !== false) playFlip();
    updateProgress();
    syncButtons();
    syncWallUI();
  }
  function flipTo(targetIdx){
    if (!started || introControlsLocked || flipping || messageOverlayLocked) return;

    const tIdx = clamp(targetIdx, 0, TOTAL - 1);
    if (tIdx === idx) return;

    const r = rectForActiveImage();
    if (!r || !turn || !turnShadow || !sheetFront || !sheetBack || !imgFront || !imgBack){
      setActiveIndex(tIdx);
      return;
    }

    flipping = true;
    clearMessageOverlayLock();
    syncButtons();

    const goingNext = tIdx > idx;
    const curSlide = slides[idx];
    const tgtSlide = slides[tIdx];
    const curSrc = slideImageSrc(curSlide);
    const tgtSrc = slideImageSrc(tgtSlide);

    placeTurnToRect(r);
    sheetBack.classList.add('hidden');
    sheetBack.classList.remove('visible');
    imgBack.src = '';
    sheetFront.classList.remove('hidden');
    sheetFront.classList.add('visible');

    if (goingNext){
      tgtSlide.classList.add('peek');
      curSlide.classList.add('ghost');
      imgFront.src = curSrc;
      setTurnVisible(true);
      setTurnRotationDeg(0);
    } else {
      imgFront.src = tgtSrc;
      setTurnVisible(true);
      setTurnRotationDeg(-180);
    }

    playFlip();

    if (flipDurationMs <= 0){
      cleanupTransient(curSlide, tgtSlide);
      setActiveIndex(tIdx, { playSound: false });
      resetTurnLayer();
      flipping = false;
      syncButtons();
      return;
    }

    const t0 = performance.now();
    function step(now){
      const raw = clamp((now - t0) / flipDurationMs, 0, 1);
      const e = easeInOutCubic(raw);
      const deg = goingNext ? -180 * e : -180 + (180 * e);
      setTurnRotationDeg(deg);

      if (raw < 1){
        requestAnimationFrame(step);
        return;
      }

      cleanupTransient(curSlide, tgtSlide);
      setActiveIndex(tIdx, { playSound: false });
      resetTurnLayer();
      flipping = false;
      syncButtons();
    }

    requestAnimationFrame(step);
  }
  function go(delta){
    if (!started || introControlsLocked || messageOverlayLocked) return;
    flipTo(idx + delta);
  }

  window.addEventListener('resize', () => {
    if (!flipping) return;
    const r = rectForActiveImage();
    if (r) placeTurnToRect(r);
  });

  function ensureSlider(){
    if (slider) return slider;
    slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'volume-slider';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(loadVolume0to100()));
    slider.title = 'Volume';
    slider.setAttribute('aria-label', 'Volume level');
    setHiddenState(slider, true);
    volumeControl.appendChild(slider);
    slider.addEventListener('input', () => setVolume0to100(clamp(parseInt(slider.value || '0', 10), 0, 100)));
    return slider;
  }
  function loadVolume0to100(){
    const v0 = (typeof INITIAL_VOLUME === 'number') ? INITIAL_VOLUME : 50;
    return clamp(Math.round(v0), 0, 100);
  }
  function setVolume0to100(v){
    const vv = clamp(Math.round(v), 0, 100);
    const vol01 = vv / 100;
    const muted = vv === 0;

    if (music && hasMusic){
      music.volume = vol01;
      music.muted = muted;
    }

    volIconImg.src = muted ? 'gallery/controls/voloff.png' : 'gallery/controls/volon.png';
    volIcon.setAttribute('aria-label', muted ? 'Volume muted. Toggle volume slider' : 'Toggle volume slider');

    if (slider){
      slider.value = String(vv);
    }
  }
  function setSliderOpen(open){
    const shouldOpen = !!open;
    volumeControl.classList.toggle('slider-open', shouldOpen);
    setExpandedState(volIcon, shouldOpen);
    if (slider) setHiddenState(slider, !shouldOpen);
  }

  function glissDurationMs(audioEl){
    const d = audioEl && Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    if (d > 0.25) return Math.round(d * 1000);
    return curtainFallbackOpenMs;
  }
  function runCurtainMotion(durationMs, onDone){
    const openMs = prefersReducedMotion ? 140 : Math.max(500, Math.round(durationMs || curtainFallbackOpenMs));
    overlay.style.opacity = '1';
    overlay.style.animation = 'none';
    overlay.style.background = 'transparent';
    cLeft.style.opacity = '1';
    cRight.style.opacity = '1';
    cLeft.style.transform = 'translateX(0)';
    cRight.style.transform = 'translateX(0)';
    cLeft.style.animation = 'none';
    cRight.style.animation = 'none';
    void cLeft.offsetWidth;
    cLeft.style.animation = `curtainLeftOut ${openMs}ms cubic-bezier(.2,.9,.1,1) forwards`;
    cRight.style.animation = `curtainRightOut ${openMs}ms cubic-bezier(.2,.9,.1,1) forwards`;
    setTimeout(() => {
      overlay.style.pointerEvents = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.remove();
      if (typeof onDone === 'function') onDone();
    }, openMs + curtainCleanupPadMs);
    return openMs;
  }
  function openCurtain(){
    if (started) return;
    started = true;
    introControlsLocked = true;
    syncButtons();
    revealStage();
    beginBtn.disabled = true;
    beginBtn.style.opacity = '0';
    beginBtn.style.pointerEvents = 'none';

    let musicStarted = false;
    let glissDone = false;
    let curtainDone = false;
    let introMotionStarted = false;
    let safetyTimer = null;

    function tryUnlockIntroControls(){
      if (!glissDone || !curtainDone) return;
      introControlsLocked = false;
      syncButtons();
    }
    function startMusicAfterGliss(){
      if (musicStarted) return;
      musicStarted = true;
      glissDone = true;
      if (safetyTimer !== null){ clearTimeout(safetyTimer); safetyTimer = null; }

      const v = loadVolume0to100();
      setVolume0to100(v);

      if (music && hasMusic){
        try{
          music.currentTime = 0;
          music.volume = 0;
          music.muted = (v === 0);
          music.play().catch(()=>{});
        }catch(_){ }

        const target = clamp(v / 100, 0, 1);
        const start = performance.now();
        function fadeStep(now){
          const t = clamp((now - start) / musicFadeMs, 0, 1);
          const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2;
          music.volume = target * e;
          if (t < 1) requestAnimationFrame(fadeStep);
        }
        requestAnimationFrame(fadeStep);
      }

      tryUnlockIntroControls();
    }
    function beginGlissAndCurtain(g){
      if (introMotionStarted) return;
      introMotionStarted = true;
      const openMs = runCurtainMotion(glissDurationMs(g), () => {
        curtainDone = true;
        tryUnlockIntroControls();
      });
      try{
        g.currentTime = 0;
        g.play().catch(() => startMusicAfterGliss());
      }catch(_){ startMusicAfterGliss(); }
      safetyTimer = setTimeout(startMusicAfterGliss, openMs + glissSafetyPadMs);
    }
    try{
      const g = new Audio(glissSrc);
      g.preload = 'auto';
      g.volume = 0.10;
      g.addEventListener('ended', startMusicAfterGliss, { once: true });
      g.addEventListener('error', () => { beginGlissAndCurtain(g); startMusicAfterGliss(); }, { once: true });
      g.addEventListener('loadedmetadata', () => beginGlissAndCurtain(g), { once: true });
      g.load();
      setTimeout(() => beginGlissAndCurtain(g), 250);
    }catch(_){
      const openMs = runCurtainMotion(curtainFallbackOpenMs, () => { curtainDone = true; tryUnlockIntroControls(); });
      setTimeout(startMusicAfterGliss, openMs);
    }
  }

  bindPress(beginBtn, (e) => { e.preventDefault(); openCurtain(); });
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  window.addEventListener('keydown', (e) => {
    if (!started || introControlsLocked) return;
    if (e.key === 'ArrowLeft'){
      e.preventDefault();
      go(-1);
    } else if (e.key === 'ArrowRight'){
      e.preventDefault();
      go(1);
    } else if (e.key === 'Escape'){
      if (hasMessage && isWallPage() && wall && wall.classList.contains('is-open')){
        setWallOpen(false);
        wallClosedByUser = true;
        if (openText) openText.focus({preventScroll:true});
      }
    }
  });
  if (closeText){
    closeText.addEventListener('click', () => {
      if (!isWallPage()) return;
      clearMessageOverlayLock();
      setWallOpen(false);
      wallClosedByUser = true;
      syncButtons();
      if (openText) openText.focus({preventScroll:true});
    });
  }
  if (openText){
    bindPress(openText, () => {
      if (!isWallPage()) return;
      clearMessageOverlayLock();
      setWallOpen(true);
      wallClosedByUser = false;
      syncButtons();
      if (closeText) closeText.focus({preventScroll:true});
    });
  }
  bindPress(volIcon, () => {
    const s = ensureSlider();
    const shouldOpen = !volumeControl.classList.contains('slider-open');
    setSliderOpen(shouldOpen);
    if (shouldOpen) s.focus({preventScroll:true});
  });

  ensureSlider();
  setSliderOpen(false);
  if (!hasMusic && volumeControl){
    volumeControl.style.display = 'none';
    setHiddenState(volumeControl, true);
  }
  setVolume0to100(loadVolume0to100());
  setHiddenState(wall, true);
  setHiddenState(openText, true);
  setHiddenState(closeText, true);
  setExpandedState(openText, false);
  try{
    installHypernotes();
  }catch(err){
    console.error('Hypernote setup failed', err);
  }
  installImageFallbacks();
  waitForCriticalAssets().finally(startCurtainIntro);
});
