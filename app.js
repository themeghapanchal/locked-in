window.onerror = function(msg, src, line, col, err) {
  document.body.style.padding = '20px';
  document.body.innerHTML = '<div style="color:#ff6b6b;font-family:monospace;font-size:14px;word-break:break-all;white-space:pre-wrap"><b>JS ERROR</b><br>' + msg + '<br>Line ' + line + ':' + col + '<br>' + (err ? err.stack : '') + '</div>';
};

const STORAGE_KEY = 'plannerData';

const DEFAULT_GOALS = [
  { id: 'movie', name: 'Work on movie', color: '#f97316', subtasks: [], lastFocusedDate: null },
  { id: 'ar-menu', name: 'Build AR menu prototype', color: '#3b82f6', subtasks: [], lastFocusedDate: null },
  { id: 'jobs', name: 'Find and apply for jobs', color: '#10b981', subtasks: [], lastFocusedDate: null },
  { id: 'portfolio', name: 'Build animation portfolio', color: '#ec4899', subtasks: [], lastFocusedDate: null },
  { id: 'design-clients', name: 'Find design clients', color: '#a855f7', subtasks: [], lastFocusedDate: null },
  { id: 'storybook', name: 'Illustrate bedtime storybook', color: '#eab308', subtasks: [], lastFocusedDate: null },
  { id: 'cookbook', name: 'Illustrate cookbook', color: '#06b6d4', subtasks: [], lastFocusedDate: null },
];

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const goals = (parsed.goals || DEFAULT_GOALS).map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        subtasks: (g.subtasks || []).map((s) => ({
          id: s.id,
          text: s.text,
          completed: !!s.completed,
          completedAt: s.completedAt || null,
        })),
        lastFocusedDate: g.lastFocusedDate || null,
      }));
      let dailyFocus = parsed.dailyFocus || {};
      if (!parsed.dailyFocus && parsed.dailyPicks) {
        // migrate from older version that picked individual subtasks per day
        Object.entries(parsed.dailyPicks).forEach(([date, picks]) => {
          if (picks && picks.length > 0) dailyFocus[date] = picks[0].goalId;
        });
      }
      return {
        goals,
        dailyFocus,
        dailyDone: Array.isArray(parsed.dailyDone) ? parsed.dailyDone : [],
        habits: parsed.habits || [],
        checkins: parsed.checkins || {},
        todos: (parsed.todos || []).map((t) => ({
          id: t.id,
          text: t.text,
          done: !!t.done,
        })),
      };
    } catch (e) {
      console.error('Failed to load data', e);
    }
  }
  return {
    goals: JSON.parse(JSON.stringify(DEFAULT_GOALS)),
    dailyFocus: {},
    dailyDone: [],
    habits: [],
    checkins: {},
    todos: [],
  };
}

