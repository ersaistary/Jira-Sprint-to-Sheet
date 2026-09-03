// app/lib/jira.ts
// Helper untuk mengambil task dari Jira Cloud REST API (read-only).
//
// Env yang dibutuhkan (.env.local):
//   JIRA_BASE_URL=https://komdigi.atlassian.net
//   JIRA_EMAIL=email-atlassian-kamu
//   JIRA_API_TOKEN=xxxx
//   JIRA_PROJECT_KEY=YANLIK

const BASE_URL = process.env.JIRA_BASE_URL;
const EMAIL = process.env.JIRA_EMAIL;
const API_TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY;


function requireBaseUrl(): string {
  if (!BASE_URL) {
    throw new Error('Env JIRA_BASE_URL belum diset di .env.local');
  }
  // buang trailing slash biar aman digabung
  return BASE_URL.replace(/\/+$/, '');
}

function authHeader(): string {
  if (!EMAIL || !API_TOKEN) {
    throw new Error('Env JIRA_EMAIL / JIRA_API_TOKEN belum diset di .env.local');
  }
  // Basic auth: base64(email:api_token) - standar Jira Cloud
  return 'Basic ' + Buffer.from(EMAIL + ':' + API_TOKEN).toString('base64');
}

type Sprint = { id: number; name: string; state: string; endDate?: string; startDate?: string };

const BOARD_ID = 15;

async function findBoardId(): Promise<number> {
  console.log('[Jira] Pakai board ID tetap: ' + BOARD_ID);
  return BOARD_ID;
}


async function getRecentClosedSprints(boardId: number): Promise<Sprint[]> {
  const sprints: Sprint[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const url =
      requireBaseUrl() +
      '/rest/agile/1.0/board/' +
      boardId +
      '/sprint?state=closed,active&startAt=' +
      startAt +
      '&maxResults=' +
      maxResults;
    const res = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error('Gagal mengambil daftar sprint: ' + res.status + ' ' + (await res.text()));
    }
    const data = await res.json();
    const batch = (data.values || []) as Sprint[];
    sprints.push(...batch);

    // Berhenti kalau sudah habis (isLast true, atau tidak ada lagi data,
    // atau startAt sudah melewati total)
    if (data.isLast === true) break;
    if (batch.length === 0) break;
    if (typeof data.total === 'number' && startAt + batch.length >= data.total) break;

    startAt += maxResults;
  }

  console.log('[Jira] Total sprint ditemukan: ' + sprints.length);

  // Urutkan paling baru duluan.
  // Prioritas: endDate -> kalau kosong pakai startDate -> kalau kosong taruh bawah.
  sprints.sort((a, b) => {
    const da = a.endDate || a.startDate || '';
    const db = b.endDate || b.startDate || '';
    const ta = da ? new Date(da).getTime() : 0;
    const tb = db ? new Date(db).getTime() : 0;
    return tb - ta;
  });

  console.log(
    '[Jira] 5 sprint terbaru:',
    sprints
      .slice(0, 5)
      .map((s) => s.name + '[' + s.state + ']')
      .join(', ')
  );

  return sprints;
}


// Untuk dropdown pemilihan sprint manual: 5 sprint terbaru saja (sudah disortir
// terbaru duluan oleh getRecentClosedSprints), cukup id/name/state ke browser.
export async function getRecentSprints(): Promise<
  { id: number; name: string; state: string }[]
> {
  const boardId = await findBoardId();
  const sprints = await getRecentClosedSprints(boardId);
  return sprints.slice(0, 5).map((s) => ({ id: s.id, name: s.name, state: s.state }));
}


type JiraIssue = {
  key: string;
  fields: {
    summary: string;
    status?: { name?: string };
    assignee?: { displayName?: string; name?: string } | null;
    created?: string;
    resolutiondate?: string | null;
    description?: any;
    priority?: { name?: string } | null;
    comment?: {
      comments?: { author?: { displayName?: string }; body?: any; created?: string }[];
    };
  };
};

// Ambil teks dari node description/comments (ADF) atau plain text
function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.type === 'text' && typeof node.text === 'string') return node.text;
  if (node.content && Array.isArray(node.content)) {
    let out = '';
    for (let i = 0; i < node.content.length; i++) {
      const child = node.content[i];
      if (
        child.type === 'paragraph' ||
        child.type === 'heading' ||
        child.type === 'listItem' ||
        child.type === 'bulletList' ||
        child.type === 'orderedList' ||
        child.type === 'blockquote'
      ) {
        out += '\n';
      }
      out += extractText(child);
    }
    return out;
  }
  return '';
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // contoh hasil: 14-Jul-2026
  return d
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-');
}

async function searchIssues(jql: string): Promise<JiraIssue[]> {
  const all: JiraIssue[] = [];
  const maxResults = 50;
  let nextPageToken: string | undefined = undefined;

  while (true) {
    // Endpoint baru /rest/api/3/search/jql:
    // - pagination pakai nextPageToken (BUKAN startAt)
    // - respons punya flag "isLast"
    const bodyObj: any = {
      jql: jql,
      maxResults: maxResults,
      fields: [
        'summary',
        'status',
        'assignee',
        'reporter',
        'created',
        'resolutiondate',
        'description',
        'priority',
        'comment',
      ],
    };
    if (nextPageToken) {
      bodyObj.nextPageToken = nextPageToken;
    }

    const url = requireBaseUrl() + '/rest/api/3/search/jql';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyObj),
    });

    if (!res.ok) {
      throw new Error('Jira API error ' + res.status + ': ' + (await res.text()));
    }

    const data = await res.json();
    const issues: JiraIssue[] = data.issues || [];
    all.push(...issues);

    if (data.isLast || !data.nextPageToken || issues.length === 0) break;
    nextPageToken = data.nextPageToken;
  }

  return all;
}


