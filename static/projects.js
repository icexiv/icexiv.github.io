(() => {
  const track = document.getElementById('project-track');
  const cards = [...document.querySelectorAll('[data-project]')];
  const selectors = [...document.querySelectorAll('[data-select]')];
  const panels = [...document.querySelectorAll('[data-project-panel]')];
  const previous = document.querySelector('[data-carousel-prev]');
  const next = document.querySelector('[data-carousel-next]');
  const position = document.getElementById('carousel-position');
  const pagination = document.querySelector('.project-pagination');
  const jumpButtons = [...document.querySelectorAll('[data-jump]')];
  const scrollbar = document.querySelector('.project-scrollbar');
  const downloadOptions = [...document.querySelectorAll('.download-options')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointerMotion = window.matchMedia('(hover: hover) and (pointer: fine)');
  function initializeCarousel() {
  let selected = 0;
  let programmaticSelection = null;
  let scrubbing = false;

  if (!track || cards.length === 0 || selectors.length !== panels.length) return;

  let indicatorFrame = null;
  function railBounds() {
    const first = cards[0].offsetLeft + cards[0].offsetWidth / 2 - track.clientWidth / 2;
    const lastCard = cards[cards.length - 1];
    const last = lastCard.offsetLeft + lastCard.offsetWidth / 2 - track.clientWidth / 2;
    return { first, last };
  }

  function updateIndicator() {
    indicatorFrame = null;
    if (!pagination) return;
    const { first, last } = railBounds();
    const progress = last > first ? Math.max(0, Math.min(1, (track.scrollLeft - first) / (last - first))) : 0;
    const index = progress * (cards.length - 1);
    pagination.style.setProperty('--indicator-index', String(index));
    pagination.style.setProperty('--thumb-width', `${pagination.clientWidth / cards.length}px`);
    if (scrollbar) {
      if (!scrubbing) scrollbar.value = String(index);
      scrollbar.setAttribute('aria-valuetext', selectors[Math.round(index)].textContent.trim());
    }
  }

  function queueIndicator() {
    if (indicatorFrame === null) indicatorFrame = requestAnimationFrame(updateIndicator);
  }

  if (pagination) pagination.style.setProperty('--project-count', String(cards.length));
  track.addEventListener('scroll', queueIndicator, { passive: true });

  const resetTilt = () => {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('is-tilting');
      screen.style.removeProperty('--tilt-x');
      screen.style.removeProperty('--tilt-y');
    });
  };

  function centerSelected(animate) {
    const card = cards[selected];
    track.style.setProperty('--edge-space', `${Math.max(6, (track.clientWidth - card.offsetWidth) / 2)}px`);
    // 以布局位置居中，不让相邻卡片的透视/缩放影响滚动目标。
    const left = card.offsetLeft + card.offsetWidth / 2 - track.clientWidth / 2;
    if (Math.abs(left - track.scrollLeft) < 1) { programmaticSelection = null; queueIndicator(); return; }
    programmaticSelection = selected;
    track.scrollTo({ left, behavior: animate && !reducedMotion.matches ? 'smooth' : 'instant' });
    queueIndicator();
  }

  function updateSelection(index) {
    downloadOptions.forEach(details => { details.open = false; });
    selected = (index + cards.length) % cards.length;
    const key = cards[selected].dataset.project;

    cards.forEach((card, index) => {
      const delta = index - selected;
      const distance = Math.min(Math.abs(delta), 3);
      card.classList.toggle('is-selected', delta === 0);
      card.dataset.position = delta < 0 ? 'before' : delta > 0 ? 'after' : 'selected';
      card.style.setProperty('--card-angle', `${delta < 0 ? 24 : delta > 0 ? -24 : 0}deg`);
      card.style.setProperty('--card-depth', `${distance * 36}px`);
      card.style.setProperty('--card-scale', String(1 - distance * .04));
      card.style.zIndex = String(cards.length - Math.min(Math.abs(delta), cards.length - 1));
    });
    selectors.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.select === key)));
    jumpButtons.forEach(button => {
      if (button.dataset.jump === key) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    panels.forEach(panel => { panel.hidden = panel.dataset.projectPanel !== key; });
    position.textContent = `${selected + 1} / ${cards.length}`;
    resetTilt();
  }

  function choose(index, { scroll = true, focus = false, animate = true } = {}) {
    if (scrubbing) stopScrubbing();
    updateSelection(index);
    if (scroll) {
      centerSelected(animate);
    }
    if (focus) selectors[selected].focus({ preventScroll: true });
  }

  selectors.forEach((button, index) => {
    button.disabled = false;
    button.addEventListener('click', () => choose(index));
    button.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowLeft') target = index - 1;
      if (event.key === 'ArrowRight') target = index + 1;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = cards.length - 1;
      if (target !== undefined) {
        event.preventDefault();
        choose(target, { focus: true });
      }
    });
  });

  previous.disabled = false;
  next.disabled = false;
  previous.addEventListener('click', () => choose(selected - 1));
  next.addEventListener('click', () => choose(selected + 1));

  jumpButtons.forEach((button, index) => {
    button.disabled = false;
    button.addEventListener('click', () => choose(index));
    button.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowLeft') target = index - 1;
      if (event.key === 'ArrowRight') target = index + 1;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = cards.length - 1;
      if (target !== undefined) {
        event.preventDefault();
        choose(target);
        jumpButtons[selected].focus({ preventScroll: true });
      }
    });
  });

  function stopScrubbing() {
    scrubbing = false;
    track.classList.remove('is-scrubbing');
  }

  function beginScrubbing() {
    scrubbing = true;
    programmaticSelection = null;
    track.classList.add('is-scrubbing');
    track.scrollTo({ left: track.scrollLeft, behavior: 'instant' });
  }

  function scrub() {
    if (!scrubbing) beginScrubbing();
    const target = Math.round(Number(scrollbar.value));
    if (target !== selected) updateSelection(target);
    const { first, last } = railBounds();
    const progress = Number(scrollbar.value) / Math.max(1, cards.length - 1);
    track.scrollTo({ left: first + progress * (last - first), behavior: 'instant' });
    queueIndicator();
  }

  function finishScrubbing() {
    if (!scrubbing) return;
    const target = Math.round(Number(scrollbar.value));
    stopScrubbing();
    choose(target);
  }

  if (scrollbar) {
    scrollbar.max = String(cards.length - 1);
    scrollbar.disabled = cards.length < 2;
    scrollbar.addEventListener('pointerdown', beginScrubbing);
    scrollbar.addEventListener('input', scrub);
    scrollbar.addEventListener('change', finishScrubbing);
    scrollbar.addEventListener('pointercancel', finishScrubbing);
    scrollbar.addEventListener('blur', finishScrubbing);
    window.addEventListener('pointerup', finishScrubbing);
    window.addEventListener('blur', finishScrubbing);
    scrollbar.addEventListener('keydown', event => {
      let target;
      const current = scrubbing ? Math.round(Number(scrollbar.value)) : selected;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'PageUp') target = current - 1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'PageDown') target = current + 1;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = cards.length - 1;
      if (target !== undefined) {
        event.preventDefault();
        choose(Math.max(0, Math.min(cards.length - 1, target)));
      }
    });
  }

  // 原生滑动吸附结束后，同步选中居中的项目，不在滑动途中反复切换详情。
  function selectCenteredCard() {
    if (scrubbing) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    // 被焦点或尺寸变化中断的平滑滚动，不应覆盖用户刚选中的项目。
    if (programmaticSelection !== null) {
      const target = cards[selected];
      if (Math.abs(target.offsetLeft + target.offsetWidth / 2 - center) >= 1) centerSelected(false);
      else programmaticSelection = null;
      return;
    }
    let closest = selected;
    let distance = Infinity;
    cards.forEach((card, index) => {
      const delta = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
      if (delta < distance) { closest = index; distance = delta; }
    });
    if (closest !== selected) choose(closest, { animate: false });
  }

  for (const event of ['pointerdown', 'touchstart', 'wheel']) {
    track.addEventListener(event, () => { programmaticSelection = null; }, { passive: true });
  }

  if ('onscrollend' in track) {
    track.addEventListener('scrollend', selectCenteredCard);
  } else {
    let scrollEndTimer;
    track.addEventListener('scroll', () => {
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(selectCenteredCard, 150);
    }, { passive: true });
  }

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (scrubbing) {
        track.style.setProperty('--edge-space', `${Math.max(6, (track.clientWidth - cards[selected].offsetWidth) / 2)}px`);
        scrub();
      } else centerSelected(false);
    }).observe(track, { box: 'border-box' });
  } else {
    window.addEventListener('resize', () => centerSelected(false));
  }

    choose(0, { animate: false });
  }

  initializeCarousel();

  document.querySelectorAll('.visual-stage').forEach(stage => {
    const screen = stage.querySelector('.screen');
    if (!screen) return;
    let frame = null;
    let point = null;

    function reset() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      point = null;
      screen.classList.remove('is-tilting');
      screen.style.removeProperty('--tilt-x');
      screen.style.removeProperty('--tilt-y');
    }

    stage.addEventListener('pointermove', event => {
      if (reducedMotion.matches || !pointerMotion.matches) return;
      point = { x: event.clientX, y: event.clientY };
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!point || reducedMotion.matches || !pointerMotion.matches || stage.closest('[hidden]')) return;
        const bounds = stage.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) return;
        const x = Math.max(-.5, Math.min(.5, (point.x - bounds.left) / bounds.width - .5));
        const y = Math.max(-.5, Math.min(.5, (point.y - bounds.top) / bounds.height - .5));
        screen.style.setProperty('--tilt-x', `${-y * 5}deg`);
        screen.style.setProperty('--tilt-y', `${x * 6}deg`);
        screen.classList.add('is-tilting');
      });
    });
    stage.addEventListener('pointerleave', reset);
    reducedMotion.addEventListener('change', reset);
    pointerMotion.addEventListener('change', reset);
  });

  document.addEventListener('pointerdown', event => {
    downloadOptions.forEach(details => {
      if (details.open && !details.parentElement.contains(event.target)) details.open = false;
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = downloadOptions.find(details => details.open);
    if (open) {
      open.open = false;
      open.querySelector('summary').focus({ preventScroll: true });
      event.preventDefault();
    }
  });

})();
