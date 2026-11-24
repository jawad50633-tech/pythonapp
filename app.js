
let course = null;
let currentIndex = 0;
let pyodide = null;
let pyodidePromise = null;

const completed = new Set(
  JSON.parse(localStorage.getItem('py-learning-completed') || '[]')
);

const $ = id => document.getElementById(id);
const isMobileNav = () => window.matchMedia('(max-width: 760px)').matches;

function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebarBackdrop').classList.remove('visible');
  $('menuBtn').setAttribute('aria-expanded', 'false');
  document.body.classList.remove('sidebar-open');
}

function toggleSidebar() {
  const opening = !$('sidebar').classList.contains('open');

  if (opening) {
    $('sidebar').classList.add('open');
    $('sidebarBackdrop').classList.add('visible');
    $('menuBtn').setAttribute('aria-expanded', 'true');
    document.body.classList.add('sidebar-open');
  } else {
    closeSidebar();
  }
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function sectionGroups() {
  const groups = new Map();

  course.lessons.forEach((lesson, index) => {
    if (!groups.has(lesson.section)) {
      groups.set(lesson.section, []);
    }

    groups.get(lesson.section).push({
      ...lesson,
      index
    });
  });

  return groups;
}

function updateProgress() {
  const total = course.lessons.length;
  const done = completed.size;
  const pct = Math.round((done / total) * 100);

  $('progressText').textContent = pct + '%';
  $('progressBar').style.width = pct + '%';
  $('completedText').textContent =
    `${done} of ${total} lessons completed`;
}

function renderNav(filter = '') {
  const nav = $('lessonNav');
  nav.innerHTML = '';

  const q = filter.toLowerCase();

  for (const [section, items] of sectionGroups()) {
    const visible = items.filter(item =>
      (item.title + ' ' + item.section).toLowerCase().includes(q)
    );

    if (!visible.length) continue;

    const wrap = document.createElement('div');
    wrap.className = 'nav-section';

    const heading = document.createElement('div');
    heading.className = 'nav-section-title';
    heading.textContent = section;

    wrap.appendChild(heading);

    visible.forEach(item => {
      const button = document.createElement('button');

      button.className =
        'nav-lesson' +
        (item.index === currentIndex ? ' active' : '') +
        (completed.has(item.number) ? ' done' : '');

      button.innerHTML = `
        <span class="nav-number">
          ${completed.has(item.number) ? '✓' : item.number}
        </span>
        <span class="nav-name">${esc(item.title)}</span>
      `;

      button.addEventListener('click', () => {
        currentIndex = item.index;
        renderLesson();
        closeSidebar();
      });

      wrap.appendChild(button);
    });

    nav.appendChild(wrap);
  }

  if (!nav.children.length) {
    nav.innerHTML = '<div class="empty-state">No lessons found.</div>';
  }
}

function renderMarkdown(content) {
  const raw = window.marked
    ? marked.parse(content)
    : `<pre>${esc(content)}</pre>`;

  return window.DOMPurify
    ? DOMPurify.sanitize(raw)
    : raw;
}

function renderLesson() {
  const lesson = course.lessons[currentIndex];

  if (!lesson) return;

  $('crumbTitle').textContent = lesson.section;
  $('sectionPill').textContent = lesson.section.toUpperCase();

  $('lessonCount').textContent =
    `LESSON ${currentIndex + 1} OF ${course.lessons.length}`;

  $('lessonTitle').textContent = lesson.title;

  $('lessonSubtitle').textContent =
    lesson.number === 50
      ? 'Apply your Python skills in a complete capstone project.'
      : 'Work through the explanation, examples and exercises in this lesson.';

  const content = $('lessonContent');
  content.innerHTML = '';

  let codeIndex = 0;

  lesson.blocks.forEach(block => {
    if (block.type === 'markdown') {
      const div = document.createElement('div');
      div.className = 'markdown-block';
      div.innerHTML = renderMarkdown(block.content);
      content.appendChild(div);
    }

    else if (block.type === 'code') {
      codeIndex++;

      const card = document.createElement('section');
      card.className = 'code-card';

      card.innerHTML = `
        <div class="code-toolbar">
          <span class="code-label">
            PYTHON CODE · CELL ${codeIndex}
          </span>

          <div class="code-actions">
            <button class="small-btn reset-btn" type="button">
              Reset
            </button>

            <button class="small-btn run-btn" type="button">
              ▶ Run code
            </button>
          </div>
        </div>

        <textarea
          class="code-editor"
          spellcheck="false"
          aria-label="Python code editor"
        >${esc(block.content)}</textarea>

        <div class="output-wrap">
          <div class="output-head">
            <span>OUTPUT</span>
            <span class="output-state">NOT RUN</span>
          </div>

          <pre class="code-output">
Run this cell to see the result.
          </pre>
        </div>
      `;

      const editor = card.querySelector('textarea');
      const output = card.querySelector('.code-output');
      const state = card.querySelector('.output-state');

      card.querySelector('.run-btn').addEventListener('click', async () => {
        state.textContent = 'RUNNING';
        output.classList.remove('error');
        output.textContent = '';

        try {
          await ensurePyodide();

          const result = await executePython(editor.value);

          output.textContent = result ||
            '(Code executed successfully with no printed output.)';

          state.textContent = 'FINISHED';
        } catch (error) {
          output.textContent = error.message || String(error);
          output.classList.add('error');
          state.textContent = 'ERROR';
        }
      });

      card.querySelector('.reset-btn').addEventListener('click', () => {
        editor.value = block.content;
        output.textContent = 'Cell reset. Run it to see the result.';
        output.classList.remove('error');
        state.textContent = 'NOT RUN';
      });

      editor.addEventListener('keydown', event => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key === 'Enter'
        ) {
          event.preventDefault();
          card.querySelector('.run-btn').click();
        }

        if (event.key === 'Tab') {
          event.preventDefault();

          const start = editor.selectionStart;
          const end = editor.selectionEnd;

          editor.setRangeText('    ', start, end, 'end');
        }
      });

      content.appendChild(card);
    }
  });

  const isDone = completed.has(lesson.number);

  $('completeBtn').classList.toggle('done', isDone);

  $('completeBtn').textContent =
    isDone ? '✓ Completed' : '✓ Mark complete';

  $('prevBtn').disabled = currentIndex === 0;

  $('nextBtn').disabled =
    currentIndex === course.lessons.length - 1;

  $('nextBtn').textContent =
    currentIndex === course.lessons.length - 1
      ? 'Course complete'
      : 'Next lesson →';

  renderNav($('searchInput').value);
  updateProgress();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

