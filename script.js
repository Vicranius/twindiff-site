'use strict';

const hero = document.querySelector('.hero-stage');
const heroWindow = document.querySelector('.hero-window');
const pin = document.querySelector('.pinned');
const steps = [...document.querySelectorAll('.steps article')];
const screens = [...document.querySelectorAll('.screens .capture')];
const viewLinks = [...document.querySelectorAll('.views a')];
const pipeline = document.querySelector('.pipeline');
const pipelineSteps = [...pipeline.children];
const stats = document.querySelector('.stats');
const counters = [...stats.querySelectorAll('[data-count]')];
const languageButtons = document.querySelectorAll('[data-lang]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = n => Math.min(1, Math.max(0, n));
const translations = [];

let pixelRatio = 0;
let densityQuery;

// Zoom and monitor changes can alter density without changing the page width.
function updatePixelRatio() {
  const ratio = window.devicePixelRatio || 1;
  if (ratio === pixelRatio) return;
  pixelRatio = ratio;
  document.documentElement.style.setProperty('--dpr', ratio);
  densityQuery?.removeEventListener('change', updatePixelRatio);
  densityQuery = matchMedia(`(resolution: ${ratio}dppx)`);
  densityQuery.addEventListener('change', updatePixelRatio);
  needsMeasure = true;
}

// Some display/emulation changes update devicePixelRatio without a media or resize event.
let densityTimer;
function watchDisplay() {
  clearInterval(densityTimer);
  if (document.hidden) return;
  updatePixelRatio();
  densityTimer = setInterval(updatePixelRatio, 500);
}

// Keep both languages with their content in the HTML.
for (const [selector, dataKey, attribute] of [
  ['[data-en]', 'en', null],
  ['[data-alt-en]', 'altEn', 'alt'],
  ['[data-label-en]', 'labelEn', 'aria-label'],
  ['[data-content-en]', 'contentEn', 'content']
]) {
  for (const element of document.querySelectorAll(selector)) {
    const item = { element, attribute, en: element.dataset[dataKey],
      tr: attribute ? element.getAttribute(attribute) : element.textContent };
    if (!attribute && document.body.contains(element)) {
      const stack = document.createElement('span');
      stack.className = 'copy-stack';
      item.visible = document.createElement('span');
      item.visible.textContent = item.tr;
      stack.dataset.reserve = item.en;
      stack.append(item.visible);
      element.replaceChildren(stack);
    }
    translations.push(item);
  }
}

let dimensions;
let activeView = -1;
let frame = 0;
let needsMeasure = true;
let heroProgress = -1;
let lineProgress = -1;
let countFrame = 0;
let countsSeen = false;
let numberFormat = new Intl.NumberFormat('tr-TR');

function measure() {
  const y = window.scrollY;
  const topOf = element => element.getBoundingClientRect().top + y;
  dimensions = {
    height: window.innerHeight,
    heroEnd: topOf(hero) + Math.min(hero.offsetHeight * .32, window.innerHeight * .4),
    readingOffset: getComputedStyle(pin.parentElement).display === 'block'
      ? (window.innerHeight + Math.min(window.innerHeight, pin.offsetHeight)) / 2
      : window.innerHeight / 2,
    centers: steps.map(step => topOf(step) + step.offsetHeight / 2),
    pipeTop: topOf(pipeline),
    pipeHeight: pipeline.offsetHeight
  };
  needsMeasure = false;
}

function showView(index) {
  if (index === activeView) return;
  activeView = index;
  steps.forEach((step, i) => {
    const selected = i === index;
    step.classList.toggle('active', selected);
    screens[i].classList.toggle('current', selected);
    screens[i].setAttribute('aria-hidden', String(!selected));
    if (selected) viewLinks[i].setAttribute('aria-current', 'step');
    else viewLinks[i].removeAttribute('aria-current');
  });
}

function renderScroll() {
  frame = 0;
  updatePixelRatio();
  if (needsMeasure) measure();
  const y = window.scrollY;
  const {height, heroEnd, centers, readingOffset, pipeTop, pipeHeight} = dimensions;
  const readingPoint = y + readingOffset;
  let nearest = 0;
  centers.forEach((center, i) => {
    if (Math.abs(center - readingPoint) < Math.abs(centers[nearest] - readingPoint)) nearest = i;
  });
  showView(nearest);

  const progress = clamp(y / Math.max(1, heroEnd));
  if (!reducedMotion.matches && progress !== heroProgress) {
    const tilt = 1 - progress;
    heroWindow.style.transform = `rotateX(${24 * tilt}deg) rotateY(${-4 * tilt}deg) rotateZ(${-tilt}deg) scale(${1 - .08 * tilt})`;
    heroProgress = progress;
  }
  const draw = reducedMotion.matches ? 1 : clamp((y + height * .84 - pipeTop) / (pipeHeight + height * .18));
  if (draw !== lineProgress) {
    const position = draw * (pipelineSteps.length - 1);
    pipelineSteps.forEach((step, i) => {
      step.classList.toggle('is-lit', draw > 0 && position >= i);
      if (i < pipelineSteps.length - 1) step.style.setProperty('--draw', clamp(position - i));
    });
    lineProgress = draw;
  }
}

function scheduleScroll() {
  if (!frame) frame = requestAnimationFrame(renderScroll);
}

function invalidate() {
  needsMeasure = true;
  scheduleScroll();
}

function displayCounts(progress) {
  counters.forEach(counter => {
    const value = Number(counter.dataset.count);
    counter.firstElementChild.textContent = numberFormat.format(Math.round(value * progress));
  });
}

function finishCounts() {
  cancelAnimationFrame(countFrame);
  countFrame = 0;
  displayCounts(1);
}

function countUp() {
  if (countsSeen) return;
  countsSeen = true;
  if (reducedMotion.matches) return;
  const start = performance.now();
  function tick(time) {
    const t = clamp((time - start) / 850);
    displayCounts(1 - (1 - t) ** 3);
    countFrame = t < 1 ? requestAnimationFrame(tick) : 0;
  }
  countFrame = requestAnimationFrame(tick);
}

function applyLanguage(lang) {
  document.documentElement.lang = lang;
  for (const item of translations) {
    if (item.attribute) item.element.setAttribute(item.attribute, item[lang]);
    else if (item.visible) {
      item.visible.textContent = item[lang];
      item.visible.parentElement.dataset.reserve = lang === 'tr' ? item.en : item.tr;
    } else item.element.textContent = item[lang];
  }
  numberFormat = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'tr-TR');
  finishCounts();
  for (const counter of counters) {
    counter.setAttribute('aria-label', numberFormat.format(Number(counter.dataset.count)));
    counter.firstElementChild.setAttribute('aria-hidden', 'true');
  }
  invalidate();
}

