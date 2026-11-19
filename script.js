'use strict';

const hero = document.querySelector('.hero-stage');
const heroWindow = document.querySelector('.hero-window');
const pin = document.querySelector('.pinned');
const steps = [...document.querySelectorAll('.steps article')];
const screens = [...document.querySelectorAll('.screens img')];
const viewLinks = [...document.querySelectorAll('.views a')];
const pipeline = document.querySelector('.pipeline');
const segments = [...pipeline.children].slice(0, -1);
const stats = document.querySelector('.stats');
const counters = [...stats.querySelectorAll('[data-count]')];
const languageButtons = document.querySelectorAll('[data-lang]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = n => Math.min(1, Math.max(0, n));
const translations = [];

// Keep both languages with their content in the HTML.
for (const [selector, dataKey, attribute] of [
  ['[data-en]', 'en', null],
  ['[data-alt-en]', 'altEn', 'alt'],
  ['[data-label-en]', 'labelEn', 'aria-label'],
  ['[data-content-en]', 'contentEn', 'content']
]) {
  for (const element of document.querySelectorAll(selector)) {
    translations.push({ element, attribute, en: element.dataset[dataKey],
      tr: attribute ? element.getAttribute(attribute) : element.textContent });
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
  if (needsMeasure) measure();
  const y = window.scrollY;
  const {height, heroEnd, centers, readingOffset, pipeTop, pipeHeight} = dimensions;
  const readingPoint = y + readingOffset;
  let nearest = 0;
  centers.forEach((center, i) => {
    if (Math.abs(center - readingPoint) < Math.abs(centers[nearest] - readingPoint)) nearest = i;
  });
  showView(nearest);

  if (reducedMotion.matches) return;
  const progress = clamp(y / Math.max(1, heroEnd));
  if (progress !== heroProgress) {
    const tilt = 1 - progress;
    heroWindow.style.transform = `rotateX(${24 * tilt}deg) rotateY(${-4 * tilt}deg) rotateZ(${-tilt}deg) scale(${1 - .055 * tilt})`;
    heroProgress = progress;
  }
  const draw = clamp((y + height * .9 - pipeTop) / (pipeHeight + height * .18));
  if (draw !== lineProgress) {
    segments.forEach((segment, i) => segment.style.setProperty('--draw', clamp(draw * segments.length - i)));
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
    else item.element.textContent = item[lang];
  }
  languageButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === lang)));
  numberFormat = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'tr-TR');
  finishCounts();
  for (const counter of counters) {
    counter.setAttribute('aria-label', numberFormat.format(Number(counter.dataset.count)));
    counter.firstElementChild.setAttribute('aria-hidden', 'true');
  }
  invalidate();
}

languageButtons.forEach(button => button.addEventListener('click', () => applyLanguage(button.dataset.lang)));
window.addEventListener('scroll', scheduleScroll, {passive: true});
window.addEventListener('resize', invalidate);
window.addEventListener('load', invalidate);
reducedMotion.addEventListener('change', () => {
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
applyLanguage('tr');