let data = loadData();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function todayStr() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function dateStrOffset(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------------- Header ---------------- */
const HEADER_TITLES = {
  today: 'Today',
  goals: 'Your Goals',
  habits: 'Habits',
  progress: 'This Week',
  todos: 'To-do',
};

function renderHeader(view) {
  document.getElementById('header-title').textContent = HEADER_TITLES[view] || 'Today';
  const now = new Date();
  document.getElementById('header-date').textContent = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/* ---------------- Navigation ---------------- */
function setView(view) {
  document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach((el) => el.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelector('.nav-pill[data-view="' + view + '"]').classList.add('active');

  renderHeader(view);

  if (view === 'today') renderToday();
  if (view === 'goals') renderGoals();
  if (view === 'habits') renderHabits();
  if (view === 'progress') renderProgress();
  if (view === 'todos') renderTodos();
}

document.querySelectorAll('.nav-pill').forEach(function(btn) {
  btn.addEventListener('click', function() { setView(btn.dataset.view); });
});

/* ---------------- Today view ---------------- */
function getCandidateGoals() {
  return data.goals.filter((g) => (g.subtasks || []).some((s) => !s.completed));
}

function byLastFocused(a, b) {
  const da = a.lastFocusedDate || '';
  const db = b.lastFocusedDate || '';
  if (da < db) return -1;
  if (da > db) return 1;
  return 0;
}

function ensureTodayFocus() {
  const today = todayStr();
  const current = data.dailyFocus[today];

  if (current && data.goals.some((g) => g.id === current)) {
    return; // already set for today, even if since completed
  }

  const candidates = getCandidateGoals().sort(byLastFocused);
  if (candidates.length > 0) {
    const goal = candidates[0];
    data.dailyFocus[today] = goal.id;
    goal.lastFocusedDate = today;
  } else {
    delete data.dailyFocus[today];
  }
  save();
}

function changeFocus() {
  const today = todayStr();
  const candidates = getCandidateGoals()
    .filter((g) => g.id !== data.dailyFocus[today])
    .sort(byLastFocused);
  if (candidates.length === 0) return false;

  const goal = candidates[0];
  data.dailyFocus[today] = goal.id;
  goal.lastFocusedDate = today;
  save();
  return true;
}

function renderToday() {
  ensureTodayFocus();
  document.getElementById('today-streak-number').textContent = calcDayStreak();

  const container = document.getElementById('today-tasks');
  container.innerHTML = '';

  const today = todayStr();
  const goalId = data.dailyFocus[today];
  const goal = data.goals.find((g) => g.id === goalId);
  const doneToday = data.dailyDone.includes(today);

  if (!goal) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Add some steps to your goals (Goals tab) and they’ll show up here.';
    container.appendChild(empty);
    return;
  }

  const banner = document.createElement('div');
  banner.className = 'focus-banner';
  banner.style.borderLeftColor = goal.color;
  banner.textContent = `Today’s focus: ${goal.name}`;
  container.appendChild(banner);

  if (doneToday) {
    const cel = document.createElement('div');
    cel.className = 'celebration-card';
    const title = document.createElement('div');
    title.className = 'celebration-title';
    title.textContent = '🎉 You’re done for today!';
    const sub = document.createElement('div');
    sub.className = 'celebration-sub';
    sub.textContent = 'Nice work. Go enjoy your evening.';
    cel.append(title, sub);
    container.appendChild(cel);

    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn-skip change-focus-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', () => {
      data.dailyDone = data.dailyDone.filter((d) => d !== today);
      save();
      renderToday();
    });
    container.appendChild(undoBtn);
    return;
  }

  const subtasks = (goal.subtasks || []).filter((s) => !s.completed);
  if (subtasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'This goal has no steps left. Add some in the Goals tab.';
    container.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'today-step-list';
    subtasks.forEach((sub) => {
      const item = document.createElement('div');
      item.className = 'today-step';
      const bullet = document.createElement('span');
      bullet.className = 'today-step-bullet';
      bullet.textContent = '•';
      const text = document.createElement('div');
      text.className = 'today-step-text';
      text.textContent = sub.text;
      item.append(bullet, text);
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn-done-today';
  doneBtn.textContent = '✓ Done for today';
  doneBtn.addEventListener('click', () => {
    if (!data.dailyDone.includes(today)) {
      data.dailyDone.push(today);
      save();
    }
    renderToday();
  });
  container.appendChild(doneBtn);

  const changeBtn = document.createElement('button');
  changeBtn.className = 'btn-skip change-focus-btn';
  changeBtn.textContent = 'Change focus for today';
  changeBtn.addEventListener('click', () => {
    if (changeFocus()) renderToday();
  });
  container.appendChild(changeBtn);
}

/* ---------------- Goals view ---------------- */
const expandedGoals = new Set();

function countFocusDays(goalId) {
  return Object.values(data.dailyFocus).filter((id) => id === goalId).length;
}

function renderGoals() {
  const listEl = document.getElementById('goal-list');
  listEl.innerHTML = '';

  if (data.goals.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No goals yet. Add the big things you want to achieve above.';
    listEl.appendChild(empty);
    return;
  }

  data.goals.forEach((goal) => {
    const subtasks = goal.subtasks || [];
    const subtasksDone = subtasks.filter((s) => s.completed).length;
    const isOpen = expandedGoals.has(goal.id);

    const card = document.createElement('div');
    card.className = 'goal-card';
    card.style.borderLeftColor = goal.color;

    // --- Header row (always visible) ---
    const header = document.createElement('div');
    header.className = 'goal-header';
    header.style.cursor = 'pointer';

    const dot = document.createElement('span');
    dot.className = 'goal-dot';
    dot.style.background = goal.color;

    const name = document.createElement('div');
    name.className = 'goal-name';
    name.textContent = goal.name;

    const meta = document.createElement('div');
    meta.className = 'goal-meta';
    if (subtasks.length > 0) {
      meta.textContent = subtasksDone === subtasks.length
        ? '🎉'
        : `${subtasksDone}/${subtasks.length}`;
    }

    const chevron = document.createElement('span');
    chevron.className = 'goal-chevron';
    chevron.textContent = isOpen ? '▾' : '▸';

    const del = document.createElement('button');
    del.className = 'goal-delete';
    del.textContent = '✕';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      data.goals = data.goals.filter((g) => g.id !== goal.id);
      save();
      renderGoals();
    });

    header.append(dot, name, meta, chevron, del);
    card.appendChild(header);

    // --- Collapsible body ---
    const body = document.createElement('div');
    body.className = 'goal-body' + (isOpen ? ' open' : '');

    if (subtasks.length > 0) {
      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      const fill = document.createElement('div');
      fill.className = 'progress-fill';
      fill.style.width = `${(subtasksDone / subtasks.length) * 100}%`;
      bar.appendChild(fill);
      body.appendChild(bar);
    }

    const subtaskList = document.createElement('div');
    subtaskList.className = 'subtask-list';
    subtasks.forEach((sub) => subtaskList.appendChild(renderSubtaskItem(goal, sub)));
    body.appendChild(subtaskList);

    const form = document.createElement('form');
    form.className = 'add-form subtask-form';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add a step...';
    input.autocomplete = 'off';
    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.className = 'btn-add';
    addBtn.textContent = '+';
    form.append(input, addBtn);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      goal.subtasks = goal.subtasks || [];
      goal.subtasks.push({ id: uid(), text, completed: false, completedAt: null });
      expandedGoals.add(goal.id);
      save();
      renderGoals();
    });
    body.appendChild(form);

    card.appendChild(body);

    header.addEventListener('click', () => {
      if (expandedGoals.has(goal.id)) expandedGoals.delete(goal.id);
      else expandedGoals.add(goal.id);
      renderGoals();
    });

    listEl.appendChild(card);
  });
}