let requestedLanguage = document.documentElement.lang;
let languageTimer;

function finishLanguageSwitch() {
  clearTimeout(languageTimer);
  if (document.documentElement.lang !== requestedLanguage) applyLanguage(requestedLanguage);
  document.documentElement.classList.remove('changing-language');
}

function selectLanguage(lang) {
  if (lang === requestedLanguage) return;
  requestedLanguage = lang;
  languageButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === lang)));
  if (reducedMotion.matches || lang === document.documentElement.lang) {
    finishLanguageSwitch();
    return;
  }
  document.documentElement.classList.add('changing-language');
  languageTimer = setTimeout(finishLanguageSwitch, 120);
}

languageButtons.forEach(button => button.addEventListener('click', () => selectLanguage(button.dataset.lang)));
window.addEventListener('scroll', scheduleScroll, {passive: true});
window.addEventListener('resize', invalidate);
window.addEventListener('load', invalidate);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) finishLanguageSwitch();
  heroWindow.style.removeProperty('transform');
  heroProgress = lineProgress = -1;
  finishCounts();
  invalidate();
});
const layoutObserver = new ResizeObserver(invalidate);
layoutObserver.observe(document.querySelector('main'));
const statsObserver = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) {
    countUp();
    statsObserver.disconnect();
  }
}, {threshold: .2});
statsObserver.observe(stats);
document.addEventListener('visibilitychange', watchDisplay);
watchDisplay();
applyLanguage('tr');
