(() => {
  'use strict';
  const stage = document.getElementById('shape-stage');
  const cube = document.getElementById('portfolio-cube');
  const faces = [...cube.querySelectorAll('[data-face]')];
  const labels = ['Projects', 'Experience', 'Education', 'Classic Map'];
  const position = document.getElementById('shape-position');
  let step = 0;
  let gesture = null;
  let suppressClick = false;
  const current = () => ((step % 4) + 4) % 4;

  function draw(offset = 0) {
    cube.style.transform = `rotateX(-14deg) rotateY(${-24 - step * 90 + offset}deg)`;
  }
  function turn(delta) {
    step += delta;
    draw();
    const index = current();
    faces.forEach((face, i) => { face.tabIndex = i === index ? 0 : -1; });
    position.innerHTML = `<span>0${index + 1} / 04</span> ${labels[index]}`;
    // Keep a keyboard user's focus on the face that is now in front.
    if (faces.includes(document.activeElement)) faces[index].focus({preventScroll: true});
  }
  document.getElementById('shape-prev').addEventListener('click', () => turn(-1));
  document.getElementById('shape-next').addEventListener('click', () => turn(1));
  stage.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      turn(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      step = 0;
      turn(0);
    }
  });
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    gesture = {id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dragging: false};
  });
  stage.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy)) {
      gesture.dragging = true;
      stage.setPointerCapture(event.pointerId);
      cube.classList.add('is-dragging');
    }
    if (gesture.dragging) {
      gesture.dx = dx;
      draw(Math.max(-100, Math.min(100, dx * .42)));
    }
  });
  function release(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const {dragging, dx} = gesture;
    gesture = null;
    cube.classList.remove('is-dragging');
    if (dragging) {
      suppressClick = true;
      turn(Math.abs(dx) > 40 ? (dx < 0 ? 1 : -1) : 0);
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    }
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', event => {
    if (gesture && gesture.id === event.pointerId) {
      gesture = null;
      cube.classList.remove('is-dragging');
      draw();
    }
  });
  stage.addEventListener('dragstart', event => event.preventDefault());
  stage.addEventListener('click', event => {
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
    }
  }, true);

  const names = {home: 'Electrical Engineering', education: 'Education', projects: 'Projects', internships: 'Experience'};
  function route() {
    const raw = location.hash.slice(1) || 'home';
    // Old links to individual graph nodes still open the preserved Classic Map.
    if (raw.startsWith('home/')) {
      location.replace(`map.html#${raw}`);
      return;
    }
    const page = Object.hasOwn(names, raw) ? raw : 'home';
    document.querySelectorAll('.screen').forEach(section => { section.hidden = section.id !== page; });
    document.title = `Vishnu Athreya — ${names[page]}`;
    const target = raw === 'about' ? document.getElementById('about-heading') : document.querySelector(`#${page} h1`);
    target.tabIndex = -1;
    target.focus({preventScroll: true});
    if (raw === 'about') document.getElementById('about').scrollIntoView();
    else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  turn(0);
  route();
})();