async function ensurePyodide() {
  if (pyodide) return pyodide;
  if (pyodidePromise) return pyodidePromise;

  if (typeof loadPyodide !== 'function') {
    throw new Error(
      'Could not load Pyodide. Check your internet connection and reload the page.'
    );
  }

  setRuntime('Loading Python runtime…', false);

  $('runtimeDetail').textContent = 'Downloading Python runtime…';

  pyodidePromise = loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'
  })
    .then(p => {
      pyodide = p;

      pyodide.setStdin({
        stdin: () => {
          const value = window.prompt(
            'Python input() requested. Enter a value:'
          );

          return value === null
            ? null
            : new TextEncoder().encode(value + '\n');
        }
      });

      setRuntime('Python interpreter ready', true);

      $('runtimeDetail').textContent =
        'Python is running in your browser';

      $('loadRuntimeBtn').textContent =
        'Python runtime loaded';

      toast('Python interpreter is ready');

      return p;
    })
    .catch(error => {
      pyodidePromise = null;

      setRuntime('Interpreter failed to load', false);

      $('runtimeDetail').textContent =
        'Load failed — check your connection';

      throw error;
    });

  return pyodidePromise;
}

function setRuntime(text, ready) {
  $('runtimeStatus').classList.toggle('ready', ready);
  $('runtimeStatus').querySelector('span').textContent = text;
  $('runtimeDetail').textContent = text;
}

async function executePython(code) {
  if (/\bimport\s+tkinter|\bfrom\s+tkinter/i.test(code)) {
    throw new Error(
      'Tkinter is a desktop GUI library and is not supported inside a browser-based Python runtime. Run this code on a computer with desktop Python to open its window.'
    );
  }

  if (/\b(import|from)\s+pandas\b/.test(code)) {
    $('runtimeDetail').textContent = 'Loading pandas package…';
    await pyodide.loadPackage('pandas');
  }

  if (/\b(import|from)\s+numpy\b/.test(code)) {
    await pyodide.loadPackage('numpy');
  }

  let output = '';

  pyodide.setStdout({
    batched: text => {
      output += text + '\n';
    }
  });

  pyodide.setStderr({
    batched: text => {
      output += text + '\n';
    }
  });

  try {
    await pyodide.runPythonAsync(code);
  } catch (error) {
    throw new Error(String(error));
  } finally {
    $('runtimeDetail').textContent =
      'Python is running in your browser';
  }

  return output.trimEnd();
}

/* SIDEBAR INTERACTIONS */

function setupSidebar() {
  const sidebar = $('sidebar');
  const backdrop = $('sidebarBackdrop');
  const menuButton = $('menuBtn');

  menuButton.addEventListener('click', event => {
    event.stopPropagation();
    toggleSidebar();
  });

  backdrop.addEventListener('click', closeSidebar);

  // Close when clicking anywhere outside the sidebar on mobile.
  document.addEventListener('click', event => {
    if (!isMobileNav()) return;
    if (!sidebar.classList.contains('open')) return;

    const clickedInsideSidebar = sidebar.contains(event.target);
    const clickedMenuButton = menuButton.contains(event.target);

    if (!clickedInsideSidebar && !clickedMenuButton) {
      closeSidebar();
    }
  });

  // Close with Escape.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSidebar();
    }
  });

  // Close when switching back to desktop layout.
  window.addEventListener('resize', () => {
    if (!isMobileNav()) {
      closeSidebar();
    }
  });
}

async function init() {
  const response = await fetch('lessons.json');

  if (!response.ok) {
    throw new Error(
      'Could not load lessons.json. Keep all website files in the same folder.'
    );
  }

  course = await response.json();

  $('searchInput').addEventListener('input', event => {
    renderNav(event.target.value);
  });

  $('completeBtn').addEventListener('click', () => {
    const number = course.lessons[currentIndex].number;

    if (completed.has(number)) {
      completed.delete(number);
    } else {
      completed.add(number);
    }

    localStorage.setItem(
      'py-learning-completed',
      JSON.stringify([...completed])
    );

    renderLesson();

    toast(
      completed.has(number)
        ? 'Lesson marked complete'
        : 'Completion removed'
    );
  });

  $('prevBtn').addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderLesson();
    }
  });

  $('nextBtn').addEventListener('click', () => {
    if (currentIndex < course.lessons.length - 1) {
      currentIndex++;
      renderLesson();
    }
  });

  $('loadRuntimeBtn').addEventListener('click', () => {
    ensurePyodide().catch(error => toast(error.message));
  });

  setupSidebar();

  renderLesson();
}

init().catch(error => {
  $('lessonContent').innerHTML =
    `<div class="notice">${esc(error.message)}</div>`;
});