function renderSubtaskItem(goal, sub) {
  const item = document.createElement('div');
  item.className = 'subtask-item' + (sub.completed ? ' completed' : '');

  const check = document.createElement('button');
  check.className = 'subtask-check';
  check.textContent = sub.completed ? '✓' : '';
  check.addEventListener('click', () => {
    sub.completed = !sub.completed;
    sub.completedAt = sub.completed ? todayStr() : null;
    save();
    renderGoals();
  });

  const text = document.createElement('div');
  text.className = 'subtask-text';
  text.textContent = sub.text;

  const del = document.createElement('button');
  del.className = 'subtask-delete';
  del.textContent = '✕';
  del.addEventListener('click', () => {
    goal.subtasks = goal.subtasks.filter((s) => s.id !== sub.id);
    save();
    renderGoals();
  });

  item.append(check, text, del);
  return item;
}

document.getElementById('goal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('goal-input');
  const name = input.value.trim();
  if (!name) return;
  const color = document.getElementById('goal-color').value;
  data.goals.push({ id: uid(), name, color, subtasks: [], lastFocusedDate: null });
  save();
  input.value = '';
  renderGoals();
});

/* ---------------- Habits view ---------------- */
function calcStreak(habit) {
  let streak = 0;
  const start = habit.completedDates.includes(todayStr()) ? 0 : 1;
  let i = start;
  while (habit.completedDates.includes(dateStrOffset(i))) {
    streak++;
    i++;
  }
  return streak;
}

function renderHabits() {
  const listEl = document.getElementById('habit-list');
  listEl.innerHTML = '';

  if (data.habits.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No habits yet. Add one to start a streak.';
    listEl.appendChild(empty);
    return;
  }

  const today = todayStr();

  data.habits.forEach((habit) => {
    const item = document.createElement('div');
    item.className = 'habit-item';

    const info = document.createElement('div');
    info.className = 'habit-info';

    const name = document.createElement('div');
    name.className = 'habit-name';
    name.textContent = habit.name;

    const streak = document.createElement('div');
    streak.className = 'habit-streak';
    const streakCount = calcStreak(habit);
    streak.textContent = streakCount > 0 ? `🔥 ${streakCount} day streak` : 'No streak yet';

    info.append(name, streak);

    const doneToday = habit.completedDates.includes(today);
    const toggle = document.createElement('button');
    toggle.className = 'habit-toggle' + (doneToday ? ' done' : '');
    toggle.textContent = doneToday ? '✓' : '';
    toggle.addEventListener('click', () => {
      if (habit.completedDates.includes(today)) {
        habit.completedDates = habit.completedDates.filter((d) => d !== today);
      } else {
        habit.completedDates.push(today);
      }
      save();
      renderHabits();
    });

    const del = document.createElement('button');
    del.className = 'habit-delete';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      data.habits = data.habits.filter((h) => h.id !== habit.id);
      save();
      renderHabits();
    });

    item.append(info, toggle, del);
    listEl.appendChild(item);
  });
}