/**
 * Ambil issue dari SATU sprint by ID + render jadi satu blok teks
 * (format mirip export Jira per-issue). Dipakai ulang oleh
 * fetchRecentSprintIssues dan fetchIssuesBySprintIds.
 */
async function fetchIssuesFromSprint(sprint: Sprint): Promise<string> {
  console.log(
    '[Jira] Mengambil issue dari sprint "' + sprint.name + '" (' + sprint.state + ')...'
  );
  const jql =
    'project = ' + PROJECT_KEY + ' AND sprint = ' + sprint.id + ' ORDER BY created ASC';
  const issues = await searchIssues(jql);
  console.log('[Jira] Sprint "' + sprint.name + '": ' + issues.length + ' issue');

  const parts: string[] = [];
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const f = issue.fields;

    let commentsText = '';
    const comments = (f.comment && f.comment.comments) ?? [];
    for (let c = 0; c < comments.length; c++) {
      const author = comments[c]?.author?.displayName || '?';
      const body = extractText(comments[c].body).trim();
      if (body.length > 3) {
        commentsText += '[' + author + ']: ' + body + '\n';
      }
    }

    let block = '';
    block += 'Task: [' + issue.key + '] ' + f.summary + '\n';
    block += 'Status: ' + ((f.status && f.status.name) || '') + '\n';
    block += 'Created: ' + formatDate(f.created) + '\n';
    if (f.resolutiondate) {
      block += 'Resolved: ' + formatDate(f.resolutiondate) + '\n';
    }
    const assigneeName =
      (f.assignee && (f.assignee.displayName || f.assignee.name)) || 'Unassigned';
    block += 'Assignee: ' + assigneeName + '\n';
    block += 'Priority: ' + ((f.priority && f.priority.name) || '') + '\n';
    if (f.description) {
      block += 'Description:\n' + extractText(f.description).trim() + '\n';
    }
    if (commentsText.trim()) {
      block += 'Comments:\n' + commentsText.trim() + '\n';
    }

    parts.push(block.trim());
  }

  return parts.join('\n\n');
}

// Cari objek sprint lengkap berdasarkan ID dari daftar 5 sprint terbaru.
// Kalau ID tidak ada di daftar (mis. sprint terlalu lama), tetap bisa dipakai —
// cukup dibungkus jadi objek minimal.
async function resolveSprintsByIds(sprintIds: number[]): Promise<Sprint[]> {
  const all = await getRecentClosedSprints(await findBoardId());
  const resolved: Sprint[] = [];
  for (let i = 0; i < sprintIds.length; i++) {
    const found = all.find((s) => s.id === sprintIds[i]);
    if (found) {
      resolved.push(found);
    } else {
      // Sprint ada di Jira tapi tidak masuk 5 terbaru — tetap coba ambil issue-nya
      resolved.push({ id: sprintIds[i], name: 'Sprint ' + sprintIds[i], state: 'unknown' });
    }
  }
  return resolved;
}

/**
 * Ambil issue dari sprint-sprint tertentu (by ID, max 2) + render jadi teks.
 * Untuk mode pemilihan sprint manual di UI.
 */
export async function fetchIssuesBySprintIds(sprintIds: number[]): Promise<string> {
  if (sprintIds.length === 0 || sprintIds.length > 2) {
    throw new Error('Pilih 1 atau 2 sprint saja.');
  }

  const sprints = await resolveSprintsByIds(sprintIds);
  console.log(
    '[Jira] Sprint terpilih (manual): ' +
      sprints.map((sp) => sp.name + ' (id=' + sp.id + ')').join(', ')
  );

  const parts: string[] = [];
  for (let i = 0; i < sprints.length; i++) {
    parts.push(await fetchIssuesFromSprint(sprints[i]));
  }

  const result = parts.join('\n\n');
  console.log(
    '[Jira] Total teks terkumpul: ' + result.length + ' karakter dari ' + sprints.length + ' sprint'
  );
  return result;
}

/**
 * Ambil issue dari N sprint terakhir + render jadi teks ringkas
 * yang siap diproses AI (format mirip export Jira per-issue).
 */
export async function fetchRecentSprintIssues(sprintCount: number = 2): Promise<string> {
  const boardId = await findBoardId();
  const sprints = (await getRecentClosedSprints(boardId)).slice(0, sprintCount);
  console.log(
    '[Jira] Sprint terpilih: ' + sprints.map((sp) => sp.name + ' (id=' + sp.id + ')').join(', ')
  );

  if (sprints.length === 0) {
    throw new Error('Tidak ada sprint closed yang ditemukan pada board ini.');
  }

  const parts: string[] = [];
  for (let s = 0; s < sprints.length; s++) {
    parts.push(await fetchIssuesFromSprint(sprints[s]));
  }

  const result = parts.join('\n\n');
  console.log(
    '[Jira] Total teks terkumpul: ' + result.length + ' karakter dari ' + sprints.length + ' sprint'
  );
  return result;
}