document.getElementById('habit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('habit-input');
  const name = input.value.trim();
  if (!name) return;
  data.habits.push({ id: uid(), name, completedDates: [] });
  save();
  input.value = '';
  renderHabits();
});

/* ---------------- Progress view ---------------- */
function dayHasActivity(dateStr) {
  const doneFlagged = data.dailyDone.includes(dateStr);
  const stepDone = data.goals.some((g) => (g.subtasks || []).some((s) => s.completedAt === dateStr));
  const habitDone = data.habits.some((h) => h.completedDates.includes(dateStr));
  const checkin = !!data.checkins[dateStr];
  return doneFlagged || stepDone || habitDone || checkin;
}

function calcDayStreak() {
  let streak = 0;
  let i = dayHasActivity(todayStr()) ? 0 : 1;
  while (dayHasActivity(dateStrOffset(i))) {
    streak++;
    i++;
  }
  return streak;
}

function renderWeekStrip() {
  const strip = document.getElementById('week-strip');
  strip.innerHTML = '';
  const today = todayStr();

  for (let i = 6; i >= 0; i--) {
    const dateStr = dateStrOffset(i);
    const d = new Date(dateStr + 'T00:00:00');

    const dayEl = document.createElement('div');
    dayEl.className = 'week-day' + (dateStr === today ? ' today' : '');

    const label = document.createElement('div');
    label.className = 'week-day-label';
    label.textContent = d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);

    const dot = document.createElement('div');
    dot.className = 'week-day-dot' + (dayHasActivity(dateStr) ? ' active' : '');

    dayEl.append(label, dot);
    strip.appendChild(dayEl);
  }
}

const MOOD_EMOJI = { 1: '😩', 2: '😕', 3: '😐', 4: '🙂', 5: '🤩' };

function getWeekDates() {
  const dates = [];
  for (let i = 6; i >= 0; i--) dates.push(dateStrOffset(i));
  return dates;
}

function summaryRow(label, value) {
  const row = document.createElement('div');
  row.className = 'summary-row';
  const l = document.createElement('span');
  l.className = 'label';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'value';
  v.textContent = value;
  row.append(l, v);
  return row;
}

function renderWeeklySummary() {
  const weekDates = getWeekDates();
  const card = document.getElementById('weekly-summary');
  card.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'summary-title';
  title.textContent = '📅 Last 7 days';
  card.appendChild(title);

  const stepsCompleted = data.goals.reduce(
    (sum, g) => sum + (g.subtasks || []).filter((s) => s.completedAt && weekDates.includes(s.completedAt)).length,
    0
  );
  card.appendChild(summaryRow('Steps completed', `${stepsCompleted}`));

  const activeDays = weekDates.filter((d) => dayHasActivity(d)).length;
  card.appendChild(summaryRow('Active days', `${activeDays} / 7`));

  const moods = weekDates.map((d) => data.checkins[d] && data.checkins[d].mood).filter((m) => m);
  if (moods.length) {
    const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
    card.appendChild(summaryRow('Avg. mood', `${MOOD_EMOJI[Math.round(avg)] || ''} ${avg.toFixed(1)} / 5`));
  }

  // Per-goal focus time this week
  data.goals.forEach((goal) => {
    const focusDays = weekDates.filter((d) => data.dailyFocus[d] === goal.id).length;
    const stepsDone = (goal.subtasks || []).filter((s) => s.completedAt && weekDates.includes(s.completedAt)).length;
    if (focusDays === 0 && stepsDone === 0) return;
    card.appendChild(summaryRow(goal.name, `${focusDays} day${focusDays === 1 ? '' : 's'} · ${stepsDone} step${stepsDone === 1 ? '' : 's'}`));
  });

  // Where you slacked
  const slacks = [];
  data.goals.forEach((goal) => {
    const hasIncomplete = (goal.subtasks || []).some((s) => !s.completed);
    if (!hasIncomplete) return;
    const focusDays = weekDates.filter((d) => data.dailyFocus[d] === goal.id).length;
    if (focusDays === 0) {
      slacks.push(`${goal.name}: no focus time this week`);
    }
  });
  data.habits.forEach((habit) => {
    const count = weekDates.filter((d) => habit.completedDates.includes(d)).length;
    if (count < 4) {
      slacks.push(`${habit.name}: done ${count}/7 days`);
    }
  });

  const slackSection = document.createElement('div');
  slackSection.className = 'slack-section';
  const slackTitle = document.createElement('div');
  slackTitle.className = 'slack-title';
  slackTitle.textContent = slacks.length ? '⚠️ Where you slacked' : '✅ Solid week';
  slackSection.appendChild(slackTitle);

  if (slacks.length) {
    slacks.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'slack-item';
      item.textContent = '• ' + s;
      slackSection.appendChild(item);
    });
  } else {
    const item = document.createElement('div');
    item.className = 'slack-good';
    item.textContent = 'You stayed on track across your goals and habits this week. Keep it up!';
    slackSection.appendChild(item);
  }
  card.appendChild(slackSection);
}

let selectedMood = 0;

function renderProgress() {
  document.getElementById('streak-number').textContent = calcDayStreak();
  renderWeekStrip();
  renderWeeklySummary();

  const today = todayStr();
  const todaysSteps = data.goals.reduce(
    (sum, g) => sum + (g.subtasks || []).filter((s) => s.completedAt === today).length,
    0
  );
  const habitsDone = data.habits.filter((h) => h.completedDates.includes(today)).length;

  const summary = document.getElementById('checkin-summary');
  summary.innerHTML = '';
  const l1 = document.createElement('div');
  l1.textContent = `✅ Steps completed today: ${todaysSteps}`;
  const l2 = document.createElement('div');
  l2.textContent = `🔥 Habits done today: ${habitsDone} / ${data.habits.length}`;
  summary.append(l1, l2);

  const existing = data.checkins[today];
  selectedMood = existing ? existing.mood : 0;
  document.getElementById('checkin-wins').value = existing ? existing.wins : '';
  document.getElementById('checkin-challenges').value = existing ? existing.challenges : '';
  document.getElementById('checkin-tomorrow').value = existing ? existing.tomorrow : '';

  document.querySelectorAll('.mood-btn').forEach((btn) => {
    btn.classList.toggle('selected', Number(btn.dataset.mood) === selectedMood);
  });

  document.getElementById('checkin-saved-msg').textContent = existing
    ? `Saved at ${new Date(existing.savedAt).toLocaleTimeString()}`
    : '';
}

document.querySelectorAll('.mood-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedMood = Number(btn.dataset.mood);
    document.querySelectorAll('.mood-btn').forEach((b) => b.classList.toggle('selected', b === btn));
  });
});

document.getElementById('checkin-save').addEventListener('click', () => {
  const today = todayStr();
  data.checkins[today] = {
    mood: selectedMood,
    wins: document.getElementById('checkin-wins').value.trim(),
    challenges: document.getElementById('checkin-challenges').value.trim(),
    tomorrow: document.getElementById('checkin-tomorrow').value.trim(),
    savedAt: Date.now(),
  };
  save();
  document.getElementById('checkin-saved-msg').textContent = 'Saved!';
  document.getElementById('streak-number').textContent = calcDayStreak();
  renderWeekStrip();
  renderWeeklySummary();
});

/* ---------------- To-do view ---------------- */
function renderTodos() {
  const listEl = document.getElementById('todo-list');
  listEl.innerHTML = '';

  if (data.todos.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No reminders yet. Add quick things you need to remember.';
    listEl.appendChild(empty);
    return;
  }

  data.todos.forEach((todo) => {
    const item = document.createElement('div');
    item.className = 'todo-item' + (todo.done ? ' completed' : '');

    const check = document.createElement('button');
    check.className = 'todo-check';
    check.textContent = todo.done ? '✓' : '';
    check.addEventListener('click', () => {
      todo.done = !todo.done;
      save();
      renderTodos();
    });

    const text = document.createElement('div');
    text.className = 'todo-text';
    text.textContent = todo.text;

    const del = document.createElement('button');
    del.className = 'todo-delete';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      data.todos = data.todos.filter((t) => t.id !== todo.id);
      save();
      renderTodos();
    });

    item.append(check, text, del);
    listEl.appendChild(item);
  });
}

document.getElementById('todo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('todo-input');
  const text = input.value.trim();
  if (!text) return;
  data.todos.push({ id: uid(), text, done: false });
  save();
  input.value = '';
  renderTodos();
});

/* ---------------- Init ---------------- */
renderHeader('today');
renderToday();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW registration failed', err));
  });
}
